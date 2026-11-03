-- ═══════════════════════════════════════════════════════════════════════════
-- PULSE TRACK — PostgreSQL Schema (free & open source)
-- Run via: node src/db/migrate.js   (auto-runs on server start too)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── BUSINESSES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  industry     TEXT,
  currency     TEXT NOT NULL DEFAULT 'NGN',
  timezone     TEXT NOT NULL DEFAULT 'Africa/Lagos',
  logo_url     TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  suspended_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── USERS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff',   -- owner | manager | staff | accountant
  language      TEXT NOT NULL DEFAULT 'en',
  theme         TEXT NOT NULL DEFAULT 'system',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── BRANCHES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  manager_id  UUID REFERENCES users(id),
  is_main     BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── USER BRANCH ACCESS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_branches (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);

-- ─── CATEGORIES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── SUPPLIERS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  contact_person TEXT,
  phone          TEXT,
  whatsapp       TEXT,            -- falls back to phone when empty
  email          TEXT,
  address        TEXT,
  products_note  TEXT,            -- what they supply, free text
  payment_terms  TEXT,
  lead_time_days INTEGER,
  notes          TEXT,
  total_owed     NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-orders sent to suppliers (WhatsApp / call) — a simple order log
CREATE TABLE IF NOT EXISTS preorders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES branches(id),
  channel     TEXT NOT NULL DEFAULT 'whatsapp',   -- whatsapp | call | other
  status      TEXT NOT NULL DEFAULT 'sent',       -- sent | confirmed | received | cancelled
  message     TEXT,
  items       JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{product_id,name,quantity,unit}]
  created_by  UUID REFERENCES users(id),
  received_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PRODUCTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id   UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  sku           TEXT,
  barcode       TEXT,
  image_url     TEXT,
  cost_price    NUMERIC(15,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 5,
  reorder_qty   INTEGER,                         -- optional preferred order quantity
  unit          TEXT NOT NULL DEFAULT 'unit',   -- unit | kg | litre | pack | carton …
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_service    BOOLEAN NOT NULL DEFAULT false, -- service items don't track inventory
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INVENTORY ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    NUMERIC(15,3) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, product_id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id    UUID NOT NULL REFERENCES branches(id),
  product_id   UUID NOT NULL REFERENCES products(id),
  type         TEXT NOT NULL, -- sale | purchase | transfer_in | transfer_out | adjustment | opening | return | damage
  quantity     NUMERIC(15,3) NOT NULL,
  before_qty   NUMERIC(15,3),
  after_qty    NUMERIC(15,3),
  unit_cost    NUMERIC(15,2),
  reference_id UUID,
  notes        TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CUSTOMERS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  phone              TEXT,
  email              TEXT,
  address            TEXT,
  customer_type      TEXT NOT NULL DEFAULT 'retail',  -- retail | wholesale | vip
  notes              TEXT,
  total_spent        NUMERIC(15,2) NOT NULL DEFAULT 0,
  outstanding_credit NUMERIC(15,2) NOT NULL DEFAULT 0,
  purchase_count     INTEGER NOT NULL DEFAULT 0,
  last_purchase_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── SALES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id        UUID REFERENCES branches(id),
  customer_id      UUID REFERENCES customers(id),
  user_id          UUID REFERENCES users(id),
  sale_number      TEXT,
  subtotal         NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  cost_total       NUMERIC(15,2) NOT NULL DEFAULT 0,
  profit           NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_method   TEXT NOT NULL DEFAULT 'cash',
  payment_status   TEXT NOT NULL DEFAULT 'paid',     -- paid | partial | credit | pending
  amount_paid      NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_tendered  NUMERIC(15,2),
  change_given     NUMERIC(15,2),
  status           TEXT NOT NULL DEFAULT 'completed', -- completed | refunded | cancelled | void
  notes            TEXT,
  receipt_number   TEXT,
  import_batch_id  UUID,
  external_ref     TEXT UNIQUE,
  offline_id       TEXT UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id      UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku          TEXT,
  quantity     NUMERIC(15,3) NOT NULL,
  unit_price   NUMERIC(15,2) NOT NULL,
  unit_cost    NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  subtotal     NUMERIC(15,2) NOT NULL
);

