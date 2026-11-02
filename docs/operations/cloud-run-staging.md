# Cloud Run staging setup

Status: `OPEN / IN PROGRESS`. Pricing checked on 2026-10-25. The user reports creating the Artifact Registry repository in Taiwan. The local standalone build and container smoke checks pass. No remote image publication or Cloud Run deployment has been verified by this task.

## Target and configuration

The selected project is `zyx-academy`; the selected region is Taiwan, `asia-east1`. The user has already created service `zyx-academy`; CI deploys directly to that existing service and does not create another one. Kuala Lumpur was not available in the user's repository creation form. Deploy the Next.js web app and retain the existing staging Turso database, R2 storage, Deno worker, Inngest environment, and supporting Cloudflare Workers.

| Setting | Initial value |
| --- | --- |
| Service | `zyx-academy` |
| Billing | Request-based, CPU throttled outside requests |
| CPU | 1 vCPU |
| Memory | 1 GiB, provisional until measured |
| Minimum instances | 0, accept cold starts |
| Service-level maximum instances | 1 |
| Concurrency | 8, load test SSR and PDF parsing before increasing |
| Request timeout | 300 seconds; keep long jobs on Deno/Inngest |
| Container | Linux amd64, listen on `0.0.0.0:$PORT`, port 8080 |
| Networking | Default service URL; no new load balancer or VPC connector |
| Secrets | Secret Manager, pinned versions, same service account as CI |

## Free-tier budget

Request-based Cloud Run includes a monthly discount equivalent to 180,000 vCPU-seconds, 360,000 GiB-seconds, and 2 million requests at Tier 1 prices. Taiwan is Tier 1 and uses the baseline free-tier prices. Jakarta (`asia-southeast2`) is Tier 2. Usage is aggregated across projects by billing account, and billing must be enabled.

At Tier 1 prices, 1 vCPU and 1 GiB have roughly 50 billable instance-hours before exhausting the CPU allowance. Request duration, concurrency, startup/shutdown overhead, and other services on the account determine actual usage. Request count alone cannot establish a zero bill.

A one-instance maximum limits routine scaling but is not a spending cap and can be exceeded briefly. Budget alerts notify; they do not stop billing. Start with a project-scoped small budget, such as USD 5 monthly, with actual and forecast alerts, and review billed usage after representative staging activity.

Track these costs separately:

- Artifact Registry image storage, including retained images. Compare compressed image size with its allowance and configure a reviewed cleanup policy. A single large image can exceed the free allowance.
- GitHub Actions build minutes and any GitHub storage use have their own allowance and billing. The workflow does not use Cloud Build, a remote Docker builder, or registry build caches.
- Internet data transfer, especially PDFs, images, and uploads. Cloud Run's documented 1 GiB outbound allowance is within North America; do not assume delivery to Indonesian testers is free. Retain direct R2 delivery where the application already supports it.
- Logging volume, Secret Manager, and existing Turso, R2, Deno, Inngest, Gemini, email, and other provider usage.

Avoid keep-alive pings, warm minimum instances, Cloud SQL, and unnecessary new networking infrastructure. Configure a reviewed Artifact Registry cleanup policy through the repository's Cleanup policies tab. Start in dry-run mode, retain the deployed image and a rollback revision, and review matches before enabling deletion. Do not delete an image still needed by a service or rollback plan.

## Existing GitHub Actions workflow

`.github/workflows/deploy-web.yml` has two branch-restricted jobs:

- `main`: the existing Vercel prebuilt production deployment.
- `staging`: install with Bun 1.3.14, run the existing complete build with `NEXT_OUTPUT=standalone`, package the result, test native dependencies and static HTTP serving locally, then push a commit-tagged image to `asia-east1-docker.pkg.dev/zyx-academy/zyx-staging/zyx-academy`.

The staging job authenticates with the service-account JSON stored in GitHub Environment Secret `GCP_SERVICE_ACCOUNT_KEY`. Google credential files are created only after image building and testing. The workflow does not request GitHub OIDC token permissions. After pushing the image, `.github/scripts/deploy-cloud-run.sh` inspects the configured staging service, deploys the exact digest without traffic, checks that the new ready revision uses that digest, then directs 100 percent of staging traffic to it. The workflow summary records the image, revision, URL, and previous traffic for rollback.

