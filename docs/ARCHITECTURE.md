# Zyx Academy Architecture

Zyx Academy is a full-stack, multi-platform learning management system built with Next.js 16.3 (App Router), React 19, TypeScript, Drizzle ORM, Neon PostgreSQL, Neon Object Storage, Neon Functions, Cloudflare Edge/AI services, Capacitor 7 (mobile), and Tauri v2 (desktop).

## 1. System Topology and Boundaries

```text
Clients: Web Browser | Capacitor 7 (Android/iOS) | Tauri v2 (Windows/macOS/Linux)
  |
  v
Web Tier: Next.js 16.3 App Router
  |-- Production: Vercel (sin1)
  |-- Staging: Vercel custom staging OR Cloud Run Bangkok (asia-southeast3) behind Cloudflare Edge Worker
  |-- Route groups: (marketing), (student), (tutor), (admin), /api/*, /api/mcp/authoring, /offline
  |
  +--> Data Layer (Drizzle ORM -> PostgreSQL only, no SQLite/Turso fallback)
  |      |-- Neon PostgreSQL (separate staging & production branches)
  |      |-- Neon Object Storage (private S3-compatible buckets, STORAGE_PROVIDER_MODE=neon)
  |
  +--> Background Compute & Queues
  |      |-- Queue Abstraction (QUEUE_PROVIDER): Inngest Cloud (default) | Google Cloud Tasks + Scheduler
  |      |-- Worker Runtime: Neon Functions (workers/neon-background, function zyxcompute)
  |
  +--> Cloudflare Edge & AI Platform
         |-- Cloudflare AI Gateway (multi-provider routing, BYOK aliases, query-key fallback)
         |-- Cloudflare Vectorize (768d canonical-content-v2 & admin_ops_knowledge namespaces)
         |-- Cloudflare Workers KV (12h AI model catalog cache, profile-free tutor cache)
         |-- Cloudflare Workers: vector-api, zyra-control-plane, realtime, diktat-renderer, python-runtime, staging-web-edge
```

### Core Architectural Invariants
- **PostgreSQL only**: `lib/db/index.ts` requires PostgreSQL (`DATABASE_URL`). Isolated contract tests use PGlite.
- **Private object storage**: Serving staging and production use private Neon S3-compatible buckets (`STORAGE_PROVIDER_MODE=neon`). Authorized files are served through access-checked routes or short-lived signed URLs; no public asset proxy exposes private academic or user objects.
- **Non-blocking heavy work**: Ingestion, vector sync, PDF rendering, mastery recomputation, calendar sync, and AI batch generation execute via the queue abstraction (`QUEUE_PROVIDER`) and `workers/neon-background`.
- **Web vs Worker separation**: Modules consumed by `workers/neon-background` must remain framework-neutral (no Next.js or React imports). Verified by `bun run audit:web-boundaries` and `bun run worker:deno:audit`.

## 2. Multi-Platform UI and Client Data Architecture

### Separated Mobile and Desktop LMS Shells
LMS surfaces separate mobile and desktop navigation and views under `features/` (`student-dashboard`, `student-assessment`, `student-profile`, `student-schedule`, `tutor-dashboard`, `tutor-schedule`, `admin-home`, `discussions`, `grading`), verified by `bun run audit:ui-separation`:
- **Navigation**: Desktop uses hybrid domain-grouped sidebars; mobile uses `MobileNavbar`, bottom navigation tabs, and sheet drawers with history-backed overlay dismissal (Android Back closes the top dialog/sheet/sidebar before navigating back).
- **Sticky Tabs**: `components/ui/tabs.tsx` provides full-width sticky horizontal tabs with automatic overflow collapse into a `More` / `Lebih` popover.
- **Global Search**: Unified command-menu search (`cmdk`) scoped by role and access permissions.

### Client Data Fetching (`@tanstack/react-query`)
Client data ownership follows [data-fetching.md](data-fetching.md):
- Account-scoped query keys prevent cross-account cache leaks during account switching.
- Server Components (RSC) handle initial page hydration and streaming boundaries; TanStack Query manages interactive client reads, optimistic updates, and mutation invalidation.
- Request-scoped session and read deduplication avoid redundant database queries within a single request.

