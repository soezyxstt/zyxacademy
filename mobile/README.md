# Zyx Academy Mobile (React Native)

Hybrid React Native app: a native bottom tab bar (Dashboard, Jadwal, Courses,
Peringkat, Profile; mirroring `components/student-sidebar.tsx`) where each tab
renders the production web app (`https://www.zyxacademy.com`) in a WebView.
The web sidebar and its hamburger button are hidden inside the WebView via
injected CSS; navigation happens natively.

Sign-in is native (Google), ported from the Kotlin WebView wrapper
(`android/app/.../auth/AuthManager.kt`): native Google sign-in produces an ID
token, exchanged at Better Auth `/api/auth/sign-in/social`; the session cookie
lands in the shared Android cookie store, so the WebViews are signed in.

## Build a debug APK

```
bun install
cd android
.\gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`. The debug build
points at production; no local server needed.

## Run with Metro (development)

```
bun install
bunx react-native run-android   # device connected with USB debugging
```

## Known caveats

- **Google sign-in needs the debug keystore's SHA-1 registered.** In Google
  Cloud Console (project that owns `GOOGLE_WEB_CLIENT_ID` in `src/config.ts`),
  create/verify an **Android** OAuth client with package `com.zyx.academy` and
  the SHA-1 of `android/app/debug.keystore` (run
  `keytool -list -v -keystore android/app/debug.keystore -storepass android`).
  Without it, sign-in fails with `DEVELOPER_ERROR`.
- **Same applicationId as the Kotlin WebView app** (`com.zyx.academy`), on
  purpose, so one OAuth registration serves both. They cannot be installed
  side by side; installing over the other fails unless signed with the same
  keystore (uninstall the old one first).
- The old React Native architecture is enabled on purpose; see the comment in
  `android/gradle.properties` before flipping `newArchEnabled`.
- `/admin` and `/tutor` routes and third-party links open in the external
  browser; a `/sign-in` redirect from prod bounces to the native sign-in
  screen (session expiry handling).
