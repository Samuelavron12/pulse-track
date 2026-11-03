import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const url = process.env.DATABASE_URL || '';
if (!url) {
  console.error('\n✖ DATABASE_URL is missing.\n  Copy backend/.env.example to backend/.env and fill it in.\n');
  process.exit(1);
}
// Friendly check for the #1 setup mistake: leaving the placeholder from .env.example
try {
  const host = new URL(url).hostname;
  if (['host', 'HOST', 'your-host', 'hostname'].includes(host) || /user:password@/.test(url)) {
    console.error(`\n✖ DATABASE_URL still contains the placeholder from .env.example (host "${host}").\n  Open backend/.env, save it, and set it to your real database, e.g.\n  DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/pulse_track\n`);
    process.exit(1);
  }
} catch {
  console.error('\n✖ DATABASE_URL is not a valid URL. Expected: postgresql://user:password@host:5432/dbname\n  (If your password has symbols like @ # / ?, URL-encode them, e.g. @ → %40)\n');
  process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('REPLACE')) {
  console.error('\n✖ JWT_SECRET is not set. Run: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"  and paste it into backend/.env\n');
  process.exit(1);
}
const useSsl = process.env.DATABASE_SSL ? process.env.DATABASE_SSL === 'true' : process.env.NODE_ENV === 'production' && !/localhost|127\.0\.0\.1/.test(url);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', err => console.error('[db] Unexpected pool error:', err.message));

export async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
