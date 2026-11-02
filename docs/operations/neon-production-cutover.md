# Neon production cutover

Status: `OPEN / IN PROGRESS`. Production still serves the existing Turso/R2 deployment. Staging acceptance is recorded in [the migration runbook](neon-migration.md).

## Verified targets

- Worktree: `D:/ZYX/zyx-neon-production`, branch `migration/neon-production`. The integration preserves the production Python terminal repair from `ae5b824e0bf414b66099a0128ec0d34c57cd02e6`.
- Vercel project: `zyxacademy`, `prj_9wDdc36VFIH5wJT45jEXIHGst2pb`, team `team_rMFT8hSTCTObKzXirjJcbMFc`. The pre-cutover deployment is `dpl_9FdH4i1KTTw1yhEERuDzFkT7mCk9`, serving `zyxacademy.com` and `www.zyxacademy.com`.
- Neon project: `muddy-sky-44104897`, Singapore. Dedicated production target: `br-wandering-butterfly-azi11h8r`, named `production`, the independently checked empty root. Staging remains isolated on its existing child branch. The initial preparation branch `br-polished-cell-az2cjf0y` was superseded because Neon rejects snapshots on non-root branches; retire it after final target acceptance.
- Database: `neondb`. Application host: `ep-quiet-math-azyey0mb-pooler.c-3.ap-southeast-1.aws.neon.tech`. Imports use the corresponding direct endpoint. Verified TLS is required.
- Private bucket: `zyx-production`, endpoint `https://br-wandering-butterfly-azi11h8r.storage.c-3.ap-southeast-1.aws.neon.tech`, region `ap-southeast-1`. Its credential is scoped to the production branch, with storage read/write permissions.
- Ignored local settings: `.env.neon-production` and `.env.neon-production-source`. Keep signed snapshots in the owner-restricted `.tmp/neon-private-snapshots` directory. Never upload environments, snapshots, credentials or real sessions to CI or sandboxes.

## Rehearsal evidence

The read-only source inventory found 194 SQLite tables including migration metadata, 114 users and canonical profiles, 113 OAuth accounts, 279 sessions, and no foreign-key violations. A single-statement snapshot completed in 10.521 seconds. Its import committed and reconciled 78,894 rows across 193 PostgreSQL application tables, including authentication and push registrations. This is a rehearsal snapshot while production remained writable. It cannot authorize traffic cutover. The existing local production auth secret was verified against a current deployed session without printing tokens. Preserve the existing production auth secret and OAuth client settings.

Evidence lives under ignored `artifacts/neon-production/`. The first local focused suite ran on the host's older Bun 1.2.21, with 22 passes and one Windows file-cleanup EBUSY failure. Linux verification passed all 25 migration tests on pinned Bun 1.3.14. All 27 deployment-script tests passed after normalizing the transferred existing shell script to LF; the initial five CRLF failures remain recorded. Storage transfer, final CI, maintenance, frozen import and hosted production acceptance remain separate gates.

## Cutover gates and sequence

1. Complete the source integration, full contract suite, typecheck, lint, build and worker checks on the exact release head. Verify the Vercel production build path as well as staging's standalone build path.
2. Production Inngest identity was verified read-only as `production-1bedaa8a`, app `zyx-academy`, with 24 unpaused functions, no running or queued jobs, and sync URL `https://zyx-background.soezyxst.deno.net/api/inngest`. The owner supplied its existing key privately. The stale key in `.env.prod` resolves to `branch-388fdd42` and must not be used. Recheck production state immediately before maintenance; never substitute staging or rotate keys.
3. Record the old immutable Vercel deployment, production worker revision and environment metadata. Preserve existing secret values and source Turso/R2. A rollback must restore the old application and worker together with their matching settings.
4. Only after preparation passes, pause the exact production Inngest functions, wait for running work to finish, pause the exact production Vercel project and verify public/API denial. Drain remaining requests and account for any other source writers. Do not leave production in maintenance while waiting for CI or missing access.
5. Export a new signed production snapshot with `NEON_SOURCE_FREEZE_ACK=production-writes-frozen`. Production snapshots include accounts, sessions, verification and push registrations. Import with `--include-sensitive-auth` and `NEON_PRIVATE_TARGET_ACK=private-isolated`. A rehearsal manifest is explicitly rejected under the frozen-cutover acknowledgement. Clear only the verified, unserved rehearsal destination before the final import, preserving its evidence and the untouched source.
6. Reconcile every imported table by keyed content digest and validate all foreign keys. Complete the R2 copy with checksums and an unchanged source inventory; reconcile additions, deletions and replacements since rehearsal rather than ignoring conflicts or leaving stale destination objects.
7. Synchronize only the verified production Vercel/GitHub runtime settings and Deno worker to the same production Neon database and bucket. Preserve the existing auth, Python and other integration secrets. Deploy the validated release while access and background dispatch remain blocked.
8. Verify existing session continuity, canonical roles, private-object access and anonymous denial, public and protected routes, worker authentication and queue registration. Use owned synthetic fixtures for mutation tests; never alter real user records to test booking or grading. Remove those fixtures.
9. Restore production access and the exact previous Inngest pause states. Monitor errors, latency, connection usage and job failures. Have the owner complete a fresh Google sign-in to exercise the browser OAuth boundary.

## Rollback boundary

Before accepting production writes in Neon, restore the previous immutable Vercel deployment, worker and settings, then restore access and original job pause states. After accepting writes, first freeze both backends and reconcile Neon-only transactions and objects. Switching a URL alone would lose those changes. Retain Turso/R2 and the old deployments throughout the observation window. The project history retention is configured to 24 hours. The production root has a read-back daily snapshot schedule at 20:00 UTC with seven-day retention. Snapshot creation and an isolated restore drill must pass before production readiness is claimed. The first attempt on the superseded child branch was rejected by Neon because snapshots require a root branch.
