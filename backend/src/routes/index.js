import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import multer from 'multer';
import { createSale, syncShortageAlert, totalQty, getShortages, normalizePhone, httpError } from '../lib/stock.js';
import { runImport, IMPORT_MODULES } from '../lib/csvImport.js';
import { query, withTransaction } from '../db/index.js';
import { requireAuth, requireRole, wrap } from '../middleware/index.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } });
const sign  = (sub, extra={}) => jwt.sign({ sub, ...extra }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
// CSV-safe quoting
const q = v => `"${String(v??'').replace(/"/g,'""')}"`;
const fmt   = v => `₦${Math.round(Number(v)||0).toLocaleString()}`;

// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════
export const authRouter = Router();

authRouter.post('/register', wrap(async (req, res) => {
  const d = z.object({ businessName:z.string().min(2), industry:z.string().optional(), ownerName:z.string().min(2), email:z.string().trim().email(), password:z.string().min(8) }).parse(req.body);
  const email = d.email.trim().toLowerCase();
  const exists = await query('SELECT id FROM users WHERE lower(email)=$1', [email]);
  if (exists.rows[0]) return res.status(409).json({ error: 'This email is already registered. Please log in instead.' });
  const hash = await bcrypt.hash(d.password, 10);
  const { rows: [biz] } = await query('INSERT INTO businesses (name,industry) VALUES ($1,$2) RETURNING id', [d.businessName, d.industry||null]);
  await query('INSERT INTO branches (business_id,name,is_main) VALUES ($1,\'Main Branch\',true)', [biz.id]);
  const { rows: [user] } = await query('INSERT INTO users (business_id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,\'owner\') RETURNING id,name,email,role,language,theme', [biz.id, d.ownerName.trim(), email, hash]);
  res.status(201).json({ token: sign(user.id), user, business: { id: biz.id, name: d.businessName } });
}));

authRouter.post('/login', wrap(async (req, res) => {
  const d = z.object({ email:z.string().trim().email(), password:z.string().min(1) }).parse(req.body);
  const { rows } = await query('SELECT u.*,b.name bname,b.is_active bactive FROM users u JOIN businesses b ON b.id=u.business_id WHERE lower(u.email)=$1', [d.email.toLowerCase()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(d.password, u.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
  if (!u.is_active) return res.status(403).json({ error: 'Your account has been deactivated.' });
  if (!u.bactive) return res.status(403).json({ error: 'This business account is suspended. Contact support.' });
  await query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [u.id]);
  res.json({ token: sign(u.id), user: { id:u.id, name:u.name, email:u.email, role:u.role, language:u.language, theme:u.theme }, business: { id:u.business_id, name:u.bname } });
}));

authRouter.post('/forgot-password', wrap(async (req, res) => {
  const d = z.object({ email:z.string().trim().email(), note:z.string().max(500).optional() }).parse(req.body);
  await query('INSERT INTO password_requests (email,note) VALUES ($1,$2)', [d.email.toLowerCase(), d.note||null]);
  res.json({ success:true, message:'Request sent. The administrator will reset your password and contact you.' });
}));

authRouter.get('/me', requireAuth, wrap(async (req, res) => {
  const { rows: [biz] } = await query('SELECT * FROM businesses WHERE id=$1', [req.user.businessId]);
  const { rows: branches } = await query('SELECT * FROM branches WHERE business_id=$1 AND is_active=true ORDER BY is_main DESC,name', [req.user.businessId]);
  res.json({ user: req.user, business: biz, branches });
}));

authRouter.patch('/me/settings', requireAuth, wrap(async (req, res) => {
  const d = z.object({ language:z.enum(['en','fr','ha','yo','ig','pcm']).optional(), theme:z.enum(['light','dark','system']).optional(), name:z.string().min(2).optional() }).parse(req.body);
  const sets=[], vals=[];
  if (d.language) { sets.push(`language=$${vals.push(d.language)}`); }
  if (d.theme)    { sets.push(`theme=$${vals.push(d.theme)}`); }
  if (d.name)     { sets.push(`name=$${vals.push(d.name)}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.user.id);
  const { rows: [user] } = await query(`UPDATE users SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING id,name,email,role,language,theme`, vals);
  res.json({ user });
}));

authRouter.patch('/me/password', requireAuth, wrap(async (req, res) => {
  const { current, newPassword } = z.object({ current:z.string(), newPassword:z.string().min(8) }).parse(req.body);
  const { rows } = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(current, rows[0].password_hash))) return res.status(400).json({ error: 'Current password is incorrect.' });
  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
  res.json({ success: true });
}));

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
export const dashRouter = Router();
dashRouter.use(requireAuth);

dashRouter.get('/summary', wrap(async (req, res) => {
  const bid = req.user.businessId;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const d7  = new Date(Date.now()-7*864e5).toISOString();
  const d30 = new Date(Date.now()-30*864e5).toISOString();

  const [today, w, m, exp30, lowStock, unread, customers, trend, topProds, branchPerf] = await Promise.all([
    query(`SELECT COALESCE(SUM(total_amount),0)::float rev,COALESCE(SUM(profit),0)::float profit,COUNT(*)::int cnt FROM sales WHERE business_id=$1 AND status='completed' AND created_at>=$2`, [bid, todayStart.toISOString()]),
    query(`SELECT COALESCE(SUM(total_amount),0)::float rev,COALESCE(SUM(profit),0)::float profit,COUNT(*)::int cnt FROM sales WHERE business_id=$1 AND status='completed' AND created_at>=$2`, [bid, d7]),
    query(`SELECT COALESCE(SUM(total_amount),0)::float rev,COALESCE(SUM(profit),0)::float profit,COUNT(*)::int cnt FROM sales WHERE business_id=$1 AND status='completed' AND created_at>=$2`, [bid, d30]),
    query(`SELECT COALESCE(SUM(amount),0)::float total FROM expenses WHERE business_id=$1 AND incurred_at>=$2`, [bid, d30]),
    getShortages(bid),
    query(`SELECT COUNT(*)::int c FROM alerts WHERE business_id=$1 AND is_read=false`, [bid]),
    query(`SELECT COUNT(*)::int c FROM customers WHERE business_id=$1`, [bid]),
    query(`SELECT DATE(created_at) AS day,COALESCE(SUM(total_amount),0)::float rev FROM sales WHERE business_id=$1 AND status='completed' AND created_at>=NOW()-INTERVAL '14 days' GROUP BY DATE(created_at) ORDER BY day`, [bid]),
    query(`SELECT p.name,SUM(si.quantity)::float units,SUM(si.subtotal)::float revenue FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN products p ON p.id=si.product_id WHERE s.business_id=$1 AND s.status='completed' AND s.created_at>=$2 GROUP BY p.id,p.name ORDER BY revenue DESC LIMIT 5`, [bid, d7]),
    query(`SELECT b.name,COALESCE(SUM(s.total_amount),0)::float rev,COALESCE(SUM(s.profit),0)::float profit,COUNT(s.id)::int cnt FROM branches b LEFT JOIN sales s ON s.branch_id=b.id AND s.status='completed' AND s.created_at>=$2 WHERE b.business_id=$1 AND b.is_active=true GROUP BY b.id,b.name ORDER BY rev DESC`, [bid, d30]),
  ]);

  const cogsSold = Number(m.rows[0].rev) - Number(m.rows[0].profit);
  const expenses = Number(exp30.rows[0].total);
  const grossProfit = Number(m.rows[0].profit);
  const netProfit = grossProfit - expenses;

  res.json({
    today: today.rows[0],
    week: w.rows[0],
    month: m.rows[0],
    cogs30: cogsSold,
    expenses30: expenses,
    grossProfit30: grossProfit,
    netProfit30: netProfit,
    lowStockCount: lowStock.summary.total,
    outOfStockCount: lowStock.summary.out,
    shortageSummary: lowStock.summary,
    topShortages: [...lowStock.suppliers.flatMap(g => g.items.map(i => ({ ...i, supplier_name: g.name }))), ...lowStock.unassigned].sort((a, b) => (a.severity === b.severity ? a.qty - b.qty : a.severity === 'out' ? -1 : 1)).slice(0, 5),
    unreadAlerts: unread.rows[0].c,
    customerCount: customers.rows[0].c,
    revenueTrend: trend.rows,
    topProducts: topProds.rows,
    branchPerformance: branchPerf.rows,
  });
}));

dashRouter.get('/reports/sales', wrap(async (req, res) => {
  const bid = req.user.businessId;
  const from = req.query.from || new Date(Date.now()-30*864e5).toISOString();
  const to   = req.query.to   || new Date().toISOString();
  const [rows, totals] = await Promise.all([
    query(`SELECT s.*,c.name cname,b.name bname FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN branches b ON b.id=s.branch_id WHERE s.business_id=$1 AND s.created_at BETWEEN $2 AND $3 AND s.status='completed' ORDER BY s.created_at DESC LIMIT 500`, [bid,from,to]),
    query(`SELECT COALESCE(SUM(total_amount),0)::float rev,COALESCE(SUM(profit),0)::float profit,COALESCE(SUM(cost_total),0)::float cogs,COUNT(*)::int cnt FROM sales WHERE business_id=$1 AND created_at BETWEEN $2 AND $3 AND status='completed'`, [bid,from,to]),
  ]);
  const byMethod = await query(`SELECT payment_method,COUNT(*)::int cnt,COALESCE(SUM(total_amount),0)::float total FROM sales WHERE business_id=$1 AND created_at BETWEEN $2 AND $3 AND status='completed' GROUP BY payment_method ORDER BY total DESC`, [bid,from,to]);
  res.json({ sales: rows.rows, totals: totals.rows[0], byPaymentMethod: byMethod.rows });
}));

dashRouter.get('/reports/expenses', wrap(async (req, res) => {
  const bid = req.user.businessId;
  const from = req.query.from || new Date(Date.now()-30*864e5).toISOString();
  const to   = req.query.to   || new Date().toISOString();
  const [byCategory, total] = await Promise.all([
    query(`SELECT category,COALESCE(SUM(amount),0)::float total FROM expenses WHERE business_id=$1 AND incurred_at BETWEEN $2::date AND $3::date GROUP BY category ORDER BY total DESC`, [bid,from,to]),
    query(`SELECT COALESCE(SUM(amount),0)::float total FROM expenses WHERE business_id=$1 AND incurred_at BETWEEN $2::date AND $3::date`, [bid,from,to]),
  ]);
  res.json({ byCategory: byCategory.rows, total: total.rows[0].total });
}));

dashRouter.get('/reports/profit-loss', wrap(async (req, res) => {
  const bid = req.user.businessId;
  const from = req.query.from || new Date(Date.now()-30*864e5).toISOString();
  const to   = req.query.to   || new Date().toISOString();
  const [sales, expenses] = await Promise.all([
    query(`SELECT COALESCE(SUM(total_amount),0)::float rev,COALESCE(SUM(cost_total),0)::float cogs,COALESCE(SUM(profit),0)::float gross FROM sales WHERE business_id=$1 AND created_at BETWEEN $2 AND $3 AND status='completed'`, [bid,from,to]),
    query(`SELECT COALESCE(SUM(amount),0)::float total FROM expenses WHERE business_id=$1 AND incurred_at BETWEEN $2::date AND $3::date`, [bid,from,to]),
  ]);
  const s = sales.rows[0]; const e = expenses.rows[0];
  res.json({ revenue: s.rev, cogs: s.cogs, grossProfit: s.gross, operatingExpenses: e.total, netProfit: s.gross - e.total });
}));

// ════════════════════════════════════════════════════════════════════════════
// BUSINESS ANALYSIS (rule-based intelligence — no AI)
// ════════════════════════════════════════════════════════════════════════════
export const analysisRouter = Router();
analysisRouter.use(requireAuth);

analysisRouter.get('/', wrap(async (req, res) => {
  const bid = req.user.businessId;
  const d7  = new Date(Date.now()-7*864e5).toISOString();
  const d30 = new Date(Date.now()-30*864e5).toISOString();
  const d60 = new Date(Date.now()-60*864e5).toISOString();

  const [
    best, slow, lowStock, highProfit, inactive,
    curr30, prev30, topCust, expCat, avgTxn, invTurn
  ] = await Promise.all([
    query(`SELECT p.name,SUM(si.quantity)::float units,SUM(si.subtotal)::float rev FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN products p ON p.id=si.product_id WHERE s.business_id=$1 AND s.created_at>=$2 GROUP BY p.id,p.name ORDER BY rev DESC LIMIT 5`, [bid,d30]),
    query(`SELECT p.name,COALESCE(SUM(si.quantity),0)::float units FROM products p LEFT JOIN sale_items si ON si.product_id=p.id LEFT JOIN sales s ON s.id=si.sale_id AND s.created_at>=$2 WHERE p.business_id=$1 AND p.is_active=true GROUP BY p.id,p.name ORDER BY units ASC LIMIT 5`, [bid,d30]),
    query(`SELECT p.name,t.qty quantity,p.reorder_level FROM products p CROSS JOIN LATERAL (SELECT COALESCE(SUM(i.quantity),0)::float qty FROM inventory i WHERE i.product_id=p.id) t WHERE p.business_id=$1 AND p.is_active=true AND NOT p.is_service AND t.qty<=p.reorder_level ORDER BY t.qty ASC LIMIT 10`, [bid]),
    query(`SELECT p.name,((p.selling_price-p.cost_price)/NULLIF(p.selling_price,0)*100)::float margin FROM products p WHERE p.business_id=$1 AND p.is_active=true AND p.selling_price>0 ORDER BY margin DESC LIMIT 5`, [bid]),
    query(`SELECT name,phone,total_spent::float total_spent FROM customers WHERE business_id=$1 AND last_purchase_at<$2 ORDER BY total_spent DESC LIMIT 5`, [bid, d30]),
    query(`SELECT COALESCE(SUM(total_amount),0)::float rev,COALESCE(SUM(profit),0)::float profit FROM sales WHERE business_id=$1 AND created_at>=$2 AND status='completed'`, [bid,d30]),
    query(`SELECT COALESCE(SUM(total_amount),0)::float rev,COALESCE(SUM(profit),0)::float profit FROM sales WHERE business_id=$1 AND created_at BETWEEN $2 AND $3 AND status='completed'`, [bid,d60,d30]),
    query(`SELECT c.name,SUM(s.total_amount)::float spent FROM customers c JOIN sales s ON s.customer_id=c.id WHERE c.business_id=$1 AND s.created_at>=$2 GROUP BY c.id,c.name ORDER BY spent DESC LIMIT 5`, [bid,d30]),
    query(`SELECT category,SUM(amount)::float total FROM expenses WHERE business_id=$1 AND incurred_at>=$2::date GROUP BY category ORDER BY total DESC LIMIT 1`, [bid,d30]),
    query(`SELECT COALESCE(AVG(total_amount),0)::float avg FROM sales WHERE business_id=$1 AND created_at>=$2 AND status='completed'`, [bid,d30]),
    query(`SELECT COALESCE(SUM(si.quantity*si.unit_cost),0)::float sold,COALESCE((SELECT SUM(i.quantity*p.cost_price) FROM inventory i JOIN products p ON p.id=i.product_id WHERE i.business_id=$1),0)::float stock FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.business_id=$1 AND s.created_at>=$2`, [bid,d30]),
  ]);

  const curr = curr30.rows[0];
  const prev = prev30.rows[0];
  const revChange = prev.rev > 0 ? ((curr.rev - prev.rev) / prev.rev * 100) : null;
  const profitChange = prev.profit > 0 ? ((curr.profit - prev.profit) / prev.profit * 100) : null;

  // Generate plain-language insights
  const insights = [];
  if (revChange !== null) {
    insights.push({ type: revChange >= 0 ? 'positive' : 'warning', message: `Revenue ${revChange >= 0 ? 'increased' : 'decreased'} by ${Math.abs(revChange).toFixed(1)}% compared to the previous 30 days (${fmt(curr.rev)} vs ${fmt(prev.rev)}).` });
  }
  if (best.rows[0]) insights.push({ type: 'info', message: `Best-selling product this month: ${best.rows[0].name} (${fmt(best.rows[0].rev)} in sales).` });
  if (lowStock.rows.length > 0) insights.push({ type: 'warning', message: `${lowStock.rows.length} product${lowStock.rows.length > 1 ? 's are' : ' is'} at or below reorder level: ${lowStock.rows.slice(0,3).map(p=>p.name).join(', ')}${lowStock.rows.length > 3 ? ` and ${lowStock.rows.length-3} more` : ''}.` });
  if (inactive.rows.length > 0) insights.push({ type: 'info', message: `${inactive.rows.length} customer${inactive.rows.length > 1 ? 's have' : ' has'} not purchased in the last 30 days. Their combined previous spending is ${fmt(inactive.rows.reduce((s,c)=>s+c.total_spent,0))}.` });
  if (expCat.rows[0]) insights.push({ type: 'info', message: `Highest expense category this month: ${expCat.rows[0].category} (${fmt(expCat.rows[0].total)}).` });

  res.json({
    bestSellers: best.rows,
    slowMovers: slow.rows,
    lowStock: lowStock.rows,
    highMarginProducts: highProfit.rows,
    inactiveCustomers: inactive.rows,
    topCustomers: topCust.rows,
    revenueTrend: { current: curr.rev, previous: prev.rev, changePercent: revChange },
    profitTrend: { current: curr.profit, previous: prev.profit, changePercent: profitChange },
    highestExpenseCategory: expCat.rows[0] || null,
    avgTransactionValue: avgTxn.rows[0].avg,
    insights,
  });
}));

// ════════════════════════════════════════════════════════════════════════════
// PRODUCTS & INVENTORY
// ════════════════════════════════════════════════════════════════════════════
export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get('/', wrap(async (req, res) => {
  const bid = req.user.businessId;
  const search = req.query.q ? `%${req.query.q}%` : '%';
  const catFilter = req.query.category_id ? `AND p.category_id=$3` : '';
  const params = [bid, search, ...(req.query.category_id ? [req.query.category_id] : [])];
  const { rows } = await query(`
    SELECT p.*,c.name cat_name,c.color cat_color,
      COALESCE((SELECT SUM(i.quantity) FROM inventory i WHERE i.product_id=p.id AND i.business_id=$1),0)::float total_qty,
      COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT('branch_id',i.branch_id,'branch_name',b.name,'qty',i.quantity))
        FROM inventory i JOIN branches b ON b.id=i.branch_id WHERE i.product_id=p.id AND i.business_id=$1),
      '[]'::json) branch_stock
    FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.business_id=$1 AND p.is_active=true AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR p.barcode ILIKE $2) ${catFilter}
    ORDER BY p.name
  `, params);
  res.json({ products: rows });
}));

productsRouter.get('/barcode/:barcode', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT p.*,COALESCE(SUM(i.quantity),0)::float total_qty FROM products p LEFT JOIN inventory i ON i.product_id=p.id AND i.business_id=p.business_id WHERE p.business_id=$1 AND p.barcode=$2 AND p.is_active=true GROUP BY p.id`,
    [req.user.businessId, req.params.barcode]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Product not found for this barcode.' });
  res.json({ product: rows[0] });
}));

productsRouter.get('/export', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT p.sku,p.name,c.name cat,p.cost_price,p.selling_price,p.reorder_level,p.unit,COALESCE(SUM(i.quantity),0)::float qty FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN inventory i ON i.product_id=p.id AND i.business_id=p.business_id WHERE p.business_id=$1 AND p.is_active=true GROUP BY p.id,c.name ORDER BY p.name`,
    [req.user.businessId]
  );
  const header = 'sku,name,category,cost_price,selling_price,quantity,reorder_level,unit';
  const csv = rows.map(r => [r.sku||'',q(r.name),q(r.cat||''),r.cost_price,r.selling_price,r.qty,r.reorder_level,r.unit].join(','));
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition',`attachment; filename="products-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send([header,...csv].join('\n'));
}));

