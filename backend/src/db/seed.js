import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './index.js';
import { runMigrations } from './migrate.js';

const DEMO_EMAIL = 'demo@pulsetrack.app';

export default async function seed() {
  await runMigrations();


  if ((await pool.query('SELECT 1 FROM users WHERE email=$1', [DEMO_EMAIL])).rows[0]) {
    console.log('[seed] Demo data already exists — nothing to do.');
    return;
  }

  await withTransaction(async c => {
    const { rows: [biz] } = await c.query(`INSERT INTO businesses (name,industry) VALUES ('Adaeze Fashion & Fabrics','Retail - Fashion') RETURNING id`);
    const bizId = biz.id;
    const { rows: [owner] } = await c.query(`INSERT INTO users (business_id,name,email,password_hash,role) VALUES ($1,'Adaeze Okafor',$2,$3,'owner') RETURNING id`, [bizId, DEMO_EMAIL, await bcrypt.hash('demo1234', 10)]);
    const userId = owner.id;
    const { rows: [br] } = await c.query(`INSERT INTO branches (business_id,name,address,is_main) VALUES ($1,'Main Store — Benin City','Ring Road, Benin City, Edo State',true) RETURNING id`, [bizId]);
    const branchId = br.id;

    const cats = Object.fromEntries((await c.query(`INSERT INTO categories (business_id,name) VALUES ($1,'Fabric'),($1,'Ready-to-wear'),($1,'Accessories') RETURNING id,name`, [bizId])).rows.map(r => [r.name, r.id]));

    // Demo supplier numbers are fictional placeholders — replace with real ones.
    const SUPS = [
      { key: 'aba',   name: 'Aba Textile Hub',     person: 'Mr. Chidi Nwosu',  phone: '08031110001', whatsapp: '08031110001', address: 'Ariaria Market, Aba',       note: 'Ankara & lace fabrics', terms: 'Pay 50% upfront', lead: 4 },
      { key: 'lagos', name: 'Lagos Fashion Supply', person: 'Mrs. Funke Adeyemi', phone: '08052220002', whatsapp: '',            address: 'Balogun Market, Lagos',     note: 'Gowns, senator wear',   terms: 'Pay on delivery', lead: 2 },
      { key: 'acc',   name: 'Kano Accessories Co.', person: 'Alhaji Musa',       phone: '08073330003', whatsapp: '08073330003', address: 'Sabon Gari, Kano',          note: 'Head ties, caps, bags', terms: '7 days credit',   lead: 6 },
    ];
    const sup = {};
    for (const s of SUPS) sup[s.key] = (await c.query(`INSERT INTO suppliers (business_id,name,contact_person,phone,whatsapp,address,products_note,payment_terms,lead_time_days) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [bizId, s.name, s.person, s.phone, s.whatsapp || null, s.address, s.note, s.terms, s.lead])).rows[0].id;

    // qty = stock AFTER the 14-day demo sales below. Several are deliberately low / out so the Shortages page has content.
    const PRODS = [
      { name: 'Ankara Fabric (6 yds)', sku: 'FAB001', cat: 'Fabric',        sup: 'aba',   cost: 8000,  price: 12500, qty: 42, ro: 10, unit: 'bundle' },
      { name: 'Lace Fabric (5 yds)',   sku: 'FAB002', cat: 'Fabric',        sup: 'aba',   cost: 15000, price: 22000, qty: 3,  ro: 8,  unit: 'bundle' },
      { name: "Men's Senator Wear",    sku: 'RTW001', cat: 'Ready-to-wear', sup: 'lagos', cost: 9000,  price: 15000, qty: 18, ro: 5,  unit: 'piece' },
      { name: 'Ladies Gown - Small',   sku: 'RTW002', cat: 'Ready-to-wear', sup: 'lagos', cost: 7000,  price: 13000, qty: 0,  ro: 5,  unit: 'piece' },
      { name: 'Ladies Gown - Medium',  sku: 'RTW003', cat: 'Ready-to-wear', sup: 'lagos', cost: 7000,  price: 13000, qty: 4,  ro: 5,  unit: 'piece' },
      { name: 'Head Tie / Gele',       sku: 'ACC001', cat: 'Accessories',   sup: 'acc',   cost: 2500,  price: 4500,  qty: 25, ro: 10, unit: 'piece' },
      { name: 'Kids Ankara Set',       sku: 'RTW004', cat: 'Ready-to-wear', sup: null,    cost: 4000,  price: 7500,  qty: 2,  ro: 6,  unit: 'set' },
    ];
    const prods = [];
    for (const p of PRODS) {
      const pid = (await c.query(`INSERT INTO products (business_id,category_id,supplier_id,name,sku,cost_price,selling_price,reorder_level,unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [bizId, cats[p.cat], p.sup ? sup[p.sup] : null, p.name, p.sku, p.cost, p.price, p.ro, p.unit])).rows[0].id;
      await c.query('INSERT INTO inventory (business_id,branch_id,product_id,quantity) VALUES ($1,$2,$3,$4)', [bizId, branchId, pid, p.qty]);
      prods.push({ id: pid, ...p });
      if (p.qty <= p.ro) await c.query(`INSERT INTO alerts (business_id,type,severity,title,message,related_id) VALUES ($1,$2,$3,$4,$5,$6)`,
        [bizId, p.qty <= 0 ? 'out_of_stock' : 'low_stock', p.qty <= 0 ? 'critical' : 'warning', p.qty <= 0 ? `Out of stock: ${p.name}` : `Low stock: ${p.name}`, p.qty <= 0 ? `${p.name} has run out. Re-order from your supplier.` : `Only ${p.qty} left (reorder level ${p.ro}).`, pid]);
    }

    const CUSTS = [
      ['Ifeoma Chukwu', '08031234567', 3, 145000], ['Emeka Obi', '08052345678', 68, 62000], ['Blessing Eze', '08163456789', 1, 210000],
      ['Tunde Bakare', '08074567890', 75, 38000], ['Grace Udo', '08095678901', 12, 95000],
    ];
    const custIds = [];
    for (const [name, phone, daysAgo, spent] of CUSTS)
      custIds.push((await c.query(`INSERT INTO customers (business_id,name,phone,total_spent,last_purchase_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [bizId, name, phone, spent, new Date(Date.now() - daysAgo * 864e5).toISOString()])).rows[0].id);

    const METHODS = ['cash', 'transfer', 'pos', 'cash', 'transfer'];
    for (let day = 13; day >= 0; day--) {
      for (let s = 0, n = 1 + Math.floor(Math.random() * 4); s < n; s++) {
        const lines = []; let subtotal = 0, cost = 0;
        for (let i = 0, k = 1 + Math.floor(Math.random() * 3); i < k; i++) {
          const p = prods[Math.floor(Math.random() * prods.length)], qty = 1 + Math.floor(Math.random() * 2);
          subtotal += p.price * qty; cost += p.cost * qty; lines.push({ p, qty });
        }
        const createdAt = new Date(Date.now() - day * 864e5 - Math.random() * 18e6).toISOString();
        const sid = (await c.query(`INSERT INTO sales (business_id,branch_id,customer_id,user_id,subtotal,total_amount,cost_total,profit,payment_method,amount_paid,status,created_at) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$5,'completed',$9) RETURNING id`,
          [bizId, branchId, custIds[Math.floor(Math.random() * custIds.length)], userId, subtotal, cost, subtotal - cost, METHODS[Math.floor(Math.random() * METHODS.length)], createdAt])).rows[0].id;
        for (const { p, qty } of lines)
          await c.query(`INSERT INTO sale_items (sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,subtotal) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [sid, p.id, p.name, p.sku, qty, p.price, p.cost, p.price * qty]);
      }
    }

    for (const [cat, desc, amt, dA] of [['Rent', 'Monthly shop rent', 80000, 20], ['Transport', 'Fabric pickup from Aba', 15000, 5], ['Utilities', 'Generator fuel', 12000, 4], ['Staff', 'Tailor wages', 45000, 7], ['Marketing', 'Instagram promo', 8000, 2]])
      await c.query(`INSERT INTO expenses (business_id,branch_id,category,description,amount,incurred_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [bizId, branchId, cat, desc, amt, new Date(Date.now() - dA * 864e5).toISOString().slice(0, 10), userId]);
    await c.query(`INSERT INTO invoices (business_id,customer_id,invoice_number,amount_due,amount_paid,status,due_date) VALUES ($1,$2,'INV-1001',62000,20000,'overdue',$3)`, [bizId, custIds[1], new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10)]);
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Pulse Track — demo data ready');
  console.log(`  Business login:  ${DEMO_EMAIL} / demo1234`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

if (process.argv[1]?.endsWith('seed.js')) {
  seed().then(() => pool.end()).catch(e => { console.error(e.message); process.exit(1); });
}
