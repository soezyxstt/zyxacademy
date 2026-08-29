# Zyra AI System Overhaul

Staging-focused program for Zyra provider routing, quotas, caching, pedagogy, personalization, multimodal input, copilot workflows, and AI operations.

This program complements the main Idea-centered system overhaul. It must not duplicate ownership of canonical knowledge, retrieval, mastery, or publication workflows.

## Key decisions

- Four Gemini keys represent four separate project quota pools.
- Student and tutor usage is bounded by role-specific allowances and abuse guards.
- `gemini-3.1-flash-lite` is the default text model; premium routes use higher-capability models when capacity allows.
- Admin Zyra is proposal-first. Mutations require explicit confirmation, authorization, precondition checks, idempotency, and audit records.
- Canonical retrieval and semantic-response caching use separate Vectorize indexes.
- Student image questions remain private and follow the same assessment-safety rules as text.
- Final publication stays outside the AI authoring flow.

## Infrastructure scope

The program uses staging-only Cloudflare and application resources, including:

- Durable Objects for quota coordination
- Analytics Engine for operations data
- KV for selected state and cache use
- private R2 storage for attachments
- separate Vectorize indexes for canonical retrieval and semantic cache
- Cloudflare AI Gateway
- Turso / SQLite application data

Production deployment is outside this program's scope.

## Ownership boundaries

The main overhaul remains authoritative for:

- mastery and confidence truth
- canonical vector migration
- canonical retrieval and citation authorization
- tutor and admin domain workflows
- student route parity
- final infrastructure cutover

This Zyra program owns:

- provider scheduling and health-aware routing
- quotas and usage accounting
- exact and semantic response caching
- pedagogical orchestration
- learner adaptation
- multimodal interaction
- private image attachments
- Zyra UI
- AI operations telemetry

Shared files such as `db/schema.ts`, `lib/env.ts`, `package.json`, `lib/tutor-rag.ts`, shared docs, and `components/course/**` must be edited serially when multiple plans run in parallel.

## Plan status

| Plan | Scope | Status |
|---|---|---|
| [001](001-cloudflare-control-plane-foundation.md) | staging control plane | DONE |
| [002](002-model-registry-and-provider-adapters.md) | model registry and adapters | PARTIAL |
| [003](003-distributed-quota-coordinator.md) | distributed quota coordination | DONE |
| [004](004-role-allowances-and-usage-ledger.md) | role allowances and usage ledger | DONE |
| [005](005-health-aware-model-routing.md) | health-aware model routing | DONE |
| [006](006-multilayer-semantic-cache.md) | exact and semantic cache | DONE |
| [007](007-pedagogical-zyra-harness.md) | pedagogical harness | IN PROGRESS |
| [008](008-evidence-based-personalization.md) | learner personalization | IN PROGRESS |
| [009](009-interactive-learning-canvas.md) | interactive learning visuals | IN PROGRESS |
| [010](010-multimodal-image-questions.md) | private image questions | IN PROGRESS |
| [011](011-murid-zyra-experience.md) | student Zyra experience | IN PROGRESS |
| [012](012-tutor-and-admin-copilots.md) | tutor and admin copilots | IN PROGRESS |
| [013](013-ai-operations-observability.md) | AI operations observability | IN PROGRESS |
| [014](014-staging-evaluation-and-rollout.md) | staging evaluation and rollout | BLOCKED |

Each plan file is the source of truth for detailed requirements, gates, dependencies, and evidence.

## Operator requirements

Before remote staging work:

1. Confirm the intended Cloudflare account with `wrangler whoami`.
2. Provide secrets through encrypted environment settings or `wrangler secret put`.
3. Configure the four Gemini project keys and AI Gateway settings.
4. Keep project aliases non-sensitive.
5. Confirm the staging retention policy for private learner images.

Never print or commit secrets, tokens, raw project identifiers, private attachment URLs, or learner data.

## Rollout rule

Plan 014 remains blocked until all prerequisite plans and human-review gates pass. Synthetic or local evidence must not be presented as live staging parity.
