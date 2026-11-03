// Run after `npx cap add android`:  node scripts/patch-android.mjs
// Adds camera permission (barcode scanning) and a WhatsApp/phone "queries" block so Android 11+
// can open WhatsApp and the dialer from the app.
import { readFileSync, writeFileSync, existsSync } from 'fs';
const f = 'android/app/src/main/AndroidManifest.xml';
if (!existsSync(f)) { console.error('Run `npx cap add android` first.'); process.exit(1); }
let x = readFileSync(f, 'utf8');
const perms = [
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />',
];
const queries = `    <queries>
        <package android:name="com.whatsapp" />
        <package android:name="com.whatsapp.w4b" />
        <intent><action android:name="android.intent.action.DIAL" /></intent>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent>
    </queries>
`;
let added = 0;
for (const p of perms) { const key = p.match(/android:name="([^"]+)"/)[1]; if (!x.includes(key)) { x = x.replace('</manifest>', `    ${p}\n</manifest>`); added++; } }
if (!x.includes('<queries>')) { x = x.replace('</manifest>', `${queries}</manifest>`); added++; }
writeFileSync(f, x);
console.log(added ? `Patched AndroidManifest.xml (${added} change(s)).` : 'Already patched.');
