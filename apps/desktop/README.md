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

By default, the desktop window opens `https://www.zyxacademy.com`.

To point the desktop wrapper at a local or staging server, set `ZYX_DESKTOP_SERVER_URL` before launching:

```bash
ZYX_DESKTOP_SERVER_URL=http://localhost:3000 npm run dev
```

```bash
ZYX_DESKTOP_SERVER_URL=https://staging.zyxacademy.com npm run dev
```

Only `http` and `https` origins are accepted. Invalid values fall back to `https://www.zyxacademy.com`.

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
