Add these lines inside <manifest> in android/app/src/main/AndroidManifest.xml
(MOBILE.md → step 5 shows exactly where). `scripts/patch-android.mjs` does it for you.

<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