const prodSchema = z.object({ name:z.string().min(1), sku:z.string().optional().nullable(), barcode:z.string().optional().nullable(), category_id:z.string().uuid().optional().nullable(), supplier_id:z.string().uuid().optional().nullable(), reorder_qty:z.number().int().min(0).optional().nullable(), cost_price:z.number().min(0), selling_price:z.number().min(0), quantity:z.number().min(0).optional(), reorder_level:z.number().int().min(0).default(5), unit:z.string().default('unit'), is_service:z.boolean().default(false) });

productsRouter.post('/', wrap(async (req, res) => {
  const d = prodSchema.parse(req.body);
  const { rows: [prod] } = await query(
    'INSERT INTO products (business_id,name,sku,barcode,category_id,supplier_id,reorder_qty,cost_price,selling_price,reorder_level,unit,is_service) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
    [req.user.businessId, d.name, d.sku||null, d.barcode||null, d.category_id||null, d.supplier_id||null, d.reorder_qty??null, d.cost_price, d.selling_price, d.reorder_level, d.unit, d.is_service]
  );
  if (!d.is_service && d.quantity != null) {
    const br = await query('SELECT id FROM branches WHERE business_id=$1 AND is_main=true LIMIT 1', [req.user.businessId]);
    if (br.rows[0]) await query('INSERT INTO inventory (business_id,branch_id,product_id,quantity) VALUES ($1,$2,$3,$4) ON CONFLICT (branch_id,product_id) DO UPDATE SET quantity=$4', [req.user.businessId, br.rows[0].id, prod.id, d.quantity]);
  }
  if (!d.is_service) await withTransaction(async c => syncShortageAlert(c, req.user.businessId, prod, d.quantity||0));
  res.status(201).json({ product: { ...prod, total_qty: d.quantity||0 } });
}));

