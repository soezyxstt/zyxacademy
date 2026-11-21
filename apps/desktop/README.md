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

## Deep links

The app registers the `zyxacademy` URL scheme. Opening a URL such as `zyxacademy://courses/123` routes the main window to `/courses/123` on the configured origin.

## Commands

Run from `apps/desktop`:

```bash
npm install
npm run dev
npm run build
npm run info
```

## Capabilities

`src-tauri/capabilities/default.json` grants `core:default`, `notification:default`, `opener:default`, and `deep-link:default` to the `main` window and allows remote access from:

- `https://www.zyxacademy.com/*`
- `https://staging.zyxacademy.com/*`
- `http://localhost:3000/*`

`app.withGlobalTauri` is enabled in `src-tauri/tauri.conf.json` so `window.__TAURI__` is exposed to the remote Next.js application.
