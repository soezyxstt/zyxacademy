# Development Guide

This guide covers local setup, core commands, CI scope, environment variables, feature flags, AI Gateway configuration, bilingual development, and local operator tools for Zyx Academy.

## Prerequisites and Quick Start

- **Runtime**: Bun `1.3.14` (pinned in `package.json`), Node.js 22+
- **Database**: PostgreSQL (`DATABASE_URL`); isolated contract tests use PGlite automatically
- **Optional native wrappers**: Android Studio / Xcode for `apps/mobile`, Rust + Tauri v2 prerequisites for `apps/desktop`

```bash
bun install
cp .env.neon.example .env.local   # fill in local/dev secrets
bun run db:migrate                # apply drizzle-postgres/ migrations
bun run dev                       # http://localhost:3000 (Next.js 16.3 Turbopack)
```

Before running the full test suite locally, generate the authoring skills bundle once:

```bash
bun run build:authoring-skills
```

## Available Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start Next.js 16.3 dev server (Turbopack) |
| `bun run build` | Build authoring skills, prepare V4 verification fingerprint, and run `next build` |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun run typegen` | Generate Next.js route types without building |
| `bun run typecheck` | Incremental application TypeScript check (`.cache/typecheck/app.tsbuildinfo`) |
| `bun run typecheck:tests` | TypeScript check for the full test project (`tsconfig.test.json`) |
| `bun run typecheck:structured-articles` | Typecheck structured Article contracts and compiler core |
| `bun run test` | Run Bun unit and contract tests |
| `bun run test:ai-contracts` | Run deterministic zero-network contract tests (`scripts/test-contracts.ts`) |
| `bun run i18n:check` | Validate paired `messages/id/` and `messages/en/` catalogs and key usage |
| `bun run audit:web-boundaries` | Verify client/server and worker import boundaries |
| `bun run audit:ui-separation` | Verify mobile/desktop UI separation boundaries |
| `bun run worker:deno:audit` | Audit background worker dependency graph |
| `bun run build:ops-docs` | Rebuild `lib/admin-ops-ai/ops-docs-index.json` from `docs/` and `AGENTS.md` |
| `bun run db:generate` | Generate Drizzle SQL migration in `drizzle-postgres/` |
| `bun run db:migrate` | Apply PostgreSQL migrations via `db/postgres-migrate.ts` |
| `bun run db:seed` | Seed local database with development fixtures |
| `bun run ci:plan -- --base <sha> --head HEAD` | Preview dependency-scoped CI plan locally |

## CI Scope and Incremental Checks

`.github/workflows/ci.yml` runs automatically on pull requests and pushes to `staging` and `main`. Its first job runs `scripts/ci/plan.py` (Python standard library) to compute the exact dependency closure of changed files:

| Changed Input | Selected CI Work |
| --- | --- |
| Frontend / API / `lib/` code | Application typecheck, ESLint on changed files, affected Bun tests and test compilation; web release on `main` push |
| Background worker modules (`workers/neon-background`, `jobs/`) | Worker dependency audit, typecheck, and asset checks; worker release on `main` push |
| V4 renderer or fingerprinted CSS | V4 binding/verification contracts; coordinated web and worker release on `main` push |
| Schedule or Authoring domains | Dedicated schedule or authoring contract suites and locked skills checks |
| Documentation (`docs/`) | Web release on `main` push (for Admin Ops Knowledge); skips compiler checks when only prose changed |
| Lockfiles or CI planner | Full check suite conservatively |

Staging pushes run CI validation only and never auto-deploy web or workers. Use manual `workflow_dispatch` on branch `staging` for `deploy-cloud-run-staging.yml`, `deploy-web.yml`, or `deploy-neon-worker.yml`.

Test the CI planner locally:

```bash
python3 -m unittest discover -s .github/scripts -p 'test_*.py' -v
```

## Environment Variables

All environment variables are validated at startup by `lib/env.ts` (`@t3-oss/env-nextjs`). Never commit real secrets.

### Core Server Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection URL (Neon pooled URL in staging/prod) |
| `BETTER_AUTH_SECRET` | Yes | 32+ char high-entropy secret (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Yes | Canonical public app origin for OAuth callbacks |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Yes | Google Web application OAuth credentials |
| `GOOGLE_REFRESH_TOKEN` | Optional | Shared Google Workspace host token (Meet, Forms, Sheets, Drive, Calendar) |
| `RESEND_API_KEY` | Yes | Transactional email API key |
| `GEMINI_API_KEY` (`_2`, `_3`, `_4`) | Yes (primary) | Gemini API keys with optional 4-slot failover and `GEMINI_PROJECT_ALIAS_1..4` |
| `QUEUE_PROVIDER` | Optional | `inngest` (default), `cloud-tasks`, `noop`, or `memory` |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Unless `cloud-tasks` | Inngest Cloud event and request-signing keys |

### Storage Variables

| Variable | Description |
| --- | --- |
| `STORAGE_PROVIDER_MODE` | `neon` (serving staging/production) or `r2` (adapter default when unset) |
| `NEON_STORAGE_BUCKET`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Private Neon S3-compatible object storage |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare R2 storage (optional/legacy) |

### AI Gateway

| Variable | Description |
| --- | --- |
| `CF_AI_GATEWAY_URL`, `CF_AI_GATEWAY_TOKEN` | Cloudflare AI Gateway base URL and authorization token; required for provider dispatch |
| `ZYRA_CONTROL_PLANE_URL`, `ZYRA_CONTROL_PLANE_TOKEN` | Distributed Zyra quota and health control-plane Worker |
| `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, `CF_API_TOKEN` | Cloudflare Workers KV for shared AI catalog and tutor cache |