productsRouter.patch('/:id', wrap(async (req, res) => {
  const d = prodSchema.partial().parse(req.body);
  const cols=['name','sku','barcode','category_id','supplier_id','reorder_qty','cost_price','selling_price','reorder_level','unit','is_service'];
  const sets=[]; const vals=[];
  for (const c of cols) { if (d[c] !== undefined) sets.push(`${c}=$${vals.push(d[c])}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id, req.user.businessId);
  const { rows } = await query(`UPDATE products SET ${sets.join(',')} WHERE id=$${vals.length-1} AND business_id=$${vals.length} RETURNING *`, vals);
  if (!rows[0]) return res.status(404).json({ error: 'Product not found.' });
  await withTransaction(async c => syncShortageAlert(c, req.user.businessId, rows[0], await totalQty(c, req.user.businessId, rows[0].id)));
  res.json({ product: rows[0] });
}));

productsRouter.delete('/:id', wrap(async (req, res) => {
  await query('UPDATE products SET is_active=false WHERE id=$1 AND business_id=$2', [req.params.id, req.user.businessId]);
  res.status(204).send();
}));

// Stock adjustment
productsRouter.post('/:id/adjust', requireRole('owner','manager'), wrap(async (req, res) => {
  const { quantity, branch_id, reason, type='adjustment' } = z.object({ quantity:z.number(), branch_id:z.string().uuid(), reason:z.string().optional(), type:z.string().optional() }).parse(req.body);
  await withTransaction(async client => {
    const inv = await client.query('SELECT quantity FROM inventory WHERE product_id=$1 AND branch_id=$2 FOR UPDATE', [req.params.id, branch_id]);
    const before = inv.rows[0]?.quantity || 0;
    const after = Number(before) + Number(quantity);
    if (after < 0) throw Object.assign(new Error('Stock cannot go below zero.'), { status: 400 });
    await client.query('INSERT INTO inventory (business_id,branch_id,product_id,quantity) VALUES ($1,$2,$3,$4) ON CONFLICT (branch_id,product_id) DO UPDATE SET quantity=$4,updated_at=NOW()', [req.user.businessId, branch_id, req.params.id, after]);
    await client.query('INSERT INTO inventory_movements (business_id,branch_id,product_id,type,quantity,before_qty,after_qty,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [req.user.businessId, branch_id, req.params.id, type, quantity, before, after, reason||null, req.user.id]);
    const pr = await client.query('SELECT id,name,reorder_level FROM products WHERE id=$1 AND business_id=$2', [req.params.id, req.user.businessId]);
    if (pr.rows[0]) await syncShortageAlert(client, req.user.businessId, pr.rows[0], await totalQty(client, req.user.businessId, req.params.id));
  });
  res.json({ success: true });
}));

productsRouter.get('/:id/history', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT m.*,u.name uname,b.name bname FROM inventory_movements m LEFT JOIN users u ON u.id=m.created_by LEFT JOIN branches b ON b.id=m.branch_id WHERE m.business_id=$1 AND m.product_id=$2 ORDER BY m.created_at DESC LIMIT 100`,
    [req.user.businessId, req.params.id]
  );
  res.json({ movements: rows });
}));

// ════════════════════════════════════════════════════════════════════════════
// SALES — full POS-capable route
// ════════════════════════════════════════════════════════════════════════════
export const salesRouter = Router();
salesRouter.use(requireAuth);

salesRouter.get('/', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit)||100, 1000);
  const from = req.query.from; const to = req.query.to;
  let q = `SELECT s.*,c.name cname,b.name bname,u.name uname FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN branches b ON b.id=s.branch_id LEFT JOIN users u ON u.id=s.user_id WHERE s.business_id=$1`;
  const params = [req.user.businessId];
  if (from) { q+=` AND s.created_at>=$${params.push(from)}`; }
  if (to)   { q+=` AND s.created_at<=$${params.push(to)}`; }
  if (req.query.branch_id) { q+=` AND s.branch_id=$${params.push(req.query.branch_id)}`; }
  q+=` ORDER BY s.created_at DESC LIMIT $${params.push(limit)}`;
  const { rows } = await query(q, params);
  res.json({ sales: rows });
}));

