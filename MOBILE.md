# Building the Pulse Track Android app

The app is built **only by GitHub Actions** — no Android Studio, no Java, nothing to install on your PC.

## One-time setup

1. Create a GitHub repository and upload the **contents** of the `pulse-track` folder (so `frontend/`, `backend/`, `.github/` sit at the top level). From PowerShell:
   ```powershell
   cd pulse-track
   git init
   git add .
   git commit -m "Pulse Track"
   git branch -M main
   git remote add origin https://github.com/YOUR-USER/pulse-track.git
   git push -u origin main
   ```
2. Deploy the server first (**DEPLOYMENT.md**) so you have its address.
3. Tell the build where the server is: repo → **Settings → Secrets and variables → Actions → Variables → New repository variable**
   Name `API_URL`, value `https://YOUR-APP.onrender.com/api` (must be **https**).
   The address is baked into the app — users cannot change it, so they cannot break the connection.

## Build and download

- **Actions → Build Android APK → Run workflow** (it also runs on every push to `main`).
- After ~6–10 minutes open the run → **Artifacts → `pulse-track-apk`** → `pulse-track.apk`. Send it to a phone and install (allow "install unknown apps").
- **Public download link:** `git tag v4.0.0 && git push origin v4.0.0` — the APK is attached to a GitHub **Release** page you can share with everyone.

## Optional: signed release APK (for wide sharing / Play Store)
Create a keystore once: `keytool -genkeypair -v -keystore release.keystore -alias pulsetrack -keyalg RSA -keysize 2048 -validity 10000`
Keep it safe — every future update needs the same one. PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore")) | Set-Clipboard`
Add repository **secrets**: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` (`pulsetrack`), `KEY_PASSWORD`. The next build also produces `pulse-track-signed.apk`.

## If the build fails
- *"API_URL is not set"* → add the variable in step 3.
- *npm install error* → re-run the job.
- Anything else: open the failed step, copy the red lines.
