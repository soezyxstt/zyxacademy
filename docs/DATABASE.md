# Database Guide

Staging and production use separate Neon PostgreSQL branches. See the [staging migration runbook](operations/neon-migration.md) and [production cutover runbook](operations/neon-production-cutover.md) for exact targets and evidence. The PostgreSQL adapter does not fall back to Turso or a local SQLite file.

The serving staging target is Neon project `muddy-sky-44104897`, branch `br-gentle-scene-azq0gp91` (`staging-neon-cutover-20261102`), database `neondb`, with its own private `zyx-staging` bucket. Target credentials are in ignored `.env.neon-staging-cutover`; `.env.neon-staging-cutover-source` also contains the guarded staging source and private reconciliation key. Use the verified direct PostgreSQL endpoint for imports and the pooled endpoint for application traffic. Frozen imports can consume a signed local source snapshot; the importer never retries an ambiguous commit automatically. Earlier preparation branches were retired after acceptance; do not reuse their saved credentials.

## Stack

| Environment | Engine | URL pattern |
|---|---|---|
| Development and CI on this branch | PostgreSQL | `postgresql://...` |
| Legacy development before migration | SQLite (`dev.db`) | `file:dev.db` |
| Staging | Neon PostgreSQL | Guarded pooled PostgreSQL URL |
| Production | Neon PostgreSQL | Guarded production pooled PostgreSQL URL |

`lib/db/index.ts` connects to PostgreSQL using `DATABASE_URL` in both serving environments. Production uses protected root `br-wandering-butterfly-azi11h8r` in project `muddy-sky-44104897`, database `neondb`, pooled host `ep-quiet-math-azyey0mb-pooler.c-3.ap-southeast-1.aws.neon.tech`, and private bucket `zyx-production`. Turso/SQLite resources remain recovery sources. After accepting Neon writes, freeze and reconcile before any return to the source.

## Migration Workflow

```bash
# 1. Edit db/schema.ts (Drizzle ORM PostgreSQL schema)
# 2. Generate migration files:
bun run db:generate
# 3. Apply to the verified isolated Neon target:
bun run db:migrate
```

Never hand-edit generated migration files. `db:push:prod` is disabled on this branch. The runner checks the isolated target identity before applying `drizzle-postgres/`.

The generated `0001_source-import-order.sql` adds the internal `impor_bundle.insertion_order` identity. Fresh imports preserve the source SQLite row order and advance its sequence. For an already imported rehearsal, `bun --env-file=<source-and-target-env> scripts/neon/backfill-import-order.ts` reads the source without writes, locks the isolated target table, reconciles every target ID and order value, then advances the sequence. It rejects missing source rows or a different target. The dedicated rehearsal reconciled all 140 import records.

Historical SQLite migration `0097_mushy_bushwacker.sql` changes the Diktat PDF evidence page-count constraint to accept 1 to 4 pages. It rebuilds `bukti_pdf_bundle`, copies every existing row and lineage field, and restores its indexes. It is not a PostgreSQL migration.

The generated `0009_polite_wendigo.sql` scopes item-review uniqueness to Product identity as well as import, reviewer and target. Its `NULLS NOT DISTINCT` constraint retains Idea uniqueness when `product_id` is null. It is a schema prerequisite for the flexible V3+ revision workflow and remains unapplied to serving environments until separately verified and authorized.

Generated `0010_silky_misty_knight.sql` includes upstream and downstream versions in canonical dependency-edge uniqueness. It preserves existing rows while allowing independently versioned successors to store their exact graph. Withdrawal removes only an unshared retiring version's active edges; immutable import artifacts retain its historical graph. Apply both migrations before deploying the revision services. Neither migration has been applied remotely as part of this task.

## Schema Reference

The table-by-table reference lives in [DB_SCHEMA.md](./DB_SCHEMA.md). High-level domains:

- **Auth** ; Better-Auth tables plus the canonical Indonesian identity layer (`pengguna`, `peran`, `pengguna_peran`).
- **Course and enrollment** ; catalog, cohorts, tokens.
- **Canonical source, Idea, product, assessment, mastery** ; the additive Indonesian learning-domain layer (`sumber_materi`, `potongan_sumber`, `ide`, products, evidence).
- **Content** ; MTDs, Knowledge Objects, assessment objects, profiles, policies.
- **Published assets** ; website materials, flashcards, diktats, course materials.
- **AI generation** ; jobs, question bank, usage events, traces, allowance leases.
- **Quiz and live classroom** ; templates (compatibility projection), attempts, feedback.
- **Mastery and analytics** ; learning events, mastery, streaks, recommendations, study paths.
- **Zyra runtime** ; learner profiles, preferences, attachments, proposals, operational telemetry.
- **Platform** ; blog, short links, forms, Meet sessions, media, push notifications.

## Key Design Decisions

- **Database migration** ; staging and production serve Neon PostgreSQL after independently frozen imports and reconciliation. Legacy Turso/SQLite resources are recovery sources.
- **Dual-hashing** ; `sourceHash` (raw content) + `derivedHash` (structured attributes) prevent unnecessary regeneration on cosmetic edits.
- **Timestamps** in the isolated PostgreSQL schema use `timestamptz`. Import conversion is bounded and validates mixed source timestamp units; see the runbook.
- **Vectors** are stored externally in canonical Cloudflare Vectorize, not in SQLite. Legacy vector columns remain only as preserved migration history.