salesRouter.get('/export', wrap(async (req, res) => {
  const from = req.query.from||new Date(Date.now()-30*864e5).toISOString().slice(0,10);
  const to   = req.query.to  ||new Date().toISOString().slice(0,10);
  const { rows } = await query(
    `SELECT s.created_at,c.name cust,b.name branch,s.total_amount,s.profit,s.payment_method,s.status FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN branches b ON b.id=s.branch_id WHERE s.business_id=$1 AND s.created_at::date BETWEEN $2 AND $3 ORDER BY s.created_at DESC`,
    [req.user.businessId, from, to]
  );
  const header = 'date,customer,branch,amount,profit,payment_method,status';
  const csv = rows.map(r=>[r.created_at.toISOString().slice(0,10),q(r.cust||'Walk-in'),q(r.branch||''),r.total_amount,r.profit,r.payment_method,r.status].join(','));
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition',`attachment; filename="sales-${from}-to-${to}.csv"`);
  res.send([header,...csv].join('\n'));
}));

salesRouter.get('/:id', wrap(async (req, res) => {
  const [sale, items] = await Promise.all([
    query(`SELECT s.*,c.name cname,b.name bname FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN branches b ON b.id=s.branch_id WHERE s.id=$1 AND s.business_id=$2`, [req.params.id, req.user.businessId]),
    query(`SELECT * FROM sale_items WHERE sale_id=$1`, [req.params.id]),
  ]);
  if (!sale.rows[0]) return res.status(404).json({ error: 'Sale not found.' });
  res.json({ sale: sale.rows[0], items: items.rows });
}));

const saleSchema = z.object({
  customer_id:    z.string().uuid().optional().nullable(),
  branch_id:      z.string().uuid().optional().nullable(),
  payment_method: z.enum(['cash','transfer','pos','ussd','opay','moniepoint','credit','other']).default('cash'),
  discount:       z.number().min(0).default(0),
  amount_tendered:z.number().optional(),
  notes:          z.string().optional(),
  offline_id:     z.string().optional(),
  items: z.array(z.object({ product_id:z.string().uuid(), quantity:z.number().positive(), unit_price:z.number().optional(), discount:z.number().min(0).default(0) })).min(1, 'At least one item is required.'),
});

salesRouter.post('/', wrap(async (req, res) => {
  const d = saleSchema.parse(req.body);
  const bid = req.user.businessId;
  if (d.offline_id) {
    const exists = await query('SELECT * FROM sales WHERE offline_id=$1 AND business_id=$2', [d.offline_id, bid]);
    if (exists.rows[0]) return res.json({ sale: exists.rows[0], duplicate: true });
  }
  const { sale } = await withTransaction(client => createSale(client, { bid, userId: req.user.id, d }));
  res.status(201).json({ sale });
}));

salesRouter.post('/:id/refund', requireRole('owner','manager'), wrap(async (req, res) => {
  const { reason } = z.object({ reason:z.string().min(3) }).parse(req.body);
  const { rows } = await query('SELECT * FROM sales WHERE id=$1 AND business_id=$2', [req.params.id, req.user.businessId]);
  if (!rows[0]) return res.status(404).json({ error: 'Sale not found.' });
  if (rows[0].status !== 'completed') return res.status(400).json({ error: 'Only completed sales can be refunded.' });
  await withTransaction(async client => {
    await client.query('UPDATE sales SET status=\'refunded\',notes=$1 WHERE id=$2', [reason, req.params.id]);
    if (rows[0].customer_id) {
      await client.query('UPDATE customers SET total_spent=GREATEST(0,total_spent-$1),purchase_count=GREATEST(0,purchase_count-1) WHERE id=$2', [rows[0].total_amount, rows[0].customer_id]);
      if (rows[0].payment_method === 'credit') await client.query('UPDATE customers SET outstanding_credit=GREATEST(0,outstanding_credit-$1) WHERE id=$2', [rows[0].total_amount, rows[0].customer_id]);
    }
    const items = await client.query('SELECT * FROM sale_items WHERE sale_id=$1', [req.params.id]);
    for (const item of items.rows) {
      if (!item.product_id) continue;
      const pr = (await client.query('SELECT id,name,reorder_level,is_service FROM products WHERE id=$1', [item.product_id])).rows[0];
      if (!pr || pr.is_service) continue;
      await client.query('INSERT INTO inventory (business_id,branch_id,product_id,quantity) VALUES ($1,$2,$3,$4) ON CONFLICT (branch_id,product_id) DO UPDATE SET quantity=inventory.quantity+$4,updated_at=NOW()', [req.user.businessId, rows[0].branch_id, item.product_id, item.quantity]);
      await client.query(`INSERT INTO inventory_movements (business_id,branch_id,product_id,type,quantity,reference_id,notes,created_by) VALUES ($1,$2,$3,'return',$4,$5,'Sale refunded',$6)`, [req.user.businessId, rows[0].branch_id, item.product_id, item.quantity, req.params.id, req.user.id]);
      await syncShortageAlert(client, req.user.businessId, pr, await totalQty(client, req.user.businessId, item.product_id));
    }
    await client.query(`INSERT INTO audit_log (business_id,user_id,action_type,description) VALUES ($1,$2,'sale.refunded',$3)`, [req.user.businessId, req.user.id, `Refunded sale ${req.params.id}. Reason: ${reason}`]);
  });
  res.json({ success: true });
}));

