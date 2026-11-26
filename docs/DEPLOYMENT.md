# Deployment Guide

This guide defines the current production and staging deployment topology for Zyx Academy across web, background workers, edge services, and native mobile and desktop applications.

## System Topology

```text
Clients (Web Browser / Capacitor Mobile / Tauri Desktop)
 ├── Web Tier
 │    ├── Production: Vercel (Next.js 16.3, region sin1)
 │    └── Staging: Vercel custom staging OR Cloud Run Bangkok (via Cloudflare Edge Worker)
 ├── Data & Storage
 │    ├── Neon PostgreSQL (separate staging & production branches)
 │    └── Neon Object Storage (private buckets, STORAGE_PROVIDER_MODE=neon)
 ├── Background Execution
 │    ├── Queue Provider: Inngest Cloud (default) or Google Cloud Tasks + Scheduler
 │    └── Compute Worker: Neon Functions (workers/neon-background, function zyxcompute)
 └── Cloudflare Edge & AI Services
      ├── Cloudflare AI Gateway (dynamic multi-provider routing & BYOK)
      ├── Cloudflare Vectorize (768d canonical & admin_ops_knowledge indexes)
      ├── Cloudflare Workers KV (AI catalog cache & shared tutor cache)
      └── Cloudflare Workers (vector-api, zyra-control-plane, realtime, diktat-renderer, python-runtime, staging-web-edge)
```

## Release Triggers and Environment Policy

| Target | Branch | Trigger | Workflow | Notes |
| --- | --- | --- | --- | --- |
| CI Validation | PR, `staging`, `main` | Automatic | `.github/workflows/ci.yml` | Runs `scripts/ci/plan.py` dependency-scoped lint, typecheck, and tests |
| Production Web | `main` | Gated CI or manual dispatch | `.github/workflows/deploy-web.yml` | Region `sin1` in `vercel.json`; respects `HOLD_WEB_DEPLOYMENT` |
| Staging Web (Vercel) | `staging` | Manual dispatch only | `.github/workflows/deploy-web.yml` | Targets custom environment `staging` (`--target=staging`), no branch tracking |
| Staging Web (Cloud Run) | `staging` | Manual dispatch only | `.github/workflows/deploy-cloud-run-staging.yml` | Dedicated `staging-cloud-run` environment; supports `candidate`, `promote`, `rollback`, `import-secrets` |
| Background Worker | `staging` / `main` | Manual (`staging`) / Gated (`main`) | `.github/workflows/deploy-neon-worker.yml` | Deploys `workers/neon-background` to Neon Functions and verifies function count and checksum |
| Mobile & Desktop Apps | `staging` / `main` | Manual dispatch only | `.github/workflows/release-apps.yml` | Channels `nightly` (staging) and `stable` (production) |
| Authoring Plugin Mirror | `main` | Manual dispatch only | `.github/workflows/sync-plugin.yml` | Mirrors packaged MCP skills to `soezyxstt/zyx-authoring-mcp` |

Web and worker releases never run database migrations or catalog seeds automatically. Apply guarded PostgreSQL migrations (`bun run db:migrate`) before deploying application code that relies on new schema objects.

## Web Tier Deployments

### Production Vercel (`main`)

- Hosted on Vercel project `zyxacademy` (`vercel.json` pins serverless functions to `sin1` to stay close to Neon `ap-southeast-1`).
- Connected to protected Neon production root `br-wandering-butterfly-azi11h8r` (`neondb`) and private bucket `zyx-production` with `STORAGE_PROVIDER_MODE=neon`.
- Keep `.vercelignore` intact so local environment files and temporary artifacts are excluded from CLI deploys.
- `deploy-web.yml` forwards `ANDROID_APP_LINKS_SHA256_FINGERPRINTS` from GitHub Environment `production` when configured so `/.well-known/assetlinks.json` stays current.

### Staging Web (Vercel and Cloud Run)

- **Vercel staging**: Uses custom environment `staging` inside project `zyxacademy` with Git branch tracking disabled. See [operations/vercel-staging.md](operations/vercel-staging.md).
- **Cloud Run staging**: Packages Next.js standalone output (`Dockerfile.cloud-run`) in Bangkok (`asia-southeast3`) behind `workers/staging-web-edge`. See [operations/cloud-run-staging.md](operations/cloud-run-staging.md).
- Both staging targets share Neon branch `br-gentle-scene-azq0gp91` (`neondb`), private bucket `zyx-staging`, and Neon Function `zyxcompute`.

## Background Workers and Queues

### Neon Functions (`workers/neon-background`)

Background jobs run on Neon Functions (`@neon/functions`), replacing the retired Deno Deploy runtime.