### Native Wrappers and Offline Reader
- **Mobile (`apps/mobile`)**: Capacitor 7 shell loading the live origin with native bridges for FCM/APNs push notifications, local study reminders, camera restore recovery, OS share/files, haptics, pull-to-refresh, Android App Links (`/.well-known/assetlinks.json`), iOS Universal Links, and offline fallback (`/offline`).
- **Desktop (`apps/desktop`)**: Tauri v2 shell with single-instance deep-link routing (`zyxacademy://`, `zyxacademy-nightly://`), persisted side-by-side window geometry, desktop push bridge, and signed `tauri-plugin-updater` / delta updates.
- **Offline Shell**: Decoupled offline service worker and native offline reader store saved readings in account-scoped private storage and clean up on sign-out or account switch.

## 3. Identity, RBAC, and Saved Account Sessions

### Better Auth + Canonical RBAC
- Authentication is powered by Better Auth (`user`, `session`, `account`, `verification`) with Google OAuth and PKCE.
- Canonical domain authorization uses `pengguna`, `peran` (`admin`, `tutor`, `murid`), and `pengguna_peran` (many-to-many role assignments), allowing multi-role users.
- Active sessions visiting marketing entry routes redirect to their role dashboard using the canonical public origin.

### Saved Account Sessions
The sidebar account menu supports up to 5 concurrent saved Zyx sessions:
- **Web & Desktop**: Saved sessions switch active cookies without re-authenticating with Google; adding an account uses system-browser OAuth with `login_hint`.
- **Android**: Uses the `ZyxGoogleAuth` Credential Manager plugin with explicit browser fallback on cancellation or older APKs.
- **Isolation on switch**: Switching or removing an account clears account-scoped TanStack Query caches, private offline reader caches, guarded coding drafts, and active Zyra conversation overrides, while pausing receiving-tab interactions until the new session identity settles.

## 4. Canonical Content and Authoring Pipeline

Zyx separates authoring from publication using deterministic, versioned bundles:

```text
Source PDFs / Documents
  -> Source Pack (lossless transcription, page checksums, figure extraction)
  -> Idea Bundle V3 (atomic Ideas, provenance, learning sections, relations)
  -> Product Bundle V4 (structured scientific Articles, authored Diktats, flashcards)
  -> Product Bundle V5 (standalone reviewed solution collections)
  -> Flexible Revisions (stable-ID MCP edits, selective review reuse, atomic release, restore)
```

- **Product V4 (default for Article & Diktat)**: Supports ordered scientific blocks, KaTeX math, typed `zyx-visual` Markdown embeds, sandboxed `interactive_document` widgets (with theme/resize/offscreen-pause messaging), source figure assets, and static 1 to 4 page Diktat PDFs.
- **Verification and Review**: Staged drafts require browser and PDF verification (`local_playwright`, `cloudflare`, or `steel`) bound to the exact import, revision, and web build fingerprint, followed by explicit semantic review before atomic publication.
- **MCP Surface (`/api/mcp/authoring`)**: Streamable HTTP MCP server exposing authoring, assessment, and admin operations with OAuth PKCE consent, 4 default OAuth scopes plus explicit publication/admin grants, capability discovery, and operation receipts.

## 5. Zyra AI Architecture and Multi-Provider Routing

### Cloudflare AI Gateway and Dynamic Model Registry
All LLM requests route through Cloudflare AI Gateway (`CF_AI_GATEWAY_URL`, `CF_AI_GATEWAY_TOKEN`):
- Supports multi-provider BYOK aliases and query-key fallback configured per feature or globally in `/admin/ops/models`.
- Dynamic model-list discovery caches provider catalogs in Workers KV for 12 hours (14-day stale-usable window) and sorts newest first by verified release date then provider `created` timestamp.
- Scheduled (00:00 and 12:00 UTC) and manual 3-sample median latency probes monitor provider responsiveness.
- Three consecutive failures trigger a 5-minute alias cooldown with automatic fallback to healthy aliases.