The deployment targets only `zyx-academy/asia-east1/zyx-academy`. It synchronizes allowlisted runtime values from GitHub staging, retains unmanaged variables and unreplaced Secret Manager references, and preserves invocation IAM. It reapplies the cost settings in the table above and the same account identified by the CI JSON key. A missing service, missing required runtime settings, explicit non-staging marker, or non-staging database/origin blocks deployment. Missing staging markers and old runtime origins are repaired using the staging build origin. A failed or mismatched revision does not trigger a traffic switch. The existing Deno deployment workflow is separate. No Cloud Build trigger is created.

The image runs as an unprivileged Node 24 user and uses the traced server, static assets and public files. The Docker build context is allowlisted by `Dockerfile.cloud-run.dockerignore`. Root `.env` files, keys, local databases and generated Google credentials do not enter the image. Chromium is not downloaded; deployed browser work stays on the existing external providers. Only the isolated Next build process skips server environment validation. Sitemap generation requires the existing staging Turso URL/token as process environment values; the workflow checks the exact staging database hostname before building. These credentials are not image build arguments, copied environment files, or image environment settings. Prefer a read-only token for the build. The final image leaves runtime validation enabled.

## Neon staging integration

The migration branch uses PostgreSQL for both the build and runtime. Before deployment, configure and independently verify GitHub staging variables `NEON_EXPECTED_HOST`, `NEON_EXPECTED_STORAGE_ENDPOINT`, and `NEON_EXPECTED_STORAGE_BUCKET` against the final branch recorded in the migration runbook. Set `DATABASE_URL` to that branch's PostgreSQL connection with `sslmode=verify-full` and `STORAGE_PROVIDER_MODE=neon`, with `NEON_STORAGE_BUCKET`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` scoped to its private bucket. Connection parameters cannot override the pinned host, database, port or TLS policy. The web and Deno workflows reject mismatched targets before external deployment mutation; worker releases accept only `main` or `staging`. Preserve existing authentication, compute, browser, Inngest and feature settings.

The earlier Turso build instructions below describe the currently serving artifact and its rollback requirements. The Neon staging cutover is still gated by the [migration runbook](neon-migration.md), including a final write freeze and source reconciliation. Do not change the production environment, reuse the rehearsal database, or restore a Turso URL into PostgreSQL-only code. Preserve the previous immutable image, runtime environment and worker configuration together for rollback.

## One-time Console setup for CI/CD

These steps can be done through Google Cloud Console and GitHub Settings. No Cloud Shell commands are required.

### Google Cloud

1. Select project `zyx-academy`. In APIs & Services, enable Artifact Registry, Cloud Run, and Secret Manager. No Workload Identity provider, Security Token Service setup, or Cloud Build trigger is needed for this authentication method.
2. In IAM & Admin > Service Accounts, select the single existing service account whose key is stored in GitHub. The same account is used by CI and as the Cloud Run service identity. No second service account is required; the workflow reads its email from the JSON key.
3. In IAM & Admin > IAM for project `zyx-academy`, grant that account **Artifact Registry Writer**, **Cloud Run Developer**, and **Service Account User**. Project-level Artifact Registry Writer already covers repositories in this project, including `zyx-staging`; do not repeat that grant at the repository. Service Account User provides the `actAs` permission needed to select this same account as the Cloud Run identity. If runtime settings use Secret Manager references, the same account also needs **Secret Manager Secret Accessor** for those staging secrets. Existing project-level grants apply to resources beneath the project; avoid duplicate grants. Editor and Owner are not needed.
4. Open the CI service account > Keys > Add key > Create new key > JSON, then click Create. This downloads the JSON key. Store its complete contents directly in the GitHub Environment Secret below, including braces and the `private_key` field. Do not base64-encode it, commit it, or paste it into chat. If the organization blocks key creation, use the organization's approved credential process rather than changing organization policy as part of this setup.
5. When replacing a key, update the GitHub Secret and verify a successful workflow run before disabling the old key in the service account's Keys tab.

