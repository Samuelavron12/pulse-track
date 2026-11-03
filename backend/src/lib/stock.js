// Shared stock + sale logic. Used by POST /sales and by offline sync replay.
import { query } from '../db/index.js';

export const httpError = (message, status = 400) => Object.assign(new Error(message), { status });

/** Normalise a phone number to digits-only E.164-ish form for wa.me links (default country: Nigeria). */
export function normalizePhone(raw, defaultCc = '234') {
  if (!raw) return '';
  let d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d.slice(1).replace(/\D/g, '');
  d = d.replace(/\D/g, '');
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return defaultCc + d.slice(1);
  if (d.startsWith(defaultCc) && d.length >= 12) return d;
  if (d.length === 10) return defaultCc + d;       // 8012345678
  return d;
}

/**
 * Rule-based shortage check for ONE product after its stock changed.
 * Creates an out_of_stock / low_stock alert (once, until read) and clears
 * stale shortage alerts when the product has been restocked.
 */
export async function syncShortageAlert(client, bid, product, totalQty) {
  const qty = Number(totalQty);
  const level = Number(product.reorder_level ?? 5);
  const run = (sql, p) => client.query(sql, p);
  if (qty > level) {
    await run(`UPDATE alerts SET is_read=true WHERE business_id=$1 AND related_id=$2 AND type IN ('low_stock','out_of_stock') AND is_read=false`, [bid, product.id]);
    return;
  }
  const out = qty <= 0;
  const type = out ? 'out_of_stock' : 'low_stock';
  // upgrade low → out of stock: retire the old low-stock alert
  if (out) await run(`UPDATE alerts SET is_read=true WHERE business_id=$1 AND related_id=$2 AND type='low_stock' AND is_read=false`, [bid, product.id]);
  const exists = await run(`SELECT 1 FROM alerts WHERE business_id=$1 AND related_id=$2 AND type=$3 AND is_read=false`, [bid, product.id, type]);
  if (exists.rows[0]) return;
  await run(
    `INSERT INTO alerts (business_id,type,severity,title,message,related_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [bid, type, out ? 'critical' : 'warning',
     out ? `Out of stock: ${product.name}` : `Low stock: ${product.name}`,
     out ? `${product.name} has run out. Re-order from your supplier.` : `Only ${qty} left (reorder level ${level}).`,
     product.id]
  );
}

export async function totalQty(client, bid, productId) {
  const { rows } = await client.query('SELECT COALESCE(SUM(quantity),0)::float q FROM inventory WHERE business_id=$1 AND product_id=$2', [bid, productId]);
  return rows[0].q;
}

/**
 * Create a sale inside an open transaction.
 * opts.skipStock: historical imports record the sale without touching inventory.
 * opts.allowNegative: used when replaying offline sales — the sale already happened,
 * so we record it and flag the stock conflict instead of rejecting it.
 */
export async function createSale(client, { bid, userId, d, allowNegative = false, createdAt = null, skipStock = false }) {
  const branchId = d.branch_id || (await client.query('SELECT id FROM branches WHERE business_id=$1 AND is_main=true LIMIT 1', [bid])).rows[0]?.id;
  if (!branchId) throw httpError('No branch found for this business.');

  let subtotal = 0, costTotal = 0;
  const lines = [];
  const conflicts = [];
  for (const item of d.items) {
    const { rows } = await client.query(
      `SELECT p.*,COALESCE(i.quantity,0)::float stock FROM products p LEFT JOIN inventory i ON i.product_id=p.id AND i.branch_id=$2 WHERE p.id=$1 AND p.business_id=$3 AND p.is_active=true`,
      [item.product_id, branchId, bid]);
    const p = rows[0];
    if (!p) throw httpError('Product not found (it may have been deleted).');
    if (!p.is_service && !skipStock && p.stock < item.quantity) {
      if (!allowNegative) throw httpError(`Not enough stock for "${p.name}". Available: ${p.stock}, requested: ${item.quantity}.`);
      conflicts.push(`${p.name}: had ${p.stock}, sold ${item.quantity}`);
    }
    const unitPrice = item.unit_price ?? Number(p.selling_price);
    const lineTotal = unitPrice * item.quantity - (item.discount || 0);
    subtotal += lineTotal;
    costTotal += Number(p.cost_price) * item.quantity;
    lines.push({ p, unitPrice, qty: item.quantity, disc: item.discount || 0, lineTotal });
  }
  const discountTotal = Number(d.discount || 0);
  const total = subtotal - discountTotal;
  const profit = total - costTotal;
  const change = d.amount_tendered != null ? Math.max(0, d.amount_tendered - total) : null;
  const saleNo = 'S' + Date.now().toString(36).toUpperCase();

  const { rows: [s] } = await client.query(
    `INSERT INTO sales (business_id,branch_id,customer_id,user_id,sale_number,subtotal,discount,total_amount,cost_total,profit,payment_method,payment_status,amount_paid,amount_tendered,change_given,notes,offline_id,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$8,$13,$14,$15,$16,COALESCE($17::timestamptz,NOW())) RETURNING *`,
    [bid, branchId, d.customer_id || null, userId, saleNo, subtotal, discountTotal, total, costTotal, profit, d.payment_method,
     d.payment_method === 'credit' ? 'credit' : 'paid', d.amount_tendered ?? null, change, d.notes || null, d.offline_id || null, createdAt]);

  for (const { p, unitPrice, qty, disc, lineTotal } of lines) {
    await client.query(
      'INSERT INTO sale_items (sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,discount,subtotal) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [s.id, p.id, p.name, p.sku, qty, unitPrice, p.cost_price, disc, lineTotal]);
    if (p.is_service || skipStock) continue;
    const inv = await client.query('SELECT quantity FROM inventory WHERE product_id=$1 AND branch_id=$2 FOR UPDATE', [p.id, branchId]);
    const before = Number(inv.rows[0]?.quantity || 0);
    const after = before - qty;
    await client.query(
      'INSERT INTO inventory (business_id,branch_id,product_id,quantity) VALUES ($1,$2,$3,$4) ON CONFLICT (branch_id,product_id) DO UPDATE SET quantity=$4,updated_at=NOW()',
      [bid, branchId, p.id, after]);
    await client.query(
      `INSERT INTO inventory_movements (business_id,branch_id,product_id,type,quantity,before_qty,after_qty,reference_id,created_by) VALUES ($1,$2,$3,'sale',$4,$5,$6,$7,$8)`,
      [bid, branchId, p.id, -qty, before, after, s.id, userId]);
    await syncShortageAlert(client, bid, p, await totalQty(client, bid, p.id));
  }

  if (d.customer_id) {
    await client.query('UPDATE customers SET total_spent=total_spent+$1,purchase_count=purchase_count+1,last_purchase_at=NOW() WHERE id=$2 AND business_id=$3', [total, d.customer_id, bid]);
    if (d.payment_method === 'credit') await client.query('UPDATE customers SET outstanding_credit=outstanding_credit+$1 WHERE id=$2 AND business_id=$3', [total, d.customer_id, bid]);
  }
  if (conflicts.length) {
    await client.query(`INSERT INTO alerts (business_id,type,severity,title,message,related_id) VALUES ($1,'sync_conflict','warning','Offline sale caused negative stock',$2,$3)`,
      [bid, `Sale ${saleNo} synced from an offline device. ${conflicts.join('; ')}. Please recount these items.`, s.id]);
  }
  return { sale: s, conflicts };
}

/** Stock shortages grouped by supplier — pure SQL rules, no AI. */
export async function getShortages(bid, branchId = null) {
  const params = [bid];
  const branchJoin = branchId ? `AND i.branch_id=$${params.push(branchId)}` : '';
  const { rows } = await query(`
    SELECT p.id,p.name,p.sku,p.barcode,p.unit,p.reorder_level,p.reorder_qty,p.cost_price,p.supplier_id,
           COALESCE((SELECT SUM(i.quantity) FROM inventory i WHERE i.product_id=p.id AND i.business_id=p.business_id ${branchJoin}),0)::float qty,
           COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.status='completed' AND s.created_at>=NOW()-INTERVAL '30 days'),0)::float sold30
    FROM products p
    WHERE p.business_id=$1 AND p.is_active=true AND p.is_service=false`, params);

  const items = [];
  for (const r of rows) {
    if (r.qty > r.reorder_level) continue;
    const daily = r.sold30 / 30;
    // Rule: stock up to 2x reorder level, or 14 days of recent sales — whichever is larger.
    const target = r.reorder_qty ? r.qty + r.reorder_qty : Math.max(r.reorder_level * 2, Math.ceil(daily * 14), 1);
    const suggested = Math.max(1, Math.ceil(target - r.qty));
    items.push({
      ...r,
      severity: r.qty <= 0 ? 'out' : 'low',
      daily_sales: Math.round(daily * 100) / 100,
      days_left: daily > 0 ? Math.floor(r.qty / daily) : null,
      suggested_qty: suggested,
      est_cost: Math.round(suggested * Number(r.cost_price)),
    });
  }
  items.sort((a, b) => (a.severity === b.severity ? a.qty - b.qty : a.severity === 'out' ? -1 : 1));

  const { rows: sups } = await query('SELECT * FROM suppliers WHERE business_id=$1 AND is_active=true', [bid]);
  const byId = Object.fromEntries(sups.map(s => [s.id, { ...s, wa_number: normalizePhone(s.whatsapp || s.phone), items: [] }]));
  const unassigned = [];
  for (const it of items) (it.supplier_id && byId[it.supplier_id] ? byId[it.supplier_id].items : unassigned).push(it);
  const groups = Object.values(byId).filter(g => g.items.length).sort((a, b) => b.items.filter(x => x.severity === 'out').length - a.items.filter(x => x.severity === 'out').length);
  return {
    summary: { total: items.length, out: items.filter(i => i.severity === 'out').length, low: items.filter(i => i.severity === 'low').length, estCost: items.reduce((s, i) => s + i.est_cost, 0) },
    suppliers: groups,
    unassigned,
  };
}
