# Production Readiness Checklist

Pre-deployment validation gates and operational invariants for Zyx Academy releases.

## 1. Code Quality and Architecture Gates

- [ ] **Lint**: `bun run lint` passes with 0 errors.
- [ ] **Typecheck**: `bun run typecheck` and `bun run typecheck:tests` pass with 0 errors.
- [ ] **Structured Articles Typecheck**: `bun run typecheck:structured-articles` passes when authoring or reader modules change.
- [ ] **Boundary Audits**: `bun run audit:web-boundaries`, `bun run audit:ui-separation`, and `bun run worker:deno:audit` pass.
- [ ] **Bilingual Catalogs**: `bun run i18n:check` passes with full parity between `messages/id/` and `messages/en/`.
- [ ] **Ops Docs Index**: `bun run build:ops-docs` has been run if `docs/` or `AGENTS.md` changed.

## 2. Deterministic Contract Suites (Zero Network)

- [ ] **Core AI & Domain Contracts**: `bun run test:ai-contracts` passes deterministically with 0 live network calls.
- [ ] **Assessment Integrity**: `bun test tests/contracts/assessment-redaction.test.ts tests/contracts/quiz-timeout-submission.test.ts` passes (active attempts redact answers/explanations; timeout submissions are accepted and capped at `timeLimitSeconds`).
- [ ] **Tutor RAG & Cache Isolation**: `bun test tests/contracts/tutor-rag.test.ts tests/contracts/prompt-executor.test.ts` passes (shared KV cache is strictly student-free).
- [ ] **Authoring & MCP Contracts**: `bun test tests/contracts/authoring-mcp.test.ts tests/contracts/solution-authoring-integration.test.ts` passes (Idea V3, Product V4/V5, mandatory published Idea links with one primary for MCP quiz drafts/edits).
- [ ] **Admin Ops Knowledge & Alerts**: `bun test tests/contracts/admin-ops-ai-knowledge.test.ts tests/contracts/zyra-ops-alerts.test.ts` passes.
- [ ] **Email & Notification Preferences**: `bun test tests/contracts/email-notification-preferences.test.ts` passes.

## 3. Database and Storage Gates

- [ ] **Exact Target Verification**: Confirmed target Neon project (`muddy-sky-44104897`), branch (`br-gentle-scene-azq0gp91` for staging, `br-wandering-butterfly-azi11h8r` for production), database (`neondb`), and private bucket (`STORAGE_PROVIDER_MODE=neon`).
- [ ] **Snapshot & Migration**: Taken a Neon branch snapshot before applying pending `drizzle-postgres/` migrations via `bun run db:migrate`.
- [ ] **Catalog Seeds (when applicable)**: Guarded cosmetic/Pet Studio or demo snapshot seeds applied explicitly outside web requests.

## 4. Infrastructure, Workers, and AI Gateway Gates

- [ ] **Matching Worker Revision**: `workers/neon-background` deployed via `.github/workflows/deploy-neon-worker.yml` with verified function count and archive checksum matching the web release.
- [ ] **Queue Provider Alignment**: Verified `QUEUE_PROVIDER` (`inngest` or `cloud-tasks`), single active cron/scheduler owner, and migration `0035_queue_task_checkpoints.sql` when using Cloud Tasks.
- [ ] **AI Gateway & Model Registry**: Verified `CF_AI_GATEWAY_URL`, `CF_AI_GATEWAY_TOKEN`, `ZYRA_CONTROL_PLANE_URL`, and healthy model/alias configuration in `/admin/ops/models`.
- [ ] **MCP Compatibility Review**: Checked affected workflows against MCP tools, scopes, consent, capability discovery, playbooks, and packaged skills; updated `authoring-skills.lock.json` or mirrored plugin if required.

## 5. Native Mobile and Desktop Release Gates (When Releasing Apps)

- [ ] **Channel & Signing Isolation**: Confirmed `nightly` vs `stable` Android signing keys, separate Firebase app configs (`com.zyx.academy.nightly` vs `com.zyx.academy`), and Android OAuth SHA-1 registrations.
- [ ] **App Links & Push**: Verified `/.well-known/assetlinks.json` fingerprints and APNs/FCM credentials for the target channel.
- [ ] **Updater Integrity**: Confirmed Tauri updater signatures / SHA-256 checksums and full fallback installers alongside delta patches.

## 6. Durable Architectural Invariants

- All AI contract tests execute under zero-network conditions using fakes.
- No raw student data, prompts, responses, raw keys, or user identifiers are written to shared cache entries or `zyra_operational_events`.
- No pill-shaped UI elements (`rounded-full` is reserved for 1:1 circular elements).
- No em dashes or en dashes in code, copy, metadata, or documentation.