### GitHub

Open repository `soezyxstt/zyxacademy` > Settings > Environments > `staging`. Restrict deployment branches to `staging` and retain any existing reviewer rules. Add this **Environment Secret**:

| Secret | Value |
| --- | --- |
| `GCP_SERVICE_ACCOUNT_KEY` | Complete JSON content downloaded from the CI service account |

Then configure the public origin as an **Environment Variable**:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Exact intended staging origin, for example `https://staging.zyxacademy.com` when retaining that hostname |

Configure the existing staging Turso URL under `TURSO_DATABASE_URL`, `TURSO_CONNECTION_URL`, or `DATABASE_URL`, plus `TURSO_AUTH_TOKEN`, as GitHub Environment Secrets. Also provide `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `GEMINI_API_KEY`, and `INNGEST_EVENT_KEY` there if they are not already configured on the service. Existing server integration values, including R2, Vectorize, Firebase, Steel, and Google Workspace settings, are copied when present under the allowlisted application variable names. GitHub Variables take precedence over matching Secrets when nonempty. Existing public feature-flag values are copied as configured; no new feature flag is introduced. The build reads published blog metadata for the sitemap. The runtime token must support the app's normal staging operations; a read-only build token alone is insufficient for application writes. No migration or database mutation command runs during deployment. A missing token or a database hostname different from the existing staging host blocks the build.

The workflow accepts existing `NEXT_PUBLIC_*` GitHub Environment Secrets when a matching Variable is absent. Mirror the current staging public Firebase, realtime, analytics, brand and other browser configuration under the explicit names listed in the staging build step. Do not copy backend secrets into public settings. Optional empty public settings are unset during the build so existing app defaults apply.

Keep `AUTHORING_VERIFICATION_BROWSER_PROVIDER` and, for Steel, `AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION` aligned with the existing staging worker. An absent provider uses the current application default, `cloudflare`. Preserve the existing public feature-flag value and its matching runtime flag; this migration does not choose new feature-flag states.

After merging the prepared change into `staging`, each push builds, tests, publishes, and deploys the new image automatically. A manual run must also select branch `staging`. The account identified by the JSON key needs both image-publication and staging-deployment permissions. `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_BUILD_SERVICE_ACCOUNT` are no longer read by the workflow.

The service identity and invocation policy need one-time bootstrap configuration. Runtime application values are synced automatically from GitHub during CI deployment. If the service does not exist yet, the first run can publish its image, then fail at service inspection. Use that run's image digest in the one-time Console creation below, grant the service-level CI permissions, and rerun the workflow. Subsequent pushes need no Console image selection or manual deployment.

Production still uses the existing `production` GitHub Environment and Vercel configuration. The old staging Vercel deployment remains available, but this workflow stops updating it once the change reaches `staging`.

## Setup sequence

1. Inspect the project's billing association, existing Cloud Run services, repositories, service accounts, budgets, and secrets read-only before creating or updating resources. Google Cloud authentication is not configured in the current managed workspace.
2. Complete the CI/CD setup above using the single account from the JSON key. Configure its project roles in IAM & Admin > IAM. If preserving existing Secret Manager references, grant it access to those secrets. GitHub-to-runtime environment sync does not require a new Secret Manager setup. Give the human performing initial service creation the necessary creation and service-account-use permissions as well.
3. Run the existing GitHub Actions workflow for `staging`; it publishes and deploys the tested image digest automatically after one-time bootstrap. The complete build includes authoring skills and the V4 runtime fingerprint. `Dockerfile.cloud-run` copies the standalone output, `public`, and `.next/static`. Build in GitHub Actions, not at startup inside the 1 GiB web container.
4. Exclude `.env*`, local databases, backups, credentials, Git metadata, and local artifacts from the build context. Do not copy staging or production credentials into image layers or build arguments. Use secret mounts if the build genuinely requires credentials. Inspect the resulting image for accidental sensitive files.
5. Choose the staging origin before the final build. Next.js embeds `NEXT_PUBLIC_*` at build time. Keep the existing staging hostname if that is the cutover target. To use the generated `run.app` URL instead, obtain it from an initial private deployment, then update GitHub `NEXT_PUBLIC_APP_URL`, rebuild and redeploy before testing login. Runtime environment updates alone cannot generally change public build values.
6. Configure the application's required settings in GitHub Environment `staging`. CI sets `NODE_ENV=production`, `ZYX_ENVIRONMENT=staging`, matching auth/public origins, and all three Turso URL aliases. It removes `SKIP_ENV_VALIDATION` and excludes CI-only credentials. The runtime token and configuration must point to staging. Optional existing feature flags are synchronized only when supplied; absent values retain the existing service setting or app default.
7. Existing Secret Manager references may remain for settings not supplied by GitHub. The synchronized GitHub application secrets are stored as runtime environment values in Cloud Run, visible to identities authorized to read that service configuration; they are not Docker layers. Deploy privately for initial verification. IAM-private Cloud Run requires Google invocation authentication in addition to the app login. Browser login, external webhooks, and MCP clients need a deliberate access policy. Before public invocation, verify application authentication and webhook signature checks.
8. Review Better Auth base URL and trusted-origin behavior in `lib/auth.ts`; configure the exact Google OAuth callback. Check hard-coded staging-origin assumptions, MCP OAuth discovery and redirects, streaming, R2 CORS and signed URLs. Test the new origin before DNS cutover.
9. Migrate or retain the daily `/api/cron/analytics` invocation deliberately. Cloud Run does not execute `vercel.json` crons. Inspect route authentication, account for replacement scheduler costs, and avoid duplicate executions. Retain the existing staging Deno/Inngest registration for background work.
10. Verify login, protected routes, uploads/downloads, jobs, and relevant MCP flows. Measure cold starts, peak memory, request duration, failures, and billing under representative traffic. Keep rollback available before replacing the previous staging deployment.

## One-time service bootstrap through Console

1. Open Cloud Run > Deploy container / Create service and select **Deploy one revision from an existing container image**. Do not select continuous source deployment or Cloud Build.
2. Select the image digest from the workflow summary, service `zyx-academy`, region Taiwan (`asia-east1`), request-based billing, minimum 0 and maximum 1 at service level.
3. Under the container settings, set 1 vCPU, 1 GiB memory, port 8080, concurrency 8 and timeout 300 seconds. Under Security, select the same service account whose JSON key is stored in GitHub. That account also needs Secret Manager Secret Accessor on the staging secrets referenced by the service.
4. Runtime variables need not be entered manually. Configure them in GitHub staging as above, then let CI deploy the configured revision. A manually deployed image without those values can fail by trying to use local `dev.db`; the next CI deployment now repairs this by setting the verified remote Turso URL and token before switching traffic.
5. Require authentication for the initial deployment. Test and deliberately choose invocation access for browser/OAuth/webhook/MCP use before cutover, as described above. The workflow preserves the invocation policy configured here; it does not change public access.
6. Deploy the initial service. The account's existing project-level Cloud Run Developer and Service Account User grants cover this service; no duplicate service-level grants are needed.
7. Rerun the staging workflow. Verify its Cloud Run deployment step and revision/traffic summary. All later staging pushes run this deployment automatically.
8. Perform the runtime checks above before moving DNS or removing the old service. For a failed release, use Cloud Run > service > Revisions > Manage traffic to restore the previous ready revision from the CI summary. Keep the previous image available for rollback.

## Optional deployment command template

Use after preparing a tested image, runtime service account, runtime variables, and secret references. This command alone does not configure a working Zyx deployment. It starts private and grants no public invocation access.

```bash
gcloud run deploy zyx-academy \
  --project=zyx-academy \
  --region=asia-east1 \
  --image=asia-east1-docker.pkg.dev/zyx-academy/zyx-staging/zyx-academy:IMAGE_TAG \
  --service-account=SERVICE_ACCOUNT_EMAIL_FROM_JSON_KEY \
  --cpu=1 \
  --memory=1Gi \
  --cpu-throttling \
  --min=0 \
  --max=1 \
  --concurrency=8 \
  --timeout=300 \
  --port=8080 \
  --no-allow-unauthenticated