### Zyra Distributed Quota Coordinator
`workers/zyra-control-plane` (Cloudflare Worker with SQLite Durable Objects) coordinates distributed allowance leases, fairness across project slots, and masked health diagnostics:
- Every learner generation acquires a lease before provider dispatch and commits or refunds idempotently on completion or terminal failure.
- Standard student daily turns scale by gamification rank bonus (15 to 18 turns per Jakarta day).
- Operational telemetry uses fixed-column `zyra_operational_events` and never stores prompts, responses, raw keys, object keys, or learner identities.

### Grounded Retrieval and Vector Synchronization
- **Canonical learning index**: 768-dimensional cosine Cloudflare Vectorize index (`canonical-content-v2`). Legacy namespaces (`learning`, `practice`, `past_exams`, `idea`, `product`) are retired and quarantined (`VECTOR_SYNC_LEGACY_NAMESPACE_RETIRED`); no legacy KO retrieval fallback exists.
- **Transactional outbox (`vector_sync_queue`)**: Canonical publication, withdrawal, and question mutations enqueue deterministic outbox rows. Workers reread canonical state under advisory locks before provider writes, isolate failures by vector identity, and enforce assessment answer safety (no answer keys in shared caches or active-attempt retrieval).
- **Admin Ops Knowledge**: Separate `admin_ops_knowledge` Vectorize namespace and prebuilt `lib/admin-ops-ai/ops-docs-index.json` index curated documentation (`CURATED_ADMIN_KNOWLEDGE_ALLOWLIST`), never mixing with student tutoring namespaces.
- **Zyra streaming & pedagogy**: Live SSE streaming with response progress indicators, KaTeX macro normalization, subtle follow-up quick actions, automatic AI thread titles, and in-memory per-session language overrides (bounded to 32 sessions).

## 6. Assessment, Coding, Discussions, and Scheduling

- **Assessments**: Canonical `soal`, `asesmen`, `percobaan_asesmen`, and `jawaban_murid` with compatibility projections (`quiz_templates`, `student_quiz_attempts`). Timed quizzes accept timeout/late submissions and cap recorded duration at `timeLimitSeconds`; untimed quizzes omit deadlines.
- **Live Classroom (`FEATURE_LIVE`)**: `workers/realtime` WebSocket sessions authenticated with `LIVE_HMAC_SECRET`.
- **Python Learning**: Editable Python blocks in Articles, viewport-aware Playground editor, browser Pyodide runtime, staging WASI terminal via `workers/python-runtime`, explicit Submit grading (`CODING_BROWSER_PROVIDER`), and Zyra Python/Tutor coaching. See [coding-foundation.md](coding-foundation.md).
- **Discussions**: 13 PostgreSQL tables with GIN full-text search (`0041`), bilingual scoped channels, immutable retry keys, `@Zyra` AI dispatch with cooldowns, mention handles, and emoji status. See [discussions.md](discussions.md).
- **Google Calendar Sync**: `google_calendar_sync` (`0040`) syncs personal offline OAuth calendars and the shared Zyx host primary calendar via daily queue dispatch and manual toolbar actions.

## 7. Student Social Identity Projection

Gamification and social features are student-only (admin gamification pages were removed):
- **Projection boundary**: Public student profiles (`/students/[publicId]`), `StudentProfileDialog`, and people search expose only authorized public fields (public ID, display name, photo/frame, rank, featured badges, equipped owned Zyra mascot, follow counts). LP balances, emails, internal account IDs, and private academic stats are never exposed.
- **Privacy & moderation**: Enforces member visibility (`0037_member_profile_visibility.sql`), bidirectional block filtering, report controls, and leaderboard opt-in.
- **Public Demo**: `/demo` reuses the exact student shell and renderers with `StudentAccountBoundary` and browser-local fictional state, never mutating live accounts or spending AI quota.

## 8. Bilingual Locale and Routing

- Supported locales: `id` and `en` via `next-intl` and paired JSON catalogs under `messages/id/` and `messages/en/`.
- `proxy.ts` handles finite public locale rewrites while preserving canonical origins.
- Preference precedence: authenticated `account_locale_preferences` -> cookie/browser locale -> default `id`.
- Background email and notification templates are worker-safe (no React/Next.js imports).
