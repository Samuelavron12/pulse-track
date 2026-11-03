import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { pool } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  await pool.query(readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8'));
  console.log('[db] ✓ Schema applied');
}

if (process.argv[1]?.endsWith('migrate.js')) {
  runMigrations().then(() => pool.end()).catch(e => { console.error(e.message); process.exit(1); });
}
