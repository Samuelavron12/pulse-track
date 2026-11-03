# Putting Pulse Track online

**What GitHub Actions can and can't do.** GitHub Actions is the *build machine*: it builds the Android APK
(and can publish the web app to GitHub Pages). It cannot *run* the server or the database — those must
stay switched on 24/7, so they live on a small host. Both have free tiers:

| Piece | Where | Cost |
|---|---|---|
| APK build + download page (Releases) | **GitHub Actions** | free |
| Server (API + web app + `/admin` page) | **Render** (or Railway / any Node host) | free tier |
| Database | **Neon** or **Supabase** (PostgreSQL) | free tier |

## 1. Database
Create a free project at neon.tech and copy the connection string (`postgresql://…`). Tables are created automatically.

## 2. Server (one service does everything)
1. Push this repo to GitHub.
2. Render → **New → Blueprint** → choose the repo (it reads `render.yaml`).
3. Fill in: `DATABASE_URL` (from Neon), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (your master-admin login). `JWT_SECRET` is generated for you.
4. When it is live you have:
   - the app: `https://YOUR-APP.onrender.com`
   - the master admin page: `https://YOUR-APP.onrender.com/admin`
   - health check: `https://YOUR-APP.onrender.com/health`

Free Render servers sleep when idle; the first request after a break can take ~30 s. The app waits and retries
automatically instead of showing an error. (A free uptime pinger hitting `/health` every 10 min keeps it awake.)

Manual setup instead: build command `npm --prefix frontend install && npm --prefix frontend run build && npm --prefix backend install`, start command `npm --prefix backend start`, env vars from `backend/.env.example`.

## 3. Android app + downloads (GitHub)
Follow **MOBILE.md**. In short: add the repo variable `API_URL = https://YOUR-APP.onrender.com/api`, run the *Build Android APK* workflow, and tag a release (`v4.0.0`) so users get a download link.
Optional: Settings → Pages → Source "GitHub Actions" publishes a second copy of the web app on `github.io`.

## Before real customers
- Choose a strong `ADMIN_PASSWORD`; never seed demo data (`SEED_DEMO`) in production.
- Back up the database (Neon/Supabase backups, or `pg_dump`). Keep `JWT_SECRET` private.
- Users who forget their password tap **Forgot password?** on the login page; you reset it in `/admin → Requests`.
