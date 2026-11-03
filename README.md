# Pulse Track

**Free, open-source stock, sales and supplier manager for small businesses — as a website and an Android app.**
No subscription. No payments. No AI. Your data lives in your own PostgreSQL database.

## What it does

| Area | Features |
|---|---|
| **Shortage detection** | Automatic, rule-based: any product at/below its reorder level (or at zero) is flagged. Grouped by supplier with a suggested order quantity (from reorder level and your last 30 days of sales), estimated cost, and in-app alerts. |
| **Suppliers** | Contact book with phone, WhatsApp, address, what they supply, payment terms, delivery time. One tap **Call** or **WhatsApp**. |
| **Pre-orders** | From a shortage or a supplier, build an order → edit the message → send via **WhatsApp** (`wa.me`) or call. Orders are logged; mark **Received** to add the stock automatically. |
| **POS** | Quick-tap, search, hardware-scanner and **camera barcode scanning** (continuous). Cash/transfer/POS/USSD/OPay/Moniepoint/credit. |
| **Offline** | Sales and expenses made without internet are stored on the phone and synced later (duplicate-safe). Products, customers and suppliers are cached for offline reading. |
| **Business** | Inventory (multi-branch), customers & credit, expenses, invoices, P&L, reports, rule-based business analysis, alerts, team roles, audit log. |
| **CSV** | Import with preview/validation, and export — products, customers, suppliers, expenses, sales. |
| **Languages / themes** | English, Pidgin, Yorùbá, Hausa, Igbo, Français · Light / Dark / System. |

## Repository layout

```
backend/   Node + Express + PostgreSQL API
frontend/  React + Vite app (web/PWA) — also packaged as an Android app with Capacitor
backend/public/admin/   Master admin web page (served by the backend at /admin — no build step)
```

## Master admin (web page)

Open **`https://YOUR-SERVER/admin`** and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the server settings
(if you set neither, a random password is printed **once** in the server log on first start).
From there you can: watch **traffic** (requests per hour, busiest endpoints, response time, errors), check **server health**,
browse every **database table** (read-only, password columns hidden), **reset any user's password**, handle
"forgot password" requests and support tickets, suspend businesses, and add/remove admins. Sign out is in the top bar.

## Quick start (development)

1. Install Node 18+ and PostgreSQL. Create a database: `CREATE DATABASE pulse_track;`
2. `cp backend/.env.example backend/.env` — set `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`; add `SEED_DEMO=true` for demo data.
3. `npm run install:all`
4. Two terminals: `npm run dev:backend` and `npm run dev:frontend` (http://localhost:5173). Admin page: http://localhost:4000/admin

Demo login (only if `SEED_DEMO=true` or `npm run seed`): `demo@pulsetrack.app` / `demo1234`.

Windows? **WINDOWS_SETUP.md** · Putting it online? **DEPLOYMENT.md** · Android app (built by GitHub Actions)? **MOBILE.md**.

## Principles

- Free forever for the core product; payments, if ever added, will be optional extras.
- Your data is yours: export any module to CSV at any time.
- No tracking, no ads.

## Contributing

Pull requests welcome — translations especially (`frontend/src/context/extra-i18n.js`). Licensed under the MIT licence (see `LICENSE`).
