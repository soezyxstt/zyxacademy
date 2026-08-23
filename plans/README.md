# Zyx Idea-Centered Learning System

## Program status

Plans 001 through 016 are complete. Their detailed execution specifications were removed from the working tree after completion to keep active documentation focused. The full specifications and diffs remain available in Git history.

The completed program delivered:

- guarded staging migrations and deterministic reconciliation;
- Indonesian role and identity compatibility;
- the Source, Idea, Product, assessment, and mastery domains;
- deterministic legacy backfill with preserved history;
- Idea Bundle and Product Bundle authoring workflows;
- protected authoring context packs and assessment integrity;
- article, diktat, question, and mastery quality gates;
- canonical 768-dimensional Vectorize indexing and retrieval;
- Zyra canonical, admin, tutor, murid, and Tutorial PKA workflows;
- a verified staging cutover with legacy rollback assets preserved.

Detailed runtime behavior belongs in `docs/features.md`, architecture in `docs/ARCHITECTURE.md`, schema state in `docs/DB_SCHEMA.md`, and rollout gates in `docs/operations/production-readiness-checklist.md`. Generated staging evidence remains under ignored `artifacts/staging-overhaul/<runId>/` directories.

## Active plan

| Plan | Status | Scope | Exit gate |
|---|---|---|---|
| [017](017-audit-rework.md) | IN PROGRESS | Minimal audit rework for Idea-centered authoring and learning | Local contracts, lint, typecheck, and diff checks pass without schema or remote writes |

Plan 017 is local-only until a separate staging review authorizes remote actions. References in the plan to its former feature branch are historical; current work is integrated on `staging`.

## Permanent invariants

1. Preserve user identities, enrollments, attempts, progress, chats, analytics, and immutable snapshots.
2. Use expand, migrate, verify, switch, then contract for database changes.
3. Load `.env.staging` and pass the staging identity guard before every remote staging action.
4. Never expose secrets, authenticated URLs, raw conversations, or raw user IDs in evidence.
5. Edit `db/schema.ts`, generate migrations, and never hand-edit `drizzle/`.
6. Keep optional, risky, or reversible behavior behind its declared `FEATURE_*` flag. Foundational behavior is always-on and intentionally has no env flag.
7. Turso remains the source of truth. Vectorize stores searchable representations and identifiers only.
8. Preserve rollback assets until a separately authorized contraction.
9. Run lint, targeted tests, typecheck, and `git diff --check` before integration.
10. Do not run production migrations or deployments without explicit authorization.
