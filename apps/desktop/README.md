# Zyx Academy Desktop (Alpha)

Tauri v2 desktop wrapper for Zyx Academy.

## Prerequisites

- Rust toolchain (`rustup`, `cargo`, `rustc`)
- Node.js 22+ or Bun for running Tauri CLI scripts
- Platform WebView dependencies:
  - Windows: Microsoft Edge WebView2 Runtime and Visual Studio C++ Build Tools
  - macOS: Xcode Command Line Tools
  - Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `build-essential`, `libssl-dev`

## Environment override

By default, the desktop app uses `https://www.zyxacademy.com` for online features.

To point the desktop wrapper at a local or staging server, set `ZYX_DESKTOP_SERVER_URL` before launching:

```bash
ZYX_DESKTOP_SERVER_URL=http://localhost:3000 npm run dev
```

```bash
ZYX_DESKTOP_SERVER_URL=https://staging.zyxacademy.com npm run dev
```

Only `http` and `https` origins are accepted. Invalid values fall back to `https://www.zyxacademy.com`.

## Startup and offline fallback

The bundled shell probes the configured origin independently of the saved cache.
The recovery library opens to saved readings with the course catalog, video
metadata, achievement definitions and storage controls under library management.
Its native transport only accepts the fixed offline API routes on the configured
server and keeps WebView session cookies out of JavaScript.

The store scopes packages to the account, server and language. A reading must have
an active lease and a current course/chapter grant. Expired data stays hidden until
a server check succeeds. Atomic package replacement preserves complete images and
reading position, and a new version waits for the reader's confirmation before it
replaces the open text. Logout or revoked access closes the reader and clears data.

Startup probes `HEAD /favicon.ico` without credentials or cached responses and
uses the existing native entry route to restore the last authorized page, open the
role dashboard, or show sign-in. The probe times out after
3.5 seconds. The bundled retry view opens when the probe fails. Reconnection
keeps an open reader in place.

This shell ships inside the desktop installer. Merging a web change does not
replace it in an installed app. Run **Release Apps (Desktop & Mobile)** manually
from `staging` with the `nightly` channel and install that build to use the fix.

## Deep links and single instance

The app registers the `zyxacademy` URL scheme (`zyxacademy-nightly` for nightly builds). Opening a URL such as `zyxacademy://courses/123` or an OAuth callback routes the main window to that path on the configured origin.

`tauri-plugin-single-instance` ensures that deep-link callbacks on Windows and Linux forward to the already-running primary instance and unminimize/focus its window instead of opening a second instance with an empty auth state.

## Window layout

The desktop window allows resizing down to `480x540` so Zyx can sit side by side with a PDF reader or notes app on laptop screens. Window size, position, and maximized state are persisted in the app config directory (`window-state.json`) and validated against currently connected monitors on startup.

## Signed in-app updates (Tauri Updater)

The app integrates `tauri-plugin-updater` for signature-verified in-app updates with automatic restart. When updater signing keys are not configured, it gracefully falls back to downloading and launching the GitHub Release installer.

To enable signed in-app updater artifacts in CI:

1. Generate a signing key pair once:
   ```bash
   npx tauri signer generate -w ~/.tauri/zyx-academy.key
   ```
2. Configure these GitHub Actions repository secrets:
   - `TAURI_SIGNING_PRIVATE_KEY`: contents of the generated private key file.
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: password protecting the private key (if set).
   - `TAURI_UPDATER_PUBKEY`: contents of the generated `.pub` public key.
3. Optionally override `TAURI_UPDATER_ENDPOINT` if serving updater manifests from a custom URL instead of GitHub Releases (`latest.json` / `latest-nightly.json`).

Staging Nightly builds can reuse an installed AppImage or a cached installer when a smaller patch is available. See the [Nightly release procedure](../../docs/DEPLOYMENT.md#nightly-native-app-releases) for packaging and verification.

## Commands

Run from `apps/desktop`:

First run `bun run build:native-offline` from the repository root after installing
the root dependencies. This produces the local scripts, styles and fonts without
server secrets. Release Apps builds and passes these assets to each packaging job.

```bash
npm install
npm run dev
npm run build
npm run info
```

## Capabilities

`src-tauri/capabilities/default.json` grants `allow-native-bridge`, `core:default`, `notification:default`, `opener:default`, and `deep-link:default` to the `main` window and allows remote access from:

- `https://www.zyxacademy.com/*`
- `https://staging.zyxacademy.com/*`

`app.withGlobalTauri` is enabled in `src-tauri/tauri.conf.json` so `window.__TAURI__` is exposed to the remote Next.js application.

`src-tauri/permissions/native-bridge.json` explicitly allows the existing custom update, origin and offline-reading commands. Tauri 2.12.7 checks remote custom commands against ACL permissions even when no application command manifest was configured. A trusted remote URL alone does not grant these commands. Keep the permission list aligned with `generate_handler!`; adding an application permission manifest also makes local command access explicit.

Older binaries without this permission need one manual installer update. The web client falls back to the core app-version command when the custom metadata command is denied, and offers the download page when installation is ACL-blocked. An unavailable version is shown as unknown rather than `alpha.1`. This fix requires a new desktop build; web-only changes cannot replace permissions embedded in an installed binary. Verify the actual previous-to-new Windows upgrade after publishing.

## Desktop notification troubleshooting

The installed desktop app uses the authenticated inbox while running. The app
polls every 15 seconds and on focus, visibility resume and reconnect. Temporary
session errors and timed-out requests are retried. Closing the app still stops
delivery; the desktop application does not run a background service.

Windows native notifications use the installed bundle identifier, including
the separate Nightly identifier. The native command awaits the Windows API
instead of discarding failures in a detached task. The Tauri permission probe
does not prove Windows will display a banner, because Windows can suppress
notifications independently (system settings and Do not disturb). The settings
page can send a local test without creating an inbox entry or contacting FCM.
An older installed wrapper falls back to its existing notification plugin.

Before publishing a new Nightly, run `cargo test --locked --lib` in
`apps/desktop/src-tauri`, install the Windows package, enable system
notifications for Zyx Academy Nightly, use the test button, and verify a real
inbox alert while the app is active and minimized. Confirm that an Android
read does not suppress the desktop alert. Do not claim system delivery based
only on the native handoff or server counters.
