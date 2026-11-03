// Master-admin API — used by the web page served at /admin (backend/public/admin).
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query, pool } from '../db/index.js';
import { wrap } from '../middleware/index.js';
import { flushTraffic } from '../lib/traffic.js';

export const adminRouter = Router();
const signAdmin = id => jwt.sign({ sub: id, scope: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });

async function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Please sign in.', code: 'TOKEN_INVALID' });
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch { return res.status(401).json({ error: 'Session expired. Please sign in again.', code: 'TOKEN_INVALID' }); }
  if (payload.scope !== 'admin') return res.status(401).json({ error: 'Please sign in.', code: 'TOKEN_INVALID' });
  try {
    const { rows } = await query('SELECT id,name,email,role FROM admins WHERE id=$1', [payload.sub]);
    if (!rows[0]) return res.status(401).json({ error: 'Admin account not found.', code: 'TOKEN_INVALID' });
    req.admin = rows[0]; next();
  } catch { res.status(503).json({ error: 'Database unavailable.' }); }
}
const superOnly = (req, res, next) => req.admin.role === 'superadmin' ? next() : res.status(403).json({ error: 'Super-admin only.' });

// ── Bootstrap: make sure there is a way in ────────────────────────────────
export async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || '';
  if (email && pw) {
    if (pw.length < 8) { console.error('[admin] ADMIN_PASSWORD must be at least 8 characters — skipped.'); return; }
    const hash = await bcrypt.hash(pw, 10);
    const ex = await pool.query('SELECT id FROM admins WHERE email=$1', [email]);
    if (!ex.rows[0]) { await pool.query(`INSERT INTO admins (name,email,password_hash,role) VALUES ('Master Admin',$1,$2,'superadmin')`, [email, hash]); console.log(`[admin] ✓ Admin created: ${email}`); }
    else if (process.env.ADMIN_RESET_PASSWORD === 'true') { await pool.query('UPDATE admins SET password_hash=$1 WHERE id=$2', [hash, ex.rows[0].id]); console.log(`[admin] ✓ Password reset for ${email} (remove ADMIN_RESET_PASSWORD afterwards)`); }
    return;
  }
  const n = await pool.query('SELECT COUNT(*)::int c FROM admins');
  if (n.rows[0].c === 0) {
    const generated = crypto.randomBytes(9).toString('base64url');
    await pool.query(`INSERT INTO admins (name,email,password_hash,role) VALUES ('Master Admin','admin@pulsetrack.local',$1,'superadmin')`, [await bcrypt.hash(generated, 10)]);
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  MASTER ADMIN CREATED (shown only once — save it!)   ║');
    console.log(`║  Email:    admin@pulsetrack.local                    ║`);
    console.log(`║  Password: ${generated.padEnd(41)} ║`);
    console.log('║  Set ADMIN_EMAIL + ADMIN_PASSWORD to choose your own ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in 15 minutes.' } });
adminRouter.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password } = z.object({ email: z.string().trim().min(3), password: z.string().min(1) }).parse(req.body);
  const { rows } = await query('SELECT * FROM admins WHERE lower(email)=$1', [email.toLowerCase()]);
  if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ error: 'Wrong email or password.' });
  res.json({ token: signAdmin(rows[0].id), admin: { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role } });
}));
adminRouter.get('/me', requireAdmin, (req, res) => res.json({ admin: req.admin }));