- Deploy via `.github/workflows/deploy-neon-worker.yml` (selecting `staging` or `production`).
- Readiness and smoke checks derive the expected function count directly from the canonical compute registration list and verify archive checksum parity.
- Ensure the web and worker revisions match whenever shared contracts (bundle V4 verification, queue payloads, or schema queries) change.

### Queue Provider Selection (`QUEUE_PROVIDER`)

`QUEUE_PROVIDER` selects how background tasks are dispatched:

- `inngest` (default): Uses Inngest Cloud with per-environment `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, and `INNGEST_ENV`.
- `cloud-tasks`: Uses Google Cloud Tasks queues (default queue + concurrency-2 PDF queue in Singapore) and Cloud Scheduler (`POST /internal/cron/tick` authenticated via Google OIDC ID token). Requires migration `0035_queue_task_checkpoints.sql`.
- `noop` / `memory`: Local test and development modes.

**Cloud Tasks rollback procedure**:
1. Pause the Cloud Scheduler dispatcher and stop new Cloud Tasks enqueues.
2. Record outstanding task identities and restore `QUEUE_PROVIDER=inngest` with verified Inngest function registration.
3. Reconcile pending outbox, PDF, and verification rows against terminal states before replaying.
4. Resume a single cron owner and confirm end-to-end delivery.

## Cloudflare Workers and AI Gateway

### Zyra Model Registry Staging Probe

AI requests route through Cloudflare AI Gateway (`CF_AI_GATEWAY_URL`, `CF_AI_GATEWAY_TOKEN`) with convention BYOK aliases and query-key fallback:

- **Dynamic discovery**: The model registry reads provider model-list metadata through AI Gateway without issuing generation probes or consuming quota. Discovered catalogs are cached in Workers KV for 12 hours (with a 14-day stale-usable window on upstream outage and a 5-minute retry delay).
- **Latency probes**: Scheduled at 00:00 and 12:00 UTC (or triggered manually in `/admin/ops/models`) using 3-sample median latency measurements with automatic retry on incomplete probes.
- **Alias cooldown**: Three consecutive failures place a provider alias into a 5-minute cooldown while healthy fallbacks serve traffic.
- **Control plane**: `workers/zyra-control-plane` coordinates distributed quota leases and health state (`ZYRA_CONTROL_PLANE_URL`, `ZYRA_CONTROL_PLANE_TOKEN`). Deploy production updates with `bun run prod:zyra-control:deploy`.

### Supporting Workers

- **Vector API (`workers/vector-api`)**: Proxies 768-dimensional Cloudflare Vectorize operations (`VECTORIZE_WORKER_URL`, `VECTORIZE_SHARED_SECRET`).
- **Diktat PDF Renderer (`workers/diktat-renderer`)**: Generates static Diktat PDFs via Cloudflare Browser Run (`DIKTAT_RENDERER_URL`, `DIKTAT_RENDERER_SECRET`). Deploy with `bun run staging:diktat-renderer:deploy` or `bun run prod:diktat-renderer:deploy`.
- **Realtime Classroom (`workers/realtime`)**: WebSocket worker for Live Quiz (`NEXT_PUBLIC_REALTIME_URL`, `LIVE_HMAC_SECRET`, gated by `FEATURE_LIVE=1`).
- **Python Runtime (`workers/python-runtime`)**: Isolated Python execution and WASI terminal ticket verification (`PYTHON_RUNTIME_TOKEN_SECRET`, `CODING_BROWSER_PROVIDER`).

## V4 Authoring Verification Providers

Product Bundle V4 verification supports three browser providers configured via `AUTHORING_VERIFICATION_BROWSER_PROVIDER`:

- `local_playwright` (recommended production operator path): Runs Chromium locally on the operator machine against the deployed `/authoring-verification` client shell with build-fingerprint verification and signed receipt submission. See [DEVELOPMENT.md](DEVELOPMENT.md#local-v4-verification).
- `cloudflare`: Uses Cloudflare Browser Rendering (`CF_ACCOUNT_ID`, `CF_API_TOKEN` or `CF_BROWSER_API_TOKEN`).
- `steel`: Uses Steel CDP sessions (`STEEL_API_KEY`, pinned `AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION`).

Switching providers changes verification plan hashes and requires a fresh verification attempt and PDF receipt before publication.

## Google Calendar Schedule Sync

Google Calendar sync requires migration `0040_google_calendar_sync.sql` before deploying matching web and worker code:

- Uses personal offline OAuth consent for individual users and the shared host `GOOGLE_REFRESH_TOKEN` for Zyx primary calendar sync.
- Daily synchronization is dispatched via the configured queue provider, with manual sync available in the schedule toolbar.
- Follow the token rotation procedure in [DEVELOPMENT.md](DEVELOPMENT.md#replace-the-shared-google-host-token-through-oauth-playground) when adding or refreshing Calendar scopes.

## Nightly Native App Releases

Run **Release Apps (Desktop & Mobile)** (`.github/workflows/release-apps.yml`) manually from `staging` with channel `nightly`, or from `main` with channel `stable`. Web-only changes take effect through web deployment; reserve native releases for wrapper, plugin, signing, or offline asset changes.

The workflow produces:
- **Android**: Signed APK (`com.zyx.academy` for Stable, `com.zyx.academy.nightly` for Nightly) using separate Nightly and Stable Android signing keys and separate Firebase app configs (`FIREBASE_STABLE_GOOGLE_SERVICES_JSON` / `FIREBASE_NIGHTLY_GOOGLE_SERVICES_JSON`).
- **Desktop (Tauri v2)**: Windows NSIS installer, macOS Apple Silicon DMG, Linux AppImage and Debian packages, plus signed `tauri-plugin-updater` artifacts (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_UPDATER_PUBKEY`).
- **iOS**: Distributed via TestFlight (no iOS binaries are published by GitHub Actions). Push notifications use HTTP/2 JWT APNs (`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `APNS_USE_SANDBOX`).

**Delta patches (Nightly)**:
- For each package, CI compares up to the two most recent Nightly releases and uploads a version-specific patch when it saves at least 20% of the full download, alongside full packages for fresh installs and recovery.
- Android verifies reconstructed APKs byte-for-byte before in-place install; Desktop verifies Tauri signatures or release SHA-256 checksums.
- To disable patches for a release, remove its `.zyxdelta`, `.zyxdelta-apk.gz`, and `.zyxdesktop.gz` assets while retaining full installers and checksums.

### Google sign-in in Expo Android

Expo staging can use Android Credential Manager on `com.zyx.academy.nativeparity`. Register the installed APK's signing certificate SHA-1 as an Android OAuth client in the staging Google project, then provide the refreshed Android Firebase client file to the existing Expo prebuild plugin. The selected app row must contain its package and certificate hash and one Web OAuth audience matching the staging server's `GOOGLE_CLIENT_ID`. Confirm the APK's actual signer, especially for an installed Play-signed build. The plugin writes only the public audience and allowed certificate fingerprints into the Android manifest. Builds without matching configuration use the verified system browser. After an unavailable picker or cancellation, the sign-in screen offers an explicit browser action. The account picker hands its ID token only to the existing single-use server verification flow. Expo independently validates the signed session and stores it in SecureStore. Device setup and a real Google account selection still require signed APK verification. This account operation does not change MCP tools, scope, consent, discovery, playbooks, skills, host prompts, or environment bindings.

### Saved account switching

Saved account switching (up to 5 Zyx accounts in the sidebar account menu) requires matching web deployment; Android native Credential Manager selection (`ZyxGoogleAuth`) additionally requires an APK containing the plugin. Older APKs, iOS, and Tauri use the system browser sign-in flow with session `login_hint`.

- Keep `GOOGLE_CLIENT_ID` on the server set to the **Web application** OAuth client ID.
- In the same Google Cloud project, register **Android** OAuth clients for each package and signing certificate SHA-1:

| Build | Package | SHA-1 Signing Identity |
| --- | --- | --- |
| Stable Android | `com.zyx.academy` | Production release signing certificate SHA-1 (or Play App Signing SHA-1) |
| Nightly Android | `com.zyx.academy.nightly` | Persistent Nightly CI signing certificate SHA-1 |
| Local Android debug | Installed debug package | Local debug keystore SHA-1 |

- Configure `ANDROID_APP_LINKS_SHA256_FINGERPRINTS` (stable) and `ANDROID_APP_LINKS_NIGHTLY_SHA256_FINGERPRINTS` (nightly) separately for `/.well-known/assetlinks.json` App Links verification.
- See [apps/mobile/README.md](../apps/mobile/README.md) and [apps/desktop/README.md](../apps/desktop/README.md) for local build and device verification instructions.

## Offline library rollout

The [offline data contract](operations/offline-data-sync.md#rollout-and-evidence) requires additive migration `0048_offline_content_sync.sql` before the matching web routes, followed by native Nightly builds from the same source revision. The draft PR does not deploy either environment or apply a remote migration. Preserve the change log on rollback; old cursors recover with a full authorized manifest. Native cookie transport and cold launch still require installed Android and desktop acceptance.