The model registry in `/admin/ops/models` reads provider model lists through Cloudflare AI Gateway without generation probes or quota reservations:
- Discovered catalogs are cached in Workers KV for 12 hours (usable up to 14 days if upstream discovery fails, with a 5-minute retry delay).
- Background latency probes run at 00:00 and 12:00 UTC (or on demand via manual refresh) using 3-sample median latency with automatic retry on incomplete samples.
- Models sort newest first using verified release dates, then valid provider `created` timestamps; undated models remain selectable at the end. Video-only entries and quarantined models are excluded from text selection.
- Three consecutive failures trigger a 5-minute cooldown on the failing alias while fallback aliases serve traffic.

### Workers, Authoring, Observability, and Native Apps

| Group | Variables |
| --- | --- |
| Vectorize & PDF | `VECTORIZE_WORKER_URL`, `VECTORIZE_SHARED_SECRET`, `DIKTAT_RENDERER_URL`, `DIKTAT_RENDERER_SECRET` |
| Authoring Verification | `AUTHORING_VERIFICATION_BROWSER_PROVIDER` (`cloudflare`, `steel`, `local_playwright`), `STEEL_API_KEY`, `AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION`, `AUTHORING_VERIFICATION_RENDERER_URL`, `AUTHORING_VERIFICATION_RENDERER_SECRET` |
| Python Coding Runtime | `CODING_BROWSER_PROVIDER` (`local`, `cloudflare`, `steel`; `local` forbidden in prod), `PYTHON_RUNTIME_TOKEN_SECRET` |
| Live Classroom | `LIVE_HMAC_SECRET`, `NEXT_PUBLIC_REALTIME_URL` |
| Native App Links & Push | `ANDROID_APP_LINKS_SHA256_FINGERPRINTS`, `ANDROID_APP_LINKS_NIGHTLY_SHA256_FINGERPRINTS`, `APPLE_APP_SITE_ASSOCIATION_APP_IDS`, `APPLE_APP_SITE_ASSOCIATION_TEAM_ID`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `APNS_USE_SANDBOX` |
| Observability & Public Client | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_DESMOS_API_KEY`, `NEXT_PUBLIC_WHATSAPP_NUMBER` |

## Feature Flags

Only 8 optional feature flags are retained in `lib/feature-flags.ts`. All other foundational capabilities (Zyra tutoring, AI Ops dashboard, gamification, discussions, V4 articles, embedded visuals, bilingual UI) are always-on. Flags activate when set to `"1"` or `"true"`.

| Flag Key | Category | Description |
| --- | --- | --- |
| `FEATURE_PKA` | Academic & Student | Free Tutorial PKA campaign, staged simulations, and admin announcements |
| `FEATURE_REFLECTION_EMAIL` | Academic & Student | Weekly reflection reminder and summary emails |
| `FEATURE_LIVE` | Quiz & Live | Real-time Live Classroom interactive quizzes (`workers/realtime`) |
| `FEATURE_DIKTAT_AI` | AI & Architecture | AI-assisted audit suggestions during Diktat review |
| `FEATURE_ZYRA_IMAGE_INPUT_V1` | AI & Architecture | Private learner image input for multimodal Zyra tutoring (mirror with `NEXT_PUBLIC_FEATURE_ZYRA_IMAGE_INPUT_V1`) |
| `FEATURE_ZYRA_SEMANTIC_CACHE_V1` | AI & Architecture | Profile-free semantic cache with scope validation |
| `FEATURE_DRIVE_EDITOR_SYNC` | Platform | Auto-grant Drive editor access to active admins on exported spreadsheets/folders |
| `FEATURE_STRUCTURED_ARTICLE_READER_V1` | Platform | Transitional V3 subtopic Article authoring/review gate |

Do not add or remove a `FEATURE_*` flag without documenting its key, rationale, default, scope, rollback path, owner, and removal condition.

## Bilingual Interface Development

Supported UI locales are `id` (Indonesian) and `en` (English):
- `lib/i18n/locale.ts`: Normalization and server-safe preference resolution.
- `lib/i18n/client.ts` & `lib/i18n/server.ts`: Client hooks and server translation helpers.
- `messages/id/*.json` & `messages/en/*.json`: Paired JSON catalogs registered in `lib/i18n/catalogs.ts`.
- Keep API error codes, role values, search category keys, URLs, and stored academic content untranslated.
- Account interface locale persists in `account_locale_preferences`. Zyra conversation language overrides are in-memory only (bounded to 32 sessions per client) and reset on reload or account/course/locale change.
- Validate catalogs with `bun run i18n:check`.

## Google Calendar Schedule Sync

Migration `0040_google_calendar_sync.sql` adds `google_calendar_sync` for daily and manual schedule sync:
- Individual users connect via personal offline Google OAuth consent.
- Shared Zyx academic events sync to the shared host primary calendar using `GOOGLE_REFRESH_TOKEN`.

### Replace the Shared Google Host Token Through OAuth Playground

1. Open Google OAuth 2.0 Playground and click the gear icon; enable **Use your own OAuth credentials** and enter the target environment's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
2. Select all required Workspace scopes (Google Meet, Forms, Sheets, Drive, and Calendar events `https://www.googleapis.com/auth/calendar.events`) so existing integrations remain intact.
3. Authorize with the designated Zyx host account, exchange the authorization code for tokens, and copy the new refresh token.
4. Update `GOOGLE_REFRESH_TOKEN` in the target environment's secret store (never in Git) and verify manual and scheduled sync against a non-production account before rotating production.

## Local V4 Verification

When `AUTHORING_VERIFICATION_BROWSER_PROVIDER=local_playwright` is configured, operators verify staged Product Bundle V4 drafts locally against the deployed `/authoring-verification` shell:

1. Check out the exact clean Git revision matching the deployed web build.
2. Discover current browser and runtime pins:
   ```bash
   node scripts/authoring/run-product-v4-local.mjs --capabilities
   ```
3. Run verification for the exact import, staging run, and checksum:
   ```bash
   node scripts/authoring/run-product-v4-local.mjs --input <absolute-input-json-path>
   ```
4. The runner enforces target origin and build-fingerprint parity, renders via pinned local Chromium, captures evidence and PDF readback, and writes the signed verification receipt. Semantic review and publication remain separate MCP actions.

## Native Apps Development

- **Mobile (Capacitor 7)**: See [apps/mobile/README.md](../apps/mobile/README.md). Point to a local server via `ZYX_MOBILE_SERVER_URL=http://10.0.2.2:3000 npm run sync:android`.
- **Desktop (Tauri v2)**: See [apps/desktop/README.md](../apps/desktop/README.md). Point to a local server via `ZYX_DESKTOP_SERVER_URL=http://localhost:3000 npm run dev`.