adminRouter.post('/password', requireAdmin, wrap(async (req, res) => {
  const { current, newPassword } = z.object({ current: z.string(), newPassword: z.string().min(8) }).parse(req.body);
  const { rows } = await query('SELECT password_hash FROM admins WHERE id=$1', [req.admin.id]);
  if (!(await bcrypt.compare(current, rows[0].password_hash))) return res.status(400).json({ error: 'Current password is wrong.' });
  await query('UPDATE admins SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(newPassword, 10), req.admin.id]);
  res.json({ success: true });
}));

// ── Overview: health + usage + traffic ────────────────────────────────────
adminRouter.get('/overview', requireAdmin, wrap(async (req, res) => {
  await flushTraffic();
  const t0 = Date.now(); await query('SELECT 1'); const dbPing = Date.now() - t0;
  const [biz, users, active24, sales, tickets, pwReq, sizeQ, traf24, trafHourly, topPaths, errs, signups] = await Promise.all([
    query('SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE is_active)::int active FROM businesses'),
    query('SELECT COUNT(*)::int c FROM users'),
    query("SELECT COUNT(*)::int c FROM users WHERE last_login_at >= NOW()-INTERVAL '24 hours'"),
    query("SELECT COUNT(*)::int c, COALESCE(SUM(total_amount),0)::float rev FROM sales WHERE status='completed'"),
    query("SELECT COUNT(*)::int c FROM support_tickets WHERE status IN ('open','in_progress')"),
    query("SELECT COUNT(*)::int c FROM password_requests WHERE status='open'"),
    query('SELECT pg_database_size(current_database())::float bytes'),
    query("SELECT COALESCE(SUM(requests),0)::int requests, COALESCE(SUM(errors),0)::int errors, COALESCE(ROUND(SUM(total_ms)::numeric/NULLIF(SUM(requests),0)),0)::int avg_ms FROM traffic_hourly WHERE hour >= NOW()-INTERVAL '24 hours'"),
    query("SELECT hour, SUM(requests)::int requests, SUM(errors)::int errors FROM traffic_hourly WHERE hour >= NOW()-INTERVAL '48 hours' GROUP BY hour ORDER BY hour"),
    query("SELECT method,path,SUM(requests)::int requests,SUM(errors)::int errors,ROUND(SUM(total_ms)::numeric/NULLIF(SUM(requests),0))::int avg_ms FROM traffic_paths WHERE day >= CURRENT_DATE-1 GROUP BY method,path ORDER BY requests DESC LIMIT 15"),
    query("SELECT COUNT(*)::int c FROM server_errors WHERE created_at >= NOW()-INTERVAL '24 hours'"),
    query("SELECT DATE(created_at) AS day,COUNT(*)::int count FROM businesses WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY 1 ORDER BY 1"),
  ]);
  res.json({
    server: { uptimeSec: Math.round(process.uptime()), node: process.version, memoryMb: Math.round(process.memoryUsage().rss / 1048576), dbPingMs: dbPing, dbSizeMb: Math.round(sizeQ.rows[0].bytes / 1048576 * 10) / 10, env: process.env.NODE_ENV || 'development' },
    totals: { businesses: biz.rows[0].total, activeBusinesses: biz.rows[0].active, users: users.rows[0].c, activeUsers24h: active24.rows[0].c, sales: sales.rows[0].c, salesValue: sales.rows[0].rev, openTickets: tickets.rows[0].c, passwordRequests: pwReq.rows[0].c },
    traffic24h: traf24.rows[0], trafficHourly: trafHourly.rows, topPaths: topPaths.rows, errors24h: errs.rows[0].c, signups: signups.rows,
  });
}));

adminRouter.get('/errors', requireAdmin, wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM server_errors ORDER BY id DESC LIMIT 100'); res.json({ errors: rows });
}));

// ── Database browser (read-only) ──────────────────────────────────────────
async function tableNames() {
  const { rows } = await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
  return rows.map(r => r.table_name);
}
const SECRET_COL = /password|secret|token/i;

adminRouter.get('/db/tables', requireAdmin, wrap(async (req, res) => {
  const names = await tableNames(); const out = [];
  for (const name of names) { const { rows } = await query(`SELECT COUNT(*)::int c FROM "${name}"`); out.push({ name, rows: rows[0].c }); }
  res.json({ tables: out });
}));

adminRouter.get('/db/tables/:name', requireAdmin, wrap(async (req, res) => {
  const names = await tableNames();
  if (!names.includes(req.params.name)) return res.status(404).json({ error: 'No such table.' });
  const t = req.params.name;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200), offset = Math.max(Number(req.query.offset) || 0, 0);
  const cols = (await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [t])).rows;
  const safeCols = cols.map(c => SECRET_COL.test(c.column_name) ? `'••• hidden •••' AS "${c.column_name}"` : `"${c.column_name}"`).join(',');
  const params = []; let where = '';
  if (req.query.q) {
    const searchable = cols.filter(c => !SECRET_COL.test(c.column_name)).map(c => `"${c.column_name}"::text ILIKE $1`);
    params.push(`%${String(req.query.q).slice(0, 80)}%`); where = `WHERE ${searchable.join(' OR ')}`;
  }
  const total = (await query(`SELECT COUNT(*)::int c FROM "${t}" ${where}`, params)).rows[0].c;
  const { rows } = await query(`SELECT ${safeCols} FROM "${t}" ${where} ORDER BY 1 LIMIT ${limit} OFFSET ${offset}`, params);
  res.json({ table: t, columns: cols, total, limit, offset, rows });
}));

// ── Users & password reset ────────────────────────────────────────────────
adminRouter.get('/users', requireAdmin, wrap(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const { rows } = await query(`SELECT u.id,u.name,u.email,u.role,u.is_active,u.last_login_at,u.created_at,b.id business_id,b.name business,b.is_active business_active
    FROM users u JOIN businesses b ON b.id=u.business_id WHERE u.email ILIKE $1 OR u.name ILIKE $1 OR b.name ILIKE $1 ORDER BY u.created_at DESC LIMIT 100`, [q]);
  res.json({ users: rows });
}));