// ════════════════════════════════════════════════════════════════════════════
// CUSTOMERS
// ════════════════════════════════════════════════════════════════════════════
export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get('/', wrap(async (req, res) => {
  const search = req.query.q ? `%${req.query.q}%` : '%';
  const { rows } = await query(
    `SELECT * FROM customers WHERE business_id=$1 AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2) ORDER BY name LIMIT 500`,
    [req.user.businessId, search]
  );
  res.json({ customers: rows });
}));

customersRouter.get('/export', wrap(async (req, res) => {
  const { rows } = await query('SELECT name,phone,email,address,customer_type,total_spent,outstanding_credit,purchase_count,last_purchase_at FROM customers WHERE business_id=$1 ORDER BY name', [req.user.businessId]);
  const header = 'name,phone,email,address,customer_type,total_spent,outstanding_credit,purchase_count,last_purchase_at';
  const csv = rows.map(r=>[q(r.name),r.phone||'',r.email||'',q(r.address||''),r.customer_type,r.total_spent,r.outstanding_credit,r.purchase_count,r.last_purchase_at?.toISOString()?.slice(0,10)||''].join(','));
  res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="customers.csv"');
  res.send([header,...csv].join('\n'));
}));

customersRouter.get('/:id', wrap(async (req, res) => {
  const [cust, history] = await Promise.all([
    query('SELECT * FROM customers WHERE id=$1 AND business_id=$2', [req.params.id, req.user.businessId]),
    query('SELECT id,total_amount,payment_method,status,created_at FROM sales WHERE customer_id=$1 AND status=\'completed\' ORDER BY created_at DESC LIMIT 50', [req.params.id]),
  ]);
  if (!cust.rows[0]) return res.status(404).json({ error: 'Customer not found.' });
  res.json({ customer: cust.rows[0], purchaseHistory: history.rows });
}));

