import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import path from 'path';

import { pool } from './db/index.js';
import { errorHandler, notFound } from './middleware/index.js';
import {
  authRouter, dashRouter, analysisRouter, productsRouter, salesRouter,
  customersRouter, expensesRouter, invoicesRouter, branchesRouter,
  alertsRouter, syncRouter, supportRouter,
  suppliersRouter, preordersRouter, shortagesRouter, importRouter,
  categoriesRouter, teamRouter, auditRouter,
} from './routes/index.js';
import { adminRouter, ensureAdmin } from './routes/admin.js';
import { trafficMiddleware, recordError, startTrafficFlush } from './lib/traffic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Auto-migrate on boot ──────────────────────────────────────────────────
async function migrate() {
  const schema = readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf-8');
  await pool.query(schema);
  console.log('[db] ✓ Schema ready');
}

// ── Security ──────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.locals.recordError = recordError;
app.use(helmet({ crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(trafficMiddleware);

app.use(express.json({ limit: '4mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS: the app authenticates with a Bearer token (no cookies), so it is safe to accept any
// origin by default — this is what stops "cannot connect to server" errors from the website,
// the Android app (https://localhost) and the preview URLs. Set CORS_ORIGIN to lock it down.
const allowed = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowed.length ? (origin, cb) => cb(null, !origin || allowed.includes(origin)) : true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900_000,
  max: Number(process.env.RATE_LIMIT_MAX) || 3000,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});
app.use('/api', limiter);
// brute-force protection for sign-in / sign-up / password requests
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password'], rateLimit({
  windowMs: 15 * 60_000, max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 60,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
}));

// ── Health ────────────────────────────────────────────────────────────────
const health = async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', app: 'pulse-track', time: new Date().toISOString() }); }
  catch { res.status(503).json({ status: 'error', db: 'unreachable' }); }
};
app.get('/health', health);
app.get('/api/health', health);

// ── Business API ──────────────────────────────────────────────────────────
app.use('/api/auth',        authRouter);
app.use('/api/dashboard',   dashRouter);
app.use('/api/analysis',    analysisRouter);
app.use('/api/products',    productsRouter);
app.use('/api/categories',  categoriesRouter);
app.use('/api/sales',       salesRouter);
app.use('/api/customers',   customersRouter);
app.use('/api/expenses',    expensesRouter);
app.use('/api/invoices',    invoicesRouter);
app.use('/api/branches',    branchesRouter);
app.use('/api/alerts',      alertsRouter);
app.use('/api/sync',        syncRouter);
app.use('/api/suppliers',   suppliersRouter);
app.use('/api/preorders',   preordersRouter);
app.use('/api/shortages',   shortagesRouter);
app.use('/api/import',      importRouter);
app.use('/api/support',     supportRouter);
app.use('/api/team',        teamRouter);
app.use('/api/audit',       auditRouter);

// ── Master Admin: API + web page (served at /admin, no build step) ─────────
app.use('/admin/api', adminRouter);
app.use('/admin', express.static(path.join(__dirname, '../public/admin'), { index: 'index.html' }));

// ── Optional: serve the built web app from this same server ───────────────
// (run `npm run build` in /frontend first; handy for one-server deployments)
const webDist = path.join(__dirname, '../../frontend/dist');
if (existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|admin|health).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
async function boot() {
  // retry so a database that is still waking up (free tiers) doesn't kill the server
  for (let i = 1; ; i++) {
    try { await migrate(); break; }
    catch (err) {
      if (i >= 6) throw err;
      console.error(`[db] not ready (${err.message}) — retry ${i}/5 in 5s`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  await ensureAdmin();
  startTrafficFlush();
  if (process.env.SEED_DEMO === 'true') { try { await (await import('./db/seed.js')).default(); } catch (e) { console.error('[seed] failed:', e.message); } }
  app.listen(PORT, () => {
    console.log(`\n🚀  Pulse Track API  →  http://localhost:${PORT}`);
    console.log(`    Master admin    →  http://localhost:${PORT}/admin`);
    console.log(`    Health          →  http://localhost:${PORT}/health\n`);
  });
}
boot().catch(err => { console.error('Startup failed:', err); process.exit(1); });
