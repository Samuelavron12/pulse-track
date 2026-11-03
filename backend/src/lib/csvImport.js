// Generic CSV import: every module supports a dry run (validate) and an execute pass.
import { parse } from 'csv-parse/sync';
import { withTransaction } from '../db/index.js';
import { createSale, syncShortageAlert, totalQty } from './stock.js';

const num = v => (v === undefined || v === '' || v === null ? null : Number(String(v).replace(/[₦,\s]/g, '')));
const isDate = v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
const norm = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).trim().toLowerCase().replace(/\s+/g, '_'), typeof v === 'string' ? v.trim() : v]));

const MODULES = {
  products: {
    validate(r) {
      if (!r.name) return 'Missing name';
      for (const f of ['cost_price', 'selling_price', 'quantity', 'reorder_level']) {
        const n = num(r[f]); if (n !== null && (Number.isNaN(n) || n < 0)) return `Invalid ${f}`;
      }
    },
    async insert(c, r, ctx) {
      let categoryId = null, supplierId = null;
      if (r.category) {
        const f = await c.query('SELECT id FROM categories WHERE business_id=$1 AND lower(name)=lower($2)', [ctx.bid, r.category]);
        categoryId = f.rows[0]?.id || (await c.query('INSERT INTO categories (business_id,name) VALUES ($1,$2) RETURNING id', [ctx.bid, r.category])).rows[0].id;
      }
      if (r.supplier) {
        const f = await c.query('SELECT id FROM suppliers WHERE business_id=$1 AND lower(name)=lower($2)', [ctx.bid, r.supplier]);
        supplierId = f.rows[0]?.id || (await c.query('INSERT INTO suppliers (business_id,name) VALUES ($1,$2) RETURNING id', [ctx.bid, r.supplier])).rows[0].id;
      }
      const ex = r.sku
        ? await c.query('SELECT id FROM products WHERE business_id=$1 AND sku=$2 AND is_active=true', [ctx.bid, r.sku])
        : await c.query('SELECT id FROM products WHERE business_id=$1 AND lower(name)=lower($2) AND is_active=true', [ctx.bid, r.name]);
      let pid;
      if (ex.rows[0]) {
        pid = ex.rows[0].id;
        await c.query(`UPDATE products SET name=$1,category_id=COALESCE($2,category_id),supplier_id=COALESCE($3,supplier_id),cost_price=COALESCE($4,cost_price),selling_price=COALESCE($5,selling_price),reorder_level=COALESCE($6,reorder_level),unit=COALESCE($7,unit),barcode=COALESCE($8,barcode) WHERE id=$9`,
          [r.name, categoryId, supplierId, num(r.cost_price), num(r.selling_price), num(r.reorder_level), r.unit || null, r.barcode || null, pid]);
      } else {
        pid = (await c.query('INSERT INTO products (business_id,name,sku,barcode,category_id,supplier_id,cost_price,selling_price,reorder_level,unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
          [ctx.bid, r.name, r.sku || null, r.barcode || null, categoryId, supplierId, num(r.cost_price) ?? 0, num(r.selling_price) ?? 0, num(r.reorder_level) ?? 5, r.unit || 'unit'])).rows[0].id;
      }
      const q = num(r.quantity);
      if (q !== null && ctx.branchId) {
        const before = Number((await c.query('SELECT quantity FROM inventory WHERE branch_id=$1 AND product_id=$2', [ctx.branchId, pid])).rows[0]?.quantity || 0);
        await c.query('INSERT INTO inventory (business_id,branch_id,product_id,quantity) VALUES ($1,$2,$3,$4) ON CONFLICT (branch_id,product_id) DO UPDATE SET quantity=$4,updated_at=NOW()', [ctx.bid, ctx.branchId, pid, q]);
        await c.query(`INSERT INTO inventory_movements (business_id,branch_id,product_id,type,quantity,before_qty,after_qty,notes,created_by) VALUES ($1,$2,$3,'adjustment',$4,$5,$6,'CSV import',$7)`, [ctx.bid, ctx.branchId, pid, q - before, before, q, ctx.userId]);
      }
      const p = (await c.query('SELECT id,name,reorder_level FROM products WHERE id=$1', [pid])).rows[0];
      await syncShortageAlert(c, ctx.bid, p, await totalQty(c, ctx.bid, pid));
    },
  },
  customers: {
    validate: r => (!r.name ? 'Missing name' : r.email && !/^\S+@\S+\.\S+$/.test(r.email) ? 'Invalid email' : undefined),
    async insert(c, r, ctx) {
      const ex = r.phone ? await c.query('SELECT id FROM customers WHERE business_id=$1 AND phone=$2', [ctx.bid, r.phone]) : { rows: [] };
      if (ex.rows[0]) return c.query('UPDATE customers SET name=$1,email=COALESCE($2,email),address=COALESCE($3,address) WHERE id=$4', [r.name, r.email || null, r.address || null, ex.rows[0].id]);
      await c.query('INSERT INTO customers (business_id,name,phone,email,address) VALUES ($1,$2,$3,$4,$5)', [ctx.bid, r.name, r.phone || null, r.email || null, r.address || null]);
    },
  },
  suppliers: {
    validate: r => (!r.name ? 'Missing name' : !r.phone && !r.whatsapp ? 'Add a phone or WhatsApp number' : undefined),
    async insert(c, r, ctx) {
      const ex = await c.query('SELECT id FROM suppliers WHERE business_id=$1 AND lower(name)=lower($2)', [ctx.bid, r.name]);
      const vals = [r.contact_person || null, r.phone || null, r.whatsapp || null, r.email || null, r.address || null, r.products_note || null, r.payment_terms || null];
      if (ex.rows[0]) return c.query('UPDATE suppliers SET contact_person=COALESCE($1,contact_person),phone=COALESCE($2,phone),whatsapp=COALESCE($3,whatsapp),email=COALESCE($4,email),address=COALESCE($5,address),products_note=COALESCE($6,products_note),payment_terms=COALESCE($7,payment_terms) WHERE id=$8', [...vals, ex.rows[0].id]);
      await c.query('INSERT INTO suppliers (business_id,name,contact_person,phone,whatsapp,email,address,products_note,payment_terms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [ctx.bid, r.name, ...vals]);
    },
  },
  expenses: {
    validate(r) {
      if (!r.category) return 'Missing category';
      const a = num(r.amount); if (a === null || Number.isNaN(a) || a <= 0) return 'Invalid amount';
      if (!isDate(r.date)) return 'Date must be YYYY-MM-DD';
    },
    insert: (c, r, ctx) => c.query('INSERT INTO expenses (business_id,category,description,amount,payment_method,incurred_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [ctx.bid, r.category, r.description || null, num(r.amount), r.payment_method || 'cash', r.date || new Date().toISOString().slice(0, 10), ctx.userId]),
  },
  sales: {
    // Historical sales: recorded for reports, inventory is NOT changed.
    validate(r) {
      if (!r.sku && !r.name) return 'Need a sku or product name';
      const q = num(r.quantity); if (q === null || Number.isNaN(q) || q <= 0) return 'Invalid quantity';
      if (!isDate(r.date)) return 'Date must be YYYY-MM-DD';
      if (r.payment_method && !['cash', 'transfer', 'pos', 'ussd', 'opay', 'moniepoint', 'credit', 'other'].includes(r.payment_method)) return 'Unknown payment_method';
    },
    async insert(c, r, ctx) {
      const p = r.sku
        ? await c.query('SELECT id FROM products WHERE business_id=$1 AND sku=$2 AND is_active=true', [ctx.bid, r.sku])
        : await c.query('SELECT id FROM products WHERE business_id=$1 AND lower(name)=lower($2) AND is_active=true', [ctx.bid, r.name]);
      if (!p.rows[0]) throw new Error(`Product not found: ${r.sku || r.name}`);
      let customerId = null;
      if (r.customer_phone) customerId = (await c.query('SELECT id FROM customers WHERE business_id=$1 AND phone=$2', [ctx.bid, r.customer_phone])).rows[0]?.id || null;
      await createSale(c, { bid: ctx.bid, userId: ctx.userId, skipStock: true, createdAt: r.date ? `${r.date}T12:00:00Z` : null,
        d: { items: [{ product_id: p.rows[0].id, quantity: num(r.quantity), unit_price: num(r.unit_price) ?? undefined }], payment_method: r.payment_method || 'cash', customer_id: customerId, discount: 0 } });
    },
  },
};

export const IMPORT_MODULES = Object.keys(MODULES);

export async function runImport(module, buffer, ctx, dry) {
  const mod = MODULES[module];
  let records;
  try { records = parse(buffer.toString('utf-8').replace(/^﻿/, ''), { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }).map(norm); }
  catch (e) { return { error: `Could not read this file as CSV: ${e.message}` }; }
  if (!records.length) return { error: 'The file has no data rows.' };
  if (records.length > 5000) return { error: 'Max 5,000 rows per file. Please split the file.' };

  const errors = [];
  const valid = [];
  records.forEach((r, i) => { const e = mod.validate(r); e ? errors.push({ row: i + 2, error: e }) : valid.push({ r, row: i + 2 }); });
  const summary = { totalRows: records.length, validRows: valid.length, errorRows: errors.length, errors: errors.slice(0, 50), sample: records.slice(0, 5) };
  if (dry) return summary;

  let imported = 0;
  const runtimeErrors = [...errors];
  await withTransaction(async c => {
    const branchId = (await c.query('SELECT id FROM branches WHERE business_id=$1 AND is_main=true LIMIT 1', [ctx.bid])).rows[0]?.id;
    for (const { r, row } of valid) {
      await c.query('SAVEPOINT row');
      try { await mod.insert(c, r, { ...ctx, branchId }); imported++; await c.query('RELEASE SAVEPOINT row'); }
      catch (e) { await c.query('ROLLBACK TO SAVEPOINT row'); runtimeErrors.push({ row, error: e.message }); }
    }
  });
  return { ...summary, imported, skipped: records.length - imported, errors: runtimeErrors.slice(0, 50) };
}