customersRouter.post('/', wrap(async (req, res) => {
  const d = z.object({ name:z.string().min(1), phone:z.string().optional(), email:z.string().email().optional().or(z.literal('')), address:z.string().optional(), customer_type:z.enum(['retail','wholesale','vip']).default('retail'), notes:z.string().optional() }).parse(req.body);
  const { rows: [c] } = await query('INSERT INTO customers (business_id,name,phone,email,address,customer_type,notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [req.user.businessId,d.name,d.phone||null,d.email||null,d.address||null,d.customer_type,d.notes||null]);
  res.status(201).json({ customer: c });
}));

customersRouter.patch('/:id', wrap(async (req, res) => {
  const d = z.object({ name:z.string().min(1).optional(), phone:z.string().nullable().optional(), email:z.string().email().or(z.literal('')).nullable().optional(), address:z.string().nullable().optional(), customer_type:z.enum(['retail','wholesale','vip']).optional(), notes:z.string().nullable().optional() }).parse(req.body);
  for (const k of ['phone','email','address','notes']) if (d[k] === '') d[k] = null;
  const sets=[]; const vals=[];
  for (const [k,v] of Object.entries(d)) { if (v!==undefined) sets.push(`${k}=$${vals.push(v)}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id, req.user.businessId);
  const { rows } = await query(`UPDATE customers SET ${sets.join(',')} WHERE id=$${vals.length-1} AND business_id=$${vals.length} RETURNING *`, vals);
  if (!rows[0]) return res.status(404).json({ error: 'Customer not found.' });
  res.json({ customer: rows[0] });
}));

customersRouter.delete('/:id', wrap(async (req, res) => {
  await query('DELETE FROM customers WHERE id=$1 AND business_id=$2', [req.params.id, req.user.businessId]);
  res.status(204).send();
}));

// ════════════════════════════════════════════════════════════════════════════
// EXPENSES
// ════════════════════════════════════════════════════════════════════════════
export const expensesRouter = Router();
expensesRouter.use(requireAuth);

expensesRouter.get('/', wrap(async (req, res) => {
  const { rows } = await query('SELECT e.*,b.name bname FROM expenses e LEFT JOIN branches b ON b.id=e.branch_id WHERE e.business_id=$1 ORDER BY e.incurred_at DESC,e.created_at DESC LIMIT 500', [req.user.businessId]);
  res.json({ expenses: rows });
}));

expensesRouter.get('/export', wrap(async (req, res) => {
  const { rows } = await query('SELECT incurred_at,category,description,amount,payment_method FROM expenses WHERE business_id=$1 ORDER BY incurred_at DESC', [req.user.businessId]);
  const header = 'date,category,description,amount,payment_method';
  const csv = rows.map(r=>[r.incurred_at,r.category,q(r.description||''),r.amount,r.payment_method].join(','));
  res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="expenses.csv"');
  res.send([header,...csv].join('\n'));
}));

expensesRouter.post('/', wrap(async (req, res) => {
  const d = z.object({ category:z.string().min(1), description:z.string().optional(), amount:z.number().positive(), payment_method:z.string().default('cash'), incurred_at:z.string().optional(), branch_id:z.string().uuid().optional().nullable() }).parse(req.body);
  const { rows: [e] } = await query('INSERT INTO expenses (business_id,branch_id,category,description,amount,payment_method,incurred_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [req.user.businessId,d.branch_id||null,d.category,d.description||null,d.amount,d.payment_method,d.incurred_at||new Date().toISOString().slice(0,10),req.user.id]);
  res.status(201).json({ expense: e });
}));

expensesRouter.delete('/:id', wrap(async (req, res) => {
  await query('DELETE FROM expenses WHERE id=$1 AND business_id=$2', [req.params.id, req.user.businessId]);
  res.status(204).send();
}));

// ════════════════════════════════════════════════════════════════════════════
// INVOICES
// ════════════════════════════════════════════════════════════════════════════
export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

invoicesRouter.get('/', wrap(async (req, res) => {
  const { rows } = await query('SELECT i.*,c.name cname FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.business_id=$1 ORDER BY i.created_at DESC', [req.user.businessId]);
  res.json({ invoices: rows });
}));

invoicesRouter.post('/', wrap(async (req, res) => {
  const d = z.object({ customer_id:z.string().uuid().optional().nullable(), invoice_number:z.string().min(1), amount_due:z.number().min(0), amount_paid:z.number().min(0).default(0), due_date:z.string().optional(), notes:z.string().optional() }).parse(req.body);
  const status = d.amount_paid >= d.amount_due ? 'paid' : d.amount_paid > 0 ? 'partial' : 'unpaid';
  const { rows: [inv] } = await query('INSERT INTO invoices (business_id,customer_id,invoice_number,amount_due,amount_paid,status,due_date,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [req.user.businessId,d.customer_id||null,d.invoice_number,d.amount_due,d.amount_paid,status,d.due_date||null,d.notes||null]);
  res.status(201).json({ invoice: inv });
}));

invoicesRouter.patch('/:id/payment', wrap(async (req, res) => {
  const { amount } = z.object({ amount:z.number().positive() }).parse(req.body);
  const { rows } = await query('SELECT * FROM invoices WHERE id=$1 AND business_id=$2', [req.params.id, req.user.businessId]);
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found.' });
  const newPaid = Number(rows[0].amount_paid) + amount;
  const status = newPaid >= Number(rows[0].amount_due) ? 'paid' : 'partial';
  const { rows: [inv] } = await query('UPDATE invoices SET amount_paid=$1,status=$2 WHERE id=$3 RETURNING *', [newPaid, status, req.params.id]);
  res.json({ invoice: inv });
}));

// ════════════════════════════════════════════════════════════════════════════
// BRANCHES
// ════════════════════════════════════════════════════════════════════════════
export const branchesRouter = Router();
branchesRouter.use(requireAuth);

branchesRouter.get('/', wrap(async (req, res) => {
  const { rows } = await query('SELECT b.*,u.name manager_name FROM branches b LEFT JOIN users u ON u.id=b.manager_id WHERE b.business_id=$1 AND b.is_active=true ORDER BY b.is_main DESC,b.name', [req.user.businessId]);
  res.json({ branches: rows });
}));

branchesRouter.post('/', requireRole('owner'), wrap(async (req, res) => {
  const d = z.object({ name:z.string().min(1), address:z.string().optional(), phone:z.string().optional(), manager_id:z.string().uuid().optional().nullable() }).parse(req.body);
  const { rows: [br] } = await query('INSERT INTO branches (business_id,name,address,phone,manager_id) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.user.businessId,d.name,d.address||null,d.phone||null,d.manager_id||null]);
  res.status(201).json({ branch: br });
}));

branchesRouter.patch('/:id', requireRole('owner','manager'), wrap(async (req, res) => {
  const d = z.object({ name:z.string().optional(), address:z.string().optional(), phone:z.string().optional(), manager_id:z.string().uuid().optional().nullable() }).parse(req.body);
  const sets=[]; const vals=[];
  for (const [k,v] of Object.entries(d)) { if (v!==undefined) sets.push(`${k}=$${vals.push(v)}`); }
  if (!sets.length) return res.status(400).json({ error:'Nothing to update.' });
  vals.push(req.params.id, req.user.businessId);
  const { rows } = await query(`UPDATE branches SET ${sets.join(',')} WHERE id=$${vals.length-1} AND business_id=$${vals.length} RETURNING *`, vals);
  if (!rows[0]) return res.status(404).json({ error:'Branch not found.' });
  res.json({ branch: rows[0] });
}));

// ════════════════════════════════════════════════════════════════════════════
// ALERTS
// ════════════════════════════════════════════════════════════════════════════
export const alertsRouter = Router();
alertsRouter.use(requireAuth);

alertsRouter.get('/', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM alerts WHERE business_id=$1 ORDER BY is_read ASC,created_at DESC LIMIT 100', [req.user.businessId]);
  res.json({ alerts: rows });
}));

alertsRouter.patch('/:id/read', wrap(async (req, res) => {
  await query('UPDATE alerts SET is_read=true WHERE id=$1 AND business_id=$2', [req.params.id, req.user.businessId]);
  res.json({ success:true });
}));

alertsRouter.post('/read-all', wrap(async (req, res) => {
  await query('UPDATE alerts SET is_read=true WHERE business_id=$1 AND is_read=false', [req.user.businessId]);
  res.json({ success:true });
}));

// ════════════════════════════════════════════════════════════════════════════
// OFFLINE SYNC
// ════════════════════════════════════════════════════════════════════════════
export const syncRouter = Router();
syncRouter.use(requireAuth);

syncRouter.post('/push', wrap(async (req, res) => {
  const { items, device_id } = z.object({ device_id: z.string().optional(), items: z.array(z.object({ offline_id:z.string(), type:z.enum(['sale','expense']), payload:z.any(), created_at:z.string().optional() })).max(200) }).parse(req.body);
  const bid = req.user.businessId;
  const results = [];
  for (const item of items) {
    try {
      const prior = await query('SELECT status,error_msg FROM offline_queue WHERE offline_id=$1 AND business_id=$2', [item.offline_id, bid]);
      if (prior.rows[0]?.status === 'synced' || prior.rows[0]?.status === 'conflict') { results.push({ offline_id:item.offline_id, status:'synced', duplicate:true }); continue; }
      let status = 'synced', note = null;
      await withTransaction(async client => {
        await client.query(`INSERT INTO offline_queue (business_id,user_id,device_id,type,payload,offline_id,status) VALUES ($1,$2,$3,$4,$5::jsonb,$6,'processing') ON CONFLICT (offline_id) DO UPDATE SET status='processing',error_msg=NULL`,
          [bid, req.user.id, device_id||'web', item.type, JSON.stringify(item.payload), item.offline_id]);
        if (item.type === 'sale') {
          const d = saleSchema.parse({ ...item.payload, offline_id: item.offline_id });
          const dup = await client.query('SELECT id FROM sales WHERE offline_id=$1 AND business_id=$2', [item.offline_id, bid]);
          if (!dup.rows[0]) {
            const r = await createSale(client, { bid, userId: req.user.id, d, allowNegative: true, createdAt: item.created_at || null });
            if (r.conflicts.length) { status = 'conflict'; note = r.conflicts.join('; '); }
          }
        } else if (item.type === 'expense') {
          const e = z.object({ category:z.string().min(1), description:z.string().optional(), amount:z.number().positive(), payment_method:z.string().default('cash'), incurred_at:z.string().optional() }).parse(item.payload);
          await client.query('INSERT INTO expenses (business_id,category,description,amount,payment_method,incurred_at,created_by,offline_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (offline_id) DO NOTHING',
            [bid, e.category, e.description||null, e.amount, e.payment_method, e.incurred_at||new Date().toISOString().slice(0,10), req.user.id, item.offline_id]);
        }
        await client.query('UPDATE offline_queue SET status=$1,error_msg=$2,synced_at=NOW() WHERE offline_id=$3', [status, note, item.offline_id]);
      });
      results.push({ offline_id: item.offline_id, status });
    } catch(e) {
      // permanent (validation / missing product) errors are reported so the app can show them, not retried forever
      await query(`INSERT INTO offline_queue (business_id,user_id,device_id,type,payload,offline_id,status,error_msg) VALUES ($1,$2,$3,$4,$5::jsonb,$6,'failed',$7) ON CONFLICT (offline_id) DO UPDATE SET status='failed',error_msg=$7`,
        [bid, req.user.id, device_id||'web', item.type, JSON.stringify(item.payload ?? {}), item.offline_id, e.message]).catch(()=>{});
      results.push({ offline_id: item.offline_id, status:'failed', error: e.message, permanent: e.name==='ZodError' || (e.status && e.status<500) });
    }
  }
  res.json({ results });
}));

syncRouter.get('/status', wrap(async (req, res) => {
  const { rows } = await query('SELECT offline_id,status,error_msg,synced_at FROM offline_queue WHERE business_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.businessId]);
  res.json({ queue: rows });
}));

// ════════════════════════════════════════════════════════════════════════════
// SUPPORT TICKETS
// ════════════════════════════════════════════════════════════════════════════
export const supportRouter = Router();
supportRouter.use(requireAuth);
supportRouter.get('/', wrap(async (req,res) => { const {rows}=await query('SELECT * FROM support_tickets WHERE business_id=$1 ORDER BY created_at DESC',[req.user.businessId]); res.json({tickets:rows}); }));
supportRouter.post('/', wrap(async (req,res) => { const d=z.object({subject:z.string().min(3),message:z.string().min(10),priority:z.enum(['low','normal','high','urgent']).default('normal')}).parse(req.body); const {rows:[t]}=await query('INSERT INTO support_tickets (business_id,user_id,subject,message,priority) VALUES ($1,$2,$3,$4,$5) RETURNING *',[req.user.businessId,req.user.id,d.subject,d.message,d.priority]); res.status(201).json({ticket:t}); }));

// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ════════════════════════════════════════════════════════════════════════════
export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);
categoriesRouter.get('/', wrap(async (req,res) => { const {rows}=await query('SELECT * FROM categories WHERE business_id=$1 ORDER BY name',[req.user.businessId]); res.json({categories:rows}); }));
categoriesRouter.post('/', wrap(async (req,res) => { const {name,color}=z.object({name:z.string().min(1),color:z.string().optional()}).parse(req.body); const {rows:[c]}=await query('INSERT INTO categories (business_id,name,color) VALUES ($1,$2,$3) RETURNING *',[req.user.businessId,name,color||null]); res.status(201).json({category:c}); }));
categoriesRouter.delete('/:id', wrap(async (req,res) => { await query('DELETE FROM categories WHERE id=$1 AND business_id=$2',[req.params.id,req.user.businessId]); res.status(204).send(); }));

// ════════════════════════════════════════════════════════════════════════════
// TEAM MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════
export const teamRouter = Router();
teamRouter.use(requireAuth, requireRole('owner','manager'));
teamRouter.get('/', wrap(async (req,res) => { const {rows}=await query('SELECT id,name,email,phone,role,is_active,last_login_at,created_at FROM users WHERE business_id=$1 ORDER BY name',[req.user.businessId]); res.json({users:rows}); }));
teamRouter.post('/', requireRole('owner'), wrap(async (req,res) => {
  const d=z.object({name:z.string().min(2),email:z.string().email(),password:z.string().min(8),role:z.enum(['manager','staff','accountant']),phone:z.string().optional()}).parse(req.body);
  d.email=d.email.trim().toLowerCase(); const exists=await query('SELECT id FROM users WHERE lower(email)=$1',[d.email]); if(exists.rows[0]) return res.status(409).json({error:'Email already registered.'});
  const hash=await bcrypt.hash(d.password,10); const {rows:[u]}=await query('INSERT INTO users (business_id,name,email,phone,password_hash,role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,email,phone,role,created_at',[req.user.businessId,d.name,d.email,d.phone||null,hash,d.role]);
  res.status(201).json({user:u});
}));
teamRouter.patch('/:id', requireRole('owner'), wrap(async (req,res) => { const d=z.object({role:z.string().optional(),is_active:z.boolean().optional(),name:z.string().optional()}).parse(req.body); const sets=[],vals=[]; for(const[k,v] of Object.entries(d)){if(v!==undefined)sets.push(`${k}=$${vals.push(v)}`);} vals.push(req.params.id,req.user.businessId); const {rows}=await query(`UPDATE users SET ${sets.join(',')} WHERE id=$${vals.length-1} AND business_id=$${vals.length} RETURNING id,name,email,role,is_active`,vals); if(!rows[0]) return res.status(404).json({error:'User not found.'}); res.json({user:rows[0]}); }));
teamRouter.delete('/:id', requireRole('owner'), wrap(async (req,res) => { if(req.params.id===req.user.id) return res.status(400).json({error:'Cannot deactivate your own account.'}); await query('UPDATE users SET is_active=false WHERE id=$1 AND business_id=$2',[req.params.id,req.user.businessId]); res.status(204).send(); }));

// ════════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ════════════════════════════════════════════════════════════════════════════
export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole('owner','manager'));
auditRouter.get('/', wrap(async (req,res) => { const {rows}=await query('SELECT a.*,u.name uname FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.business_id=$1 ORDER BY a.created_at DESC LIMIT 200',[req.user.businessId]); res.json({auditLog:rows}); }));

// ════════════════════════════════════════════════════════════════════════════
// SUPPLIERS  — contact book + one-tap WhatsApp / call pre-orders
// ════════════════════════════════════════════════════════════════════════════
export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

const supplierSchema = z.object({
  name: z.string().min(1), contact_person: z.string().optional().nullable(),
  phone: z.string().optional().nullable(), whatsapp: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(), products_note: z.string().optional().nullable(),
  payment_terms: z.string().optional().nullable(), lead_time_days: z.number().int().min(0).optional().nullable(),
  notes: z.string().optional().nullable(), total_owed: z.number().min(0).optional(),
});
const SUP_COLS = ['name','contact_person','phone','whatsapp','email','address','products_note','payment_terms','lead_time_days','notes','total_owed'];
const withWa = s => ({ ...s, wa_number: normalizePhone(s.whatsapp || s.phone), call_number: (s.phone || s.whatsapp || '').replace(/[^\d+]/g, '') });

suppliersRouter.get('/', wrap(async (req, res) => {
  const search = req.query.q ? `%${req.query.q}%` : '%';
  const { rows } = await query(`
    SELECT s.*,
      (SELECT COUNT(*)::int FROM products p WHERE p.supplier_id=s.id AND p.is_active=true) product_count,
      (SELECT COUNT(*)::int FROM products p WHERE p.supplier_id=s.id AND p.is_active=true AND p.is_service=false AND COALESCE((SELECT SUM(i.quantity) FROM inventory i WHERE i.product_id=p.id),0)<=p.reorder_level) shortage_count,
      (SELECT MAX(created_at) FROM preorders o WHERE o.supplier_id=s.id) last_preorder_at
    FROM suppliers s WHERE s.business_id=$1 AND s.is_active=true AND (s.name ILIKE $2 OR s.contact_person ILIKE $2 OR s.phone ILIKE $2 OR s.products_note ILIKE $2)
    ORDER BY shortage_count DESC, s.name`, [req.user.businessId, search]);
  res.json({ suppliers: rows.map(withWa) });
}));

suppliersRouter.get('/export', wrap(async (req, res) => {
  const { rows } = await query('SELECT name,contact_person,phone,whatsapp,email,address,products_note,payment_terms FROM suppliers WHERE business_id=$1 AND is_active=true ORDER BY name', [req.user.businessId]);
  const header = 'name,contact_person,phone,whatsapp,email,address,products_note,payment_terms';
  res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="suppliers.csv"');
  res.send([header, ...rows.map(r => [r.name,r.contact_person,r.phone,r.whatsapp,r.email,r.address,r.products_note,r.payment_terms].map(q).join(','))].join('\n'));
}));

suppliersRouter.get('/:id', wrap(async (req, res) => {
  const bid = req.user.businessId;
  const { rows: [s] } = await query('SELECT * FROM suppliers WHERE id=$1 AND business_id=$2 AND is_active=true', [req.params.id, bid]);
  if (!s) return res.status(404).json({ error: 'Supplier not found.' });
  const [products, orders, shortages] = await Promise.all([
    query(`SELECT p.id,p.name,p.sku,p.unit,p.cost_price,p.reorder_level,COALESCE((SELECT SUM(i.quantity) FROM inventory i WHERE i.product_id=p.id),0)::float qty FROM products p WHERE p.supplier_id=$1 AND p.business_id=$2 AND p.is_active=true ORDER BY p.name`, [s.id, bid]),
    query('SELECT o.*,u.name uname FROM preorders o LEFT JOIN users u ON u.id=o.created_by WHERE o.supplier_id=$1 AND o.business_id=$2 ORDER BY o.created_at DESC LIMIT 30', [s.id, bid]),
    getShortages(bid),
  ]);
  const group = shortages.suppliers.find(g => g.id === s.id);
  res.json({ supplier: withWa(s), products: products.rows, preorders: orders.rows, shortages: group?.items || [] });
}));

suppliersRouter.post('/', requireRole('owner','manager'), wrap(async (req, res) => {
  const d = supplierSchema.parse(req.body);
  if (!d.phone && !d.whatsapp) throw httpError('Add at least a phone or WhatsApp number so you can reach this supplier.');
  const cols = SUP_COLS.filter(c => d[c] !== undefined && d[c] !== '');
  const { rows: [s] } = await query(`INSERT INTO suppliers (business_id,${cols.join(',')}) VALUES ($1,${cols.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`, [req.user.businessId, ...cols.map(c => d[c])]);
  res.status(201).json({ supplier: withWa(s) });
}));

suppliersRouter.patch('/:id', requireRole('owner','manager'), wrap(async (req, res) => {
  const d = supplierSchema.partial().parse(req.body);
  const sets = [], vals = [];
  for (const c of SUP_COLS) if (d[c] !== undefined) sets.push(`${c}=$${vals.push(d[c] === '' ? null : d[c])}`);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id, req.user.businessId);
  const { rows } = await query(`UPDATE suppliers SET ${sets.join(',')} WHERE id=$${vals.length - 1} AND business_id=$${vals.length} RETURNING *`, vals);
  if (!rows[0]) return res.status(404).json({ error: 'Supplier not found.' });
  res.json({ supplier: withWa(rows[0]) });
}));

suppliersRouter.delete('/:id', requireRole('owner','manager'), wrap(async (req, res) => {
  await query('UPDATE suppliers SET is_active=false WHERE id=$1 AND business_id=$2', [req.params.id, req.user.businessId]);
  await query('UPDATE products SET supplier_id=NULL WHERE supplier_id=$1 AND business_id=$2', [req.params.id, req.user.businessId]);
  res.status(204).send();
}));

// Log a pre-order that was just sent via WhatsApp / phone call.
suppliersRouter.post('/:id/preorders', wrap(async (req, res) => {
  const d = z.object({
    channel: z.enum(['whatsapp','call','other']).default('whatsapp'),
    message: z.string().max(4000).optional(),
    branch_id: z.string().uuid().optional().nullable(),
    items: z.array(z.object({ product_id: z.string().uuid().optional(), name: z.string(), quantity: z.number().positive(), unit: z.string().optional() })).default([]),
  }).parse(req.body);
  const sup = await query('SELECT id FROM suppliers WHERE id=$1 AND business_id=$2', [req.params.id, req.user.businessId]);
  if (!sup.rows[0]) return res.status(404).json({ error: 'Supplier not found.' });
  const { rows: [o] } = await query('INSERT INTO preorders (business_id,supplier_id,branch_id,channel,message,items,created_by) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *',
    [req.user.businessId, req.params.id, d.branch_id || null, d.channel, d.message || null, JSON.stringify(d.items), req.user.id]);
  res.status(201).json({ preorder: o });
}));

export const preordersRouter = Router();
preordersRouter.use(requireAuth);

preordersRouter.get('/', wrap(async (req, res) => {
  const { rows } = await query('SELECT o.*,s.name supplier_name FROM preorders o JOIN suppliers s ON s.id=o.supplier_id WHERE o.business_id=$1 ORDER BY o.created_at DESC LIMIT 100', [req.user.businessId]);
  res.json({ preorders: rows });
}));

preordersRouter.patch('/:id', requireRole('owner','manager'), wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(['sent','confirmed','cancelled']) }).parse(req.body);
  const { rows } = await query("UPDATE preorders SET status=$1 WHERE id=$2 AND business_id=$3 AND status<>'received' RETURNING *", [status, req.params.id, req.user.businessId]);
  if (!rows[0]) return res.status(404).json({ error: 'Pre-order not found or already received.' });
  res.json({ preorder: rows[0] });
}));

// Mark as received → adds the ordered quantities to stock (main branch unless branch_id set).
preordersRouter.post('/:id/receive', requireRole('owner','manager'), wrap(async (req, res) => {
  const bid = req.user.businessId;
  await withTransaction(async c => {
    const { rows: [o] } = await c.query('SELECT * FROM preorders WHERE id=$1 AND business_id=$2 FOR UPDATE', [req.params.id, bid]);
    if (!o) throw httpError('Pre-order not found.', 404);
    if (o.status === 'received') throw httpError('This pre-order was already received.');
    const branchId = o.branch_id || (await c.query('SELECT id FROM branches WHERE business_id=$1 AND is_main=true LIMIT 1', [bid])).rows[0]?.id;
    for (const it of o.items) {
      if (!it.product_id) continue;
      const pr = (await c.query('SELECT id,name,reorder_level FROM products WHERE id=$1 AND business_id=$2', [it.product_id, bid])).rows[0];
      if (!pr) continue;
      const before = Number((await c.query('SELECT quantity FROM inventory WHERE product_id=$1 AND branch_id=$2 FOR UPDATE', [pr.id, branchId])).rows[0]?.quantity || 0);
      const after = before + Number(it.quantity);
      await c.query('INSERT INTO inventory (business_id,branch_id,product_id,quantity) VALUES ($1,$2,$3,$4) ON CONFLICT (branch_id,product_id) DO UPDATE SET quantity=$4,updated_at=NOW()', [bid, branchId, pr.id, after]);
      await c.query(`INSERT INTO inventory_movements (business_id,branch_id,product_id,type,quantity,before_qty,after_qty,reference_id,notes,created_by) VALUES ($1,$2,$3,'purchase',$4,$5,$6,$7,'Pre-order received',$8)`, [bid, branchId, pr.id, it.quantity, before, after, o.id, req.user.id]);
      await syncShortageAlert(c, bid, pr, await totalQty(c, bid, pr.id));
    }
    await c.query("UPDATE preorders SET status='received',received_at=NOW() WHERE id=$1", [o.id]);
  });
  res.json({ success: true });
}));

// ════════════════════════════════════════════════════════════════════════════
// SHORTAGES  — rule-based detection (stock <= reorder level), grouped by supplier
// ════════════════════════════════════════════════════════════════════════════
export const shortagesRouter = Router();
shortagesRouter.use(requireAuth);

shortagesRouter.get('/summary', wrap(async (req, res) => {
  res.json((await getShortages(req.user.businessId)).summary);
}));

shortagesRouter.get('/', wrap(async (req, res) => {
  const data = await getShortages(req.user.businessId, req.query.branch_id || null);
  const { rows: [b] } = await query('SELECT name FROM businesses WHERE id=$1', [req.user.businessId]);
  res.json({ ...data, businessName: b?.name });
}));

// ════════════════════════════════════════════════════════════════════════════
// CSV IMPORT (validate with ?dry=1, then run without it)
// ════════════════════════════════════════════════════════════════════════════
export const importRouter = Router();
importRouter.use(requireAuth, requireRole('owner','manager'));
importRouter.post('/:module', upload.single('file'), wrap(async (req, res) => {
  const module = req.params.module;
  if (!IMPORT_MODULES.includes(module)) return res.status(404).json({ error: `Unknown import type "${module}".` });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const out = await runImport(module, req.file.buffer, { bid: req.user.businessId, userId: req.user.id }, req.query.dry === '1');
  if (out.error) return res.status(400).json({ error: out.error });
  if (req.query.dry !== '1') await query(`INSERT INTO audit_log (business_id,user_id,action_type,description) VALUES ($1,$2,'import',$3)`, [req.user.businessId, req.user.id, `Imported ${out.imported}/${out.totalRows} ${module} rows from CSV`]);
  res.json(out);
}));
