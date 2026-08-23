# Database Guide

## Stack

| Environment | Engine | URL pattern |
|---|---|---|
| Development | SQLite (`dev.db`) | `file:dev.db` |
| Production | Turso (distributed SQLite) | `libsql://...` or `DATABASE_URL` |

Connection managed by `lib/db/index.ts` ; auto-detects production from `NODE_ENV`.

## Migration Workflow

```bash
# 1. Edit db/schema.ts (Drizzle ORM ; sqliteTable)
# 2. Generate migration files:
bun run db:generate
# 3. Apply locally:
bun run db:migrate
# 4. Push to production (safe: backup + verify):
bun run db:push:prod
```

Never hand-edit files in `drizzle/`.

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

- **SQLite stays** ; no Postgres. Turso for production scale.
- **Dual-hashing** ; `sourceHash` (raw content) + `derivedHash` (structured attributes) prevent unnecessary regeneration on cosmetic edits.
- **All timestamps** use `integer` (Unix ms) with `{ mode: "timestamp" }`.
- **Vectors** are stored externally in canonical Cloudflare Vectorize, not in SQLite. Legacy vector columns remain only as preserved migration history.