-- ─── EXPENSES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id      UUID REFERENCES branches(id),
  category       TEXT NOT NULL,
  description    TEXT,
  amount         NUMERIC(15,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  receipt_url    TEXT,
  incurred_at    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by     UUID REFERENCES users(id),
  import_batch_id UUID,
  offline_id     TEXT UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INVOICES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id    UUID REFERENCES customers(id),
  branch_id      UUID REFERENCES branches(id),
  sale_id        UUID REFERENCES sales(id),
  invoice_number TEXT NOT NULL,
  subtotal       NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_due     NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_paid    NUMERIC(15,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'unpaid',  -- unpaid | partial | paid | overdue | cancelled
  due_date       DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES products(id),
  description  TEXT NOT NULL,
  quantity     NUMERIC(15,3) NOT NULL,
  unit_price   NUMERIC(15,2) NOT NULL,
  subtotal     NUMERIC(15,2) NOT NULL
);

-- ─── OFFLINE SYNC QUEUE ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offline_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES branches(id),
  user_id     UUID REFERENCES users(id),
  device_id   TEXT NOT NULL,
  type        TEXT NOT NULL,    -- sale | expense | adjustment
  payload     JSONB NOT NULL,
  offline_id  TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | processing | synced | failed | conflict
  error_msg   TEXT,
  synced_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CSV / IMPORT ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id),
  module        TEXT NOT NULL,
  filename      TEXT NOT NULL,
  total_rows    INTEGER NOT NULL DEFAULT 0,
  valid_rows    INTEGER NOT NULL DEFAULT 0,
  error_rows    INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',
  error_summary JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- ─── ALERTS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES branches(id),
  type        TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info',
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  related_id  UUID,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUDIT LOG ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES branches(id),
  user_id     UUID REFERENCES users(id),
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata    JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PLATFORM ADMINS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  priority    TEXT NOT NULL DEFAULT 'normal',
  assigned_to UUID REFERENCES admins(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── OPERATIONS (admin: traffic, errors, password requests) ─────────────
CREATE TABLE IF NOT EXISTS traffic_hourly (
  hour        TIMESTAMPTZ NOT NULL,
  area        TEXT NOT NULL,            -- 'api' | 'admin' | 'web'
  requests    INT NOT NULL DEFAULT 0,
  errors      INT NOT NULL DEFAULT 0,
  total_ms    BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, area)
);

CREATE TABLE IF NOT EXISTS traffic_paths (
  day         DATE NOT NULL,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  requests    INT NOT NULL DEFAULT 0,
  errors      INT NOT NULL DEFAULT 0,
  total_ms    BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, method, path)
);

CREATE TABLE IF NOT EXISTS server_errors (
  id          BIGSERIAL PRIMARY KEY,
  method      TEXT, path TEXT, message TEXT, stack TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Emails are case-insensitive. Normalise old rows (skips any that would collide).
UPDATE users u SET email = lower(trim(email))
 WHERE email <> lower(trim(email))
   AND NOT EXISTS (SELECT 1 FROM users o WHERE o.id <> u.id AND lower(trim(o.email)) = lower(trim(u.email)));
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));

-- ─── INDEXES ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_business    ON users(business_id);
CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_branches_business ON branches(business_id);
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_sku      ON products(business_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_barcode  ON products(business_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_branch  ON inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_customers_biz     ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone   ON customers(business_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_biz         ON sales(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_created     ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_branch      ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale   ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_expenses_biz      ON expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(business_id, incurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_biz      ON invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_alerts_biz        ON alerts(business_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_movements_biz ON inventory_movements(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_biz         ON audit_log(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offline_queue_biz ON offline_queue(business_id, status);
CREATE INDEX IF NOT EXISTS idx_suppliers_biz     ON suppliers(business_id);
CREATE INDEX IF NOT EXISTS idx_preorders_biz     ON preorders(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