```

Use service-level `--max`, rather than relying solely on revision-level `--max-instances`. If updating an existing service, inspect existing IAM bindings separately; the template is not proof that prior public access was removed.

## Local validation on 2026-10-25

The subsequent run deployed the environment-configured revision and Google Cloud completed traffic routing, but CI's final report expected a Service object from `update-traffic`, whose JSON output was a list. Final verification now queries the actual Service after the traffic operation instead. The mocked CLI returns the same list shape as the observed command, and all 12 tests pass. Application login and end-user HTTP behavior remain separate from this deployment evidence.

The first runtime-sync deployment reached the existing `zyx-academy` service and Google Cloud reported revision creation succeeded. CI then stopped before traffic promotion because the service-level latest-ready check did not match the newly created revision. The corrected deployment reads the new revision name from a fresh service query and verifies that revision's own Ready condition and image digest. Regression fixtures leave the service's previous ready revision unchanged and require the actual new revision to be ready before traffic moves.

The runtime environment sync follow-up passes 12 local tests covering repair of an unconfigured manual deployment, database alias precedence, missing mandatory values, rejection of production targets, lossless multiline credentials, CI-key exclusion, existing Secret Manager references, feature-flag preservation, traffic ordering, and temporary-file cleanup. Workflow syntax and whitespace checks pass. GitHub Secret metadata could not be listed due to the integration's 403 response; no secret values were fetched. Remote deployment verification remains separate.

- Updated the working branch from remote `staging` by fast-forward to `101e00b3`, preserving the deployment documentation draft and resolving its documentation-index overlap.
- Installed the locked dependencies in an isolated checkout with Bun 1.3.14. Built the complete standalone application with Node 24, the locked staging authoring skills, the V4 runtime preparation, and only staging database credentials plus synthetic/public build configuration. Verified the exact staging database hostname and performed a read-only published-blog query before building. The initial build without database credentials failed on sitemap prerendering; the final pipeline includes the required staging connection.
- Packaged `zyx-cloud-run-staging:local-validation` successfully. The Docker context transferred about 350 MB before registry compression; this is not a measured Artifact Registry storage bill.
- `bash .github/scripts/smoke-cloud-run.sh zyx-cloud-run-staging:local-validation` exited 0. It verified non-root execution, native canvas, PDF standard fonts, KaTeX fonts, the authoring skills catalog, and HTTP static serving on port 8080 with a 1 GiB memory limit and dummy runtime credentials. The temporary smoke container was removed.
- Scanned the standalone/static/public runtime output for the staging database token without printing it; no match was found. The build environment is not copied into Docker image environment settings.
- `actionlint` 1.7.7, `bash -n`, and `git diff --check` pass. Checked that the production job's steps and environment configuration are unchanged, and that staging build target validation accepts the existing staging database and rejects a different host or missing token.
- One service account is used for CI and runtime at the user's request; its email is derived from the JSON key and passed to deployment. Project-level roles cover the corresponding project resources without duplicate repository grants.
- JSON-key authentication replaces OIDC at the user's request. The workflow checks the key type/project without printing it, and credential files are generated after packaging. Authentication against Google Cloud has not been exercised.
- The automatic deployment script passes 6 local mocked-gcloud tests, including refusal of wrong targets, missing services, production markers, and origin mismatches; deployment failure/unready/wrong-image cases never switch traffic. Production workflow steps and environment configuration are unchanged. Existing staging-guard tests pass: 8 tests, 0 failures. No remote database mutation, image push, Google IAM update, Cloud Run deployment, DNS change, OAuth test, or representative SSR load test was performed. The static-serving smoke check does not establish total peak memory under real use.

## References

- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Request-based billing](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
- [Service-level instance limits](https://docs.cloud.google.com/run/docs/configuring/max-instances)
- [Container runtime contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing)
- [Cloud Build pricing](https://cloud.google.com/build/pricing)
- [Budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)
- [Create service account keys](https://docs.cloud.google.com/iam/docs/keys-create-delete)
