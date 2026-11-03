# Windows setup (PowerShell) — step by step

## 0. Install once
- **Node.js LTS** — https://nodejs.org
- **PostgreSQL** (with pgAdmin) — https://www.postgresql.org/download/windows/ — remember the password you set for the `postgres` user.

## 1. Create the database
Open **pgAdmin** → right-click *Databases* → *Create → Database…* → name it `pulse_track`.
(or in SQL Shell: `CREATE DATABASE pulse_track;`)

## 2. Configure the backend
```powershell
cd pulse-track\backend
copy .env.example .env
notepad .env
```
Edit **two lines**, then **Save (Ctrl+S)** before closing Notepad:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/pulse_track
JWT_SECRET=<paste a long random string>
```
Generate the secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
If your password contains `@ # / ?` encode it (`@` → `%40`, `#` → `%23`).

> If you see **`getaddrinfo ENOTFOUND host`** your `.env` still has the placeholder. Pulse Track now detects this and tells you. Check you edited `backend\.env` (not `.env.example`) and saved it. Check with `type .env`.

## 3. Install and run
```powershell
cd ..                 # back to the project root
npm run install:all   # needs internet; if it fails with ENOTFOUND/ETIMEDOUT try a phone hotspot
npm run seed          # optional demo data
npm run dev:backend   # leave running  → http://localhost:4000/health should say ok
```
New PowerShell window:
```powershell
cd pulse-track
npm run dev:frontend  # → http://localhost:5173
```
Sign in with `demo@pulsetrack.app` / `demo1234`.

## Troubleshooting
| Message | Fix |
|---|---|
| `password authentication failed` | Wrong password in `DATABASE_URL`. |
| `database "pulse_track" does not exist` | Do step 1. |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL service isn't running (Services → postgresql). |
| `npm ERR! network` | Internet/proxy problem: `npm config set registry https://registry.npmjs.org/`, try a hotspot, retry. |
