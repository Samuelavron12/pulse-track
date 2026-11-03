// Lightweight request/traffic recorder. Counts are buffered in memory and flushed to
// Postgres every 30 s, so tracking never slows a request down.
import { pool } from '../db/index.js';

const hourly = new Map();   // "ISOhour|area" -> {requests,errors,ms}
const paths  = new Map();   // "day|METHOD|path" -> {requests,errors,ms}
let errorBuf = [];

const norm = p => p
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
  .replace(/\/\d+(?=\/|$)/g, '/:n')
  .slice(0, 120);

export function trafficMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const url = req.originalUrl.split('?')[0];
      if (!url.startsWith('/api') && !url.startsWith('/admin/api')) return;
      const area = url.startsWith('/admin/api') ? 'admin' : 'api';
      const ms = Number((process.hrtime.bigint() - start) / 1_000_000n);
      const isErr = res.statusCode >= 500 ? 1 : 0;
      const now = new Date();
      const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000).toISOString();
      const day = now.toISOString().slice(0, 10);
      const h = hourly.get(`${hour}|${area}`) || { requests: 0, errors: 0, ms: 0 };
      h.requests++; h.errors += isErr; h.ms += ms; hourly.set(`${hour}|${area}`, h);
      const pk = `${day}|${req.method}|${norm(url)}`;
      const p = paths.get(pk) || { requests: 0, errors: 0, ms: 0 };
      p.requests++; p.errors += isErr; p.ms += ms; paths.set(pk, p);
    } catch { /* never break a request */ }
  });
  next();
}

export function recordError(req, err) {
  errorBuf.push({ method: req.method, path: (req.originalUrl || req.path || '').slice(0, 200), message: String(err.message || err).slice(0, 500), stack: String(err.stack || '').slice(0, 2000) });
  if (errorBuf.length > 200) errorBuf = errorBuf.slice(-200);
}

export async function flushTraffic() {
  const h = [...hourly.entries()]; hourly.clear();
  const p = [...paths.entries()]; paths.clear();
  const e = errorBuf; errorBuf = [];
  if (!h.length && !p.length && !e.length) return;
  try {
    for (const [k, v] of h) {
      const [hour, area] = k.split('|');
      await pool.query(`INSERT INTO traffic_hourly (hour,area,requests,errors,total_ms) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (hour,area) DO UPDATE SET requests=traffic_hourly.requests+EXCLUDED.requests, errors=traffic_hourly.errors+EXCLUDED.errors, total_ms=traffic_hourly.total_ms+EXCLUDED.total_ms`, [hour, area, v.requests, v.errors, v.ms]);
    }
    for (const [k, v] of p) {
      const [day, method, path] = k.split('|');
      await pool.query(`INSERT INTO traffic_paths (day,method,path,requests,errors,total_ms) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (day,method,path) DO UPDATE SET requests=traffic_paths.requests+EXCLUDED.requests, errors=traffic_paths.errors+EXCLUDED.errors, total_ms=traffic_paths.total_ms+EXCLUDED.total_ms`, [day, method, path, v.requests, v.errors, v.ms]);
    }
    for (const x of e) await pool.query('INSERT INTO server_errors (method,path,message,stack) VALUES ($1,$2,$3,$4)', [x.method, x.path, x.message, x.stack]);
    // keep the tables small: 90 days of traffic, last 1000 errors
    await pool.query("DELETE FROM traffic_hourly WHERE hour < NOW() - INTERVAL '90 days'");
    await pool.query("DELETE FROM traffic_paths WHERE day < CURRENT_DATE - 30");
    await pool.query('DELETE FROM server_errors WHERE id < (SELECT COALESCE(MAX(id),0)-1000 FROM server_errors)');
  } catch (err) { console.error('[traffic] flush failed:', err.message); }
}

export function startTrafficFlush() {
  const t = setInterval(flushTraffic, 30_000); t.unref?.();
  const bye = async () => { await flushTraffic(); process.exit(0); };
  process.once('SIGTERM', bye); process.once('SIGINT', bye);
}
