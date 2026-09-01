# Structured Article V3 Rollout

Status: `ACTIVE`. This runbook separates local preparation, staging mutation, deployment, flag enablement, and production course rollout.

## Ownership and rollback

- Flag: `FEATURE_STRUCTURED_ARTICLE_READER_V1`, default `false`.
- Owners: Akademik dan Konten together with the Zyx platform owner.
- Scope: V3 submission requirement and V3 admin review surfaces.
- Rollback: set the flag to `0`. V3 rows and artifacts remain stored, while V2 submission becomes available again. Published canonical content remains visible to students.
- Removal condition: every active Article is V3 or has a recorded exception, no V2 submission has occurred for 14 days, and runtime plus visual checks pass.

## Local preparation

1. Generate migrations from `db/schema.ts` with `bun run db:generate`.
2. Apply migrations with `bun run db:migrate`.
3. Run `bun run structured-articles:inventory` and record totals.
4. Run focused contract suites and skill validation.
5. Keep the feature flag disabled.

The inventory converts only trusted heading outlines. Flat or ambiguous documents are marked `needs_reauthoring`; it never invents one generic `Materi` section. Use `ALLOW_STRUCTURED_ARTICLE_RECONCILE=1 bun run structured-articles:reconcile` only against a verified nonproduction database.

## Staging rollout

Staging database mutation, MCP regeneration, application deployment, and flag enablement are separate approved actions. For each action:

1. Confirm `.env.staging`, the Turso hostname, branch, and commit.
2. Run the standard staging preflight and before inventory.
3. Apply migrations with the explicit staging migration plan.
4. Run structured Article inventory, then reconcile with its explicit allow variable.
5. Record before and after counts for structured, converted, and `needs_reauthoring` Articles.
6. Regenerate V3 Product Bundles through MCP and review every section before replacing the published version.
7. Deploy while the flag remains disabled.
8. Run route, console, HTTP, overflow, reader parity, and visual checks at 380 by 844 and 1536 by 864.
9. Enable the flag only after all checks pass.

Disabling the flag is the first authoring rollback action. It does not unpublish or hide canonical student content. Data contraction is not part of rollback.

## Production rollout

Production requires separate approval per course. Repeat preflight and before and after inventories, migrate additively, regenerate and review V3 content, deploy disabled, then enable only for the approved scope. Do not run a broad production synchronization or delete V2 artifacts.

The long Article acceptance case must produce multiple meaningful subtopics with overview and summary. A result containing one generic `Materi` section fails acceptance and must be reauthored.
