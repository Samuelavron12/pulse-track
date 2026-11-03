import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';

// ── Auth ──────────────────────────────────────────────────────────────────
export async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Please log in to continue.', code: 'NO_TOKEN' });
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Your session has expired. Please log in again.', code: 'TOKEN_INVALID' }); }
  if (payload.scope === 'admin') return res.status(401).json({ error: 'Please log in to continue.', code: 'TOKEN_INVALID' });
  try {
    const { rows } = await query(
      'SELECT u.*,b.is_active as business_active FROM users u JOIN businesses b ON b.id=u.business_id WHERE u.id=$1 AND u.is_active=true',
      [payload.sub]
    );
    if (!rows[0]) return res.status(401).json({ error: 'This account no longer exists. Please log in again.', code: 'TOKEN_INVALID' });
    if (!rows[0].business_active) return res.status(403).json({ error: 'Account suspended. Contact support.', code: 'SUSPENDED' });
    req.user = {
      id: rows[0].id, businessId: rows[0].business_id, role: rows[0].role, name: rows[0].name,
      email: rows[0].email, language: rows[0].language, theme: rows[0].theme,
    };
    next();
  } catch (e) {
    // Database trouble is NOT a logged-out user — never tell the app to drop the session.
    console.error('[auth] database error:', e.message);
    return res.status(503).json({ error: 'The server is busy. Please try again in a moment.', code: 'DB_UNAVAILABLE' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: `This action requires one of: ${roles.join(', ')}.` });
    }
    next();
  };
}

// ── Async wrapper ──────────────────────────────────────────────────────────
export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── Error handler ──────────────────────────────────────────────────────────
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) { console.error(`[error] ${req.method} ${req.path}`, err.stack || err.message); req.app.locals.recordError?.(req, err); }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation error.', details: err.errors?.map(e=>({ path:e.path.join('.'), message:e.message })) });
  }
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our end.' : err.message });
}

export function notFound(req, res) {
  res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
}