adminRouter.post('/users/:id/reset-password', requireAdmin, wrap(async (req, res) => {
  const d = z.object({ password: z.string().min(8).optional() }).parse(req.body || {});
  const pw = d.password || crypto.randomBytes(7).toString('base64url');
  const { rows } = await query('UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING email', [await bcrypt.hash(pw, 10), req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
  await query("UPDATE password_requests SET status='done' WHERE lower(email)=lower($1) AND status='open'", [rows[0].email]);
  res.json({ success: true, email: rows[0].email, password: pw });
}));

adminRouter.post('/users/:id/active', requireAdmin, wrap(async (req, res) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  await query('UPDATE users SET is_active=$1 WHERE id=$2', [active, req.params.id]); res.json({ success: true });
}));

adminRouter.get('/password-requests', requireAdmin, wrap(async (req, res) => {
  const { rows } = await query(`SELECT r.*, (SELECT u.id FROM users u WHERE lower(u.email)=lower(r.email) LIMIT 1) user_id FROM password_requests r ORDER BY (status='open') DESC, created_at DESC LIMIT 100`);
  res.json({ requests: rows });
}));
adminRouter.post('/password-requests/:id/dismiss', requireAdmin, wrap(async (req, res) => { await query("UPDATE password_requests SET status='dismissed' WHERE id=$1", [req.params.id]); res.json({ success: true }); }));

// ── Businesses ────────────────────────────────────────────────────────────
adminRouter.get('/businesses', requireAdmin, wrap(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const { rows } = await query(`SELECT b.id,b.name,b.industry,b.is_active,b.created_at,
      (SELECT COUNT(*)::int FROM users WHERE business_id=b.id) users,
      (SELECT COUNT(*)::int FROM products WHERE business_id=b.id) products,
      (SELECT COUNT(*)::int FROM sales WHERE business_id=b.id) sales,
      (SELECT COALESCE(SUM(total_amount),0)::float FROM sales WHERE business_id=b.id AND status='completed') revenue
    FROM businesses b WHERE b.name ILIKE $1 ORDER BY b.created_at DESC LIMIT 100`, [q]);
  res.json({ businesses: rows });
}));
adminRouter.post('/businesses/:id/active', requireAdmin, superOnly, wrap(async (req, res) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  await query('UPDATE businesses SET is_active=$1 WHERE id=$2', [active, req.params.id]); res.json({ success: true });
}));

// ── Support tickets ───────────────────────────────────────────────────────
adminRouter.get('/tickets', requireAdmin, wrap(async (req, res) => {
  const { rows } = await query(`SELECT t.*,b.name business,u.name uname,u.email uemail FROM support_tickets t JOIN businesses b ON b.id=t.business_id LEFT JOIN users u ON u.id=t.user_id ORDER BY (t.status IN ('open','in_progress')) DESC, t.created_at DESC LIMIT 100`);
  res.json({ tickets: rows });
}));
adminRouter.post('/tickets/:id/status', requireAdmin, wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(['open', 'in_progress', 'resolved']) }).parse(req.body);
  await query("UPDATE support_tickets SET status=$1, assigned_to=$2, resolved_at=CASE WHEN $1='resolved' THEN NOW() ELSE NULL END WHERE id=$3", [status, req.admin.id, req.params.id]);
  res.json({ success: true });
}));

// ── Admin accounts ────────────────────────────────────────────────────────
adminRouter.get('/admins', requireAdmin, superOnly, wrap(async (req, res) => {
  const { rows } = await query('SELECT id,name,email,role,created_at FROM admins ORDER BY created_at'); res.json({ admins: rows });
}));
adminRouter.post('/admins', requireAdmin, superOnly, wrap(async (req, res) => {
  const d = z.object({ name: z.string().min(2), email: z.string().trim().email(), password: z.string().min(8), role: z.enum(['superadmin', 'staff']).default('staff') }).parse(req.body);
  const { rows: [a] } = await query('INSERT INTO admins (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role', [d.name, d.email.toLowerCase(), await bcrypt.hash(d.password, 10), d.role]);
  res.status(201).json({ admin: a });
}));
adminRouter.delete('/admins/:id', requireAdmin, superOnly, wrap(async (req, res) => {
  if (req.params.id === req.admin.id) return res.status(400).json({ error: "You can't delete yourself." });
  await query('DELETE FROM admins WHERE id=$1', [req.params.id]); res.json({ success: true });
}));
