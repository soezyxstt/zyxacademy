# Database Guide

Staging now uses Neon PostgreSQL; production remains on Turso. See [the migration runbook](operations/neon-migration.md) for exact targets and cutover evidence. The PostgreSQL adapter does not fall back to Turso or a local SQLite file.

The serving staging target is Neon project `muddy-sky-44104897`, branch `br-gentle-scene-azq0gp91` (`staging-neon-cutover-20261102`), database `neondb`, with its own private `zyx-staging` bucket. Target credentials are in ignored `.env.neon-staging-cutover`; `.env.neon-staging-cutover-source` also contains the guarded staging source and private reconciliation key. Use the verified direct PostgreSQL endpoint for imports and the pooled endpoint for application traffic. Frozen imports can consume a signed local source snapshot; the importer never retries an ambiguous commit automatically. The earlier branch `br-holy-snow-azveniaa` remains a separate preparation target.

## Stack

| Environment | Engine | URL pattern |
|---|---|---|
| Development and CI on this branch | PostgreSQL | `postgresql://...` |
| Legacy development before migration | SQLite (`dev.db`) | `file:dev.db` |
| Staging | Neon PostgreSQL | Guarded pooled PostgreSQL URL |
| Production | Turso (distributed SQLite) | `libsql://...` or `DATABASE_URL` |

On this branch `lib/db/index.ts` connects to PostgreSQL using `DATABASE_URL`. Production still runs its previous Turso-compatible code.

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

- **Database migration** ; existing deployments use Turso and local SQLite. This branch tests Neon PostgreSQL in isolation.
- **Dual-hashing** ; `sourceHash` (raw content) + `derivedHash` (structured attributes) prevent unnecessary regeneration on cosmetic edits.
- **Timestamps** in the isolated PostgreSQL schema use `timestamptz`. Import conversion is bounded and validates mixed source timestamp units; see the runbook.
- **Vectors** are stored externally in canonical Cloudflare Vectorize, not in SQLite. Legacy vector columns remain only as preserved migration history.
