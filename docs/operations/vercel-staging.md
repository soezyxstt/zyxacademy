# Manual Vercel staging

Status: `OPEN / IN PROGRESS`. The release path is implemented; hosted recovery and DNS acceptance remain pending.

## Target

- Vercel project: `zyx-neon-migration`, `prj_orC6CPtO0tyvUsrojntmGMSARHbd`.
- Team: `team_rMFT8hSTCTObKzXirjJcbMFc`.
- Branch and GitHub Environment: `staging`.
- Origin: `https://staging.zyxacademy.com`.
- Neon project `muddy-sky-44104897`, branch `br-gentle-scene-azq0gp91`, compute `ep-sparkling-lab-azrp3ymj`, database `neondb`, bucket `zyx-staging`.
- Worker: Neon Function `zyxcompute` on that branch; Inngest environment `staging-40f1da25`.

The Vercel production deployment target is used inside this staging-only project so its custom domain can serve normally. Never substitute the production project `zyxacademy` or its local `.vercel/project.json`.

## Release and reopen

1. Record current deployment IDs, project pause/protection/Git settings, domain assignment, DNS record, compute disabled state and Inngest pause states. Do not record secret values in reports.
2. Complete the compact question-history gate in [DEPLOYMENT.md](../DEPLOYMENT.md), including backup, the migration journal, authorized backfill and ready marker, with old writers stopped. A migration-only result does not satisfy this gate. Keep traffic held until matching web and worker code are deployed.
3. Keep Vercel Git integration disconnected. `vercel.json` explicitly rejects staging Git builds and CI calls the web workflow automatically only on `main`. Keep the production deployment hold unchanged.
4. Ensure GitHub Environment `staging` has its existing runtime secrets and `VERCEL_TOKEN`. The shared worker guard rejects production database, storage, Inngest and renderer identities. The manual web workflow syncs allowed settings to the staging project, including origins and compute URL, before building. CI credentials are never runtime settings. Public build variables use encrypted storage; server values use sensitive storage.
5. Explicitly dispatch the staging web release, after its database cutover gate is satisfied:

   ```powershell
   gh workflow run deploy-web.yml --repo soezyxstt/zyxacademy --ref staging
   ```

   This dispatch is intentionally allowed while automated production web deployment is held. A staging push cannot run this job. The workflow does not run migrations, backfill or seed.

6. Inspect the exact deployment's READY result, build revision and runtime logs. Deploy the matching Neon worker using its existing staging workflow. Do not resume the legacy Deno app. Keep Inngest paused until the matching worker passes its documented health/preflight checks.
7. After validation, unpause only this staging Vercel project, restore the intended staging-domain protection policy, and assign the verified deployment to its staging domains. Avoid unpausing a paused project while an old deployment is still its active deployment: unpause can reactivate that old deployment.
8. Update only the `staging.zyxacademy.com` CNAME from `ghs.googlehosted.com` to the currently recommended value returned by Vercel domain configuration. On 2026-11-15 this was `a18542420b32ac7a.vercel-dns-016.com`. Preserve all other DNS records. The available Cloudflare account did not have this zone, so this operation remains blocked on DNS access.
9. Re-enable the exact staging compute only in the coordinated maintenance window. Verify landing/sign-in, read-only database-backed routes, static assets and application health over the selected domain. Verify OAuth callbacks separately. Resume staging Inngest only after successful matching-worker validation. Check no old Google/Deno deployment can resume writes.

## Read-only findings, 2026-11-15

Remote `staging` was `869f20b9898b6391f6952ccf337d711ea402d267`, with PR 333 merged. The staging Vercel project was paused with no Git link and protection on all deployments. Its existing database variable did not match the current staging target. The domain was assigned to the correct Vercel project but DNS still targeted Google. The active staging Neon Function was deployment 7 from November 10, so a matching new worker must be deployed before reopening writers. The operator reported migrations 0016 through 0023 complete; this report is not a backfill or runtime acceptance result.

## Database cutover evidence, 2026-11-15

The user authorized completion of staging recovery, including backfill and seed.
Backup branches `br-lingering-band-azbbkkyk` and `br-old-forest-azfgxkp9` retain the
pre-backfill data. Both were created from the exact staging branch without a compute.
The migration journal has 26 entries and the guarded backfill verified its pinned
complete state. The backfill indexed 2,357 legacy history entries from 95 attempts
and committed the `v1` marker; its retry was a no-op. The catalog seed inserted
21 entries, verified 28, and inserted zero on retry.

Revoking database CONNECT was tested and proved insufficient through the Neon
proxy, so its original ACL was restored. The staging owner credential was then
replaced and retained privately for recovery. Existing owner sessions were checked
and terminated where present. Independent direct and pooled connection tests with
the old credential both failed with `28P01`; fresh operator and application logins
both succeeded. Roles and credentials are branch-scoped. Old Google, Deno and Neon
worker configurations must retain their invalid old credential. Only matching new
code receives the application login `zyx_staging_app_20261115`. GitHub Environment
`staging` DATABASE_URL was updated privately. Production was not changed.

This proves a database write fence for old credentials, not termination of all
external runtime processes. Deno remains suspended and must not be resumed.
The temporary operator login is reserved for the controlled database window.

Live PostgreSQL fixtures exposed two release blockers: raw SQL timestamp strings
were passed into Drizzle Date columns, and the comeback lookup selected a sequential
scan for correlated history. Normalize projection timestamps with the shared date
helper and order the limited comeback lookup by its indexed timestamp. After these
fixes, the exposure and real writer/processor fixtures passed with synthetic writes
rolled back; the default planner used the six-column index with bounded work.
Hosted web/worker release and domain acceptance are still pending.

## Recovery

If release/build verification fails, leave traffic and Inngest held and keep the database disabled outside the controlled validation window. Restore the saved Vercel project settings and staging DNS only when their matching application/database unit is valid. A previous Vercel deployment alone is not a safe rollback after compact-history backfill: restore the verified pre-cutover database backup and matching old code together, or keep maintenance active and fix forward. Do not delete the Google service, Vercel revisions, Deno app, credentials or backups as part of this move.
