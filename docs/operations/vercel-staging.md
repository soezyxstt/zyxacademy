# Manual Vercel Staging

Runbook for manually deploying and recovering the staging web tier on Vercel.

## Target

- **Vercel project**: `zyxacademy` (`prj_9wDdc36VFIH5wJT45jEXIHGst2pb`)
- **Custom environment**: `staging` (`env_puSffSpNjRY4ZXuB03j0H5Davx0X`), Git branch tracking disabled
- **Branch and GitHub Environment**: `staging`
- **Origin**: `https://staging.zyxacademy.com`
- **Data**: Neon project `muddy-sky-44104897`, branch `br-gentle-scene-azq0gp91`, database `neondb`, private bucket `zyx-staging` (`STORAGE_PROVIDER_MODE=neon`)
- **Background worker**: Neon Function `zyxcompute` on the staging branch

Always target `--target=staging`. Never pass `--prod` or write production/generic preview variables during a staging release.

## Release Procedure

1. **Pre-release checks**: Confirm pending `drizzle-postgres/` migrations are applied to the staging Neon branch and that `staging` CI checks pass.
2. **Verify secrets**: Ensure GitHub Environment `staging` has current runtime secrets, `VERCEL_TOKEN`, and `ANDROID_APP_LINKS_NIGHTLY_SHA256_FINGERPRINTS`. The deploy workflow validates target guards (rejecting production database, storage, Inngest, and renderer identities) and syncs only allowed variables to the custom `staging` environment.
3. **Dispatch staging web release**:
   ```bash
   gh workflow run deploy-web.yml --repo soezyxstt/zyxacademy --ref staging
   ```
   Staging pushes never trigger web deployment automatically (`vercel.json` disables Git builds for `staging`). The workflow does not run migrations or seeds.
4. **Coordinate matching worker**: Deploy the matching staging Neon worker via `.github/workflows/deploy-neon-worker.yml` (`environment=staging`) and verify its health and function registration.
5. **Post-deploy verification**: Confirm the deployment reaches `READY`, verify `https://staging.zyxacademy.com` landing, sign-in, `/api/health`, `/.well-known/assetlinks.json`, and authenticated read/write smoke checks.

## Recovery and Rollback

- If build or runtime verification fails, promote the last verified compatible Vercel staging deployment or dispatch `deploy-web.yml` from the previous known-good `staging` commit.
- If a schema migration or backfill accompanied the release, restore the Neon branch snapshot together with the matching web and worker revisions rather than rolling back web code alone.
- To switch staging traffic between Vercel and Cloud Run Bangkok, see [cloud-run-staging.md](cloud-run-staging.md).
