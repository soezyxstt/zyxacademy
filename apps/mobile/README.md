# Zyx Academy Mobile (Alpha)

Capacitor 7 mobile wrapper for Zyx Academy (`com.zyx.academy`). This app loads the Zyx Academy web application inside a native WebView shell and bridges native capabilities such as push notifications, local notifications, camera, haptics, share, network status, status bar, and splash screen.

## Prerequisites

- Node.js 22+ and npm
- Android Studio with Android SDK and JDK 17+ (for Android builds)
- macOS with Xcode 16+ and CocoaPods (for iOS builds)

## Setup

Install dependencies inside `apps/mobile`:

```bash
npm install
```

Sync web assets and native Capacitor plugins:

```bash
npm run sync
```

Platform-specific sync commands:

```bash
npm run sync:android
npm run sync:ios
```

Run the Capacitor environment check:

```bash
npm run doctor
```

## Server URL Override (Local and Staging)

By default, `capacitor.config.ts` points to `https://www.zyxacademy.com`. Set `ZYX_MOBILE_SERVER_URL` before running `cap sync` to target a local dev server or staging deployment:

```bash
# Staging
ZYX_MOBILE_SERVER_URL="https://staging.zyxacademy.com" npm run sync

# Local Android emulator (maps to host localhost:3000)
ZYX_MOBILE_SERVER_URL="http://10.0.2.2:3000" npm run sync:android

# Local iOS simulator
ZYX_MOBILE_SERVER_URL="http://localhost:3000" npm run sync:ios
```

Cleartext HTTP is automatically enabled only when `ZYX_MOBILE_SERVER_URL` starts with `http://`.

## Required Firebase Configuration Files

Push notifications via `@capacitor/push-notifications` require Firebase configuration files that are intentionally gitignored. Obtain these from the Zyx Academy Firebase project and place them locally (or inject them in CI):

- **Android**: place `google-services.json` at `apps/mobile/android/app/google-services.json`
- **iOS**: place `GoogleService-Info.plist` at `apps/mobile/ios/App/App/GoogleService-Info.plist` (and ensure it is included in the `App` Xcode target)

Nightly and Stable share Firebase project `zyx-academy-staging` with separate Android apps. Nightly uses package `com.zyx.academy.nightly` and repository secret `FIREBASE_NIGHTLY_GOOGLE_SERVICES_JSON`; Stable uses package `com.zyx.academy` and `FIREBASE_STABLE_GOOGLE_SERVICES_JSON`. The release workflow validates the package against the selected channel and writes the config under `apps/mobile/android/app/src/<channel>/google-services.json`. Separate Firebase apps within this project share its sender and messaging permissions. Never put a Firebase sender service-account key in the mobile config or APK.

## Opening and Building Native Projects

### Android

Open in Android Studio:

```bash
npm run open:android
```

Or build from the command line inside `apps/mobile/android`:

```bash
./gradlew assembleDebug
./gradlew bundleRelease
```

### iOS (macOS only)

Install CocoaPods dependencies if not already installed during `cap sync`, then open in Xcode:

```bash
cd ios/App && pod install
npm run open:ios
```

## Nightly updates

Android Nightly can download a patch against the installed APK and apply the reconstructed package through Android. iOS uses TestFlight. See the [Nightly release procedure](../../docs/DEPLOYMENT.md#nightly-native-app-releases).

## Google account switching

The sidebar avatar and gear menu can keep up to five Zyx accounts signed in. A saved Zyx session can become active without another Google login. Adding an account on Android uses the `ZyxGoogleAuth` Credential Manager plugin when available; older APKs and iOS keep system-browser sign-in. Cancelling account selection leaves the current session active.

The plugin uses the server environment's existing **Web application** `GOOGLE_CLIENT_ID`. Configure Android OAuth clients in the same Google Cloud project for `com.zyx.academy` and `com.zyx.academy.nightly`, with the SHA-1 of the certificate that signs each installed build. Include debug/local certificates for testing and Play App Signing when applicable. This adds no mobile secret. See the [deployment requirements and device checks](../../docs/DEPLOYMENT.md#google-account-switching-in-native-apps).

Deploying the web app enables saved-session switching. Installing a new APK enables the native chooser. Google account selection and signed-device acceptance still require the checks in that guide; web UI screenshots cover a different boundary.

## Back navigation

The web app gives each open dialog, sheet, modal popover and mobile sidebar a temporary history entry. Android Back uses WebView history and dismisses the top overlay before leaving the current page. Backdrop dismissal returns to the same underlying URL.

## Offline Fallback

When the remote Zyx Academy URL cannot be reached, Capacitor loads `www/index.html` (`server.errorPath`). It provides an Indonesian and English retry screen and a direct link to `/offline` for saved readings.

## Android App Links

`/.well-known/assetlinks.json` is built from `ANDROID_APP_LINKS_SHA256_FINGERPRINTS` (stable, `com.zyx.academy`) and `ANDROID_APP_LINKS_NIGHTLY_SHA256_FINGERPRINTS` (nightly, `com.zyx.academy.nightly`). Values are comma-separated SHA-256 signing-certificate fingerprints.

- Staging: store the nightly value in GitHub Environment `staging`. `sync_vercel_staging.py` copies it to the Vercel staging environment during `deploy-web.yml`.
- Production: store the stable value in GitHub Environment `production`. `deploy-web.yml` passes it to the production deployment when it is set.

Android verifies links at install time. After the endpoint returns the fingerprint, reinstall the app and check `adb shell pm get-app-links <package>`. Links typed into the browser address bar always stay in the browser. iOS Universal Links stay inactive until an Apple team ID is configured.
