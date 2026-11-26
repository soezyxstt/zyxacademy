# Cloud Run Staging

Status: `ACTIVE` staging candidate workflow. Vercel remains available via the [manual Vercel staging runbook](vercel-staging.md).

## Target and Request Flow

The container image (`Dockerfile.cloud-run`) packages the Next.js 16.3 standalone build on Linux AMD64 (Debian glibc): Bun installs the frozen lockfile and runs `build:authoring-skills`, V4 fingerprinting, and `next build`, while the runtime serves under Node 24 as an unprivileged user with `.next/static` and `public/` copied separately.

| Setting | Candidate |
|---|---|
| Project | `zyx-academy` |
| Region | Bangkok, `asia-southeast3`, Tier 1 |
| Service | `zyx-academy-staging-web` |
| Platform | Linux amd64, second generation |
| Runtime | 1 vCPU, 1 GiB, 8080, 300-second request timeout |
| Scaling | Minimum 0, service maximum 1, concurrency 8 |
| Billing | Request-based with CPU throttling |
| Data | Existing pinned staging Neon PostgreSQL and private Neon Storage |
| Background | Existing staging Neon Functions and Inngest. Follow the matching-worker release gate. |

The Cloudflare Worker forwards dynamic requests to the Google service URL. The Cloud Run gateway rejects traffic without the shared origin credential before forwarding it to Next.js. Treat that credential as a bearer secret. Direct traffic can still reach the gateway and incur Cloud Run requests, so monitor rejected traffic. Configure separate Worker and Google secrets with the same value and coordinate their rotation. Keep origin credentials out of shell history, request logs and PRs. Use TLS across both hops.

The edge caches only eligible anonymous immutable `/_next/static/*` responses with no query or a single deployment ID query. Requests carrying session cookies bypass the shared cache. Everything else goes to the originating handler with shared caching disabled, including API, storage proxy, server actions, session traffic, RSC, telemetry, and `/_next/image`. Next.js retains local image optimization and its ephemeral per-instance cache. Authorized course and review images use direct browser requests so their access checks are applied on every request. Prefer an existing good-sized WebP or AVIF derivative for newly reviewed public photographs. Measure the first optimizer request and repeats before considering paid edge transforms or generating variants on upload. Static cache misses reach Cloud Run. Keep both Cloud Run revisions and their immutable images. An open page from a previous release may need to reload if a chunk is absent from the new serving revision. Validate old-tab navigation during candidate testing before DNS acceptance.

Bangkok's native Cloud Run domain mapping is unavailable. An origin rule alone still needs the correct origin TLS hostname, trusted application host and the origin credential. The Worker supplies those without adding a Google load balancer. A Google external load balancer adds forwarding-rule and processing charges and is outside this candidate. [Cloud Run custom domains](https://cloud.google.com/run/docs/mapping-custom-domains) · [Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) · [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)

## Google and GitHub setup

### Runtime secret coverage

The `import-secrets` operation reads GitHub Environment `staging`. It imports the required application credentials, including `PYTHON_RUNTIME_TOKEN_SECRET`, `CF_AI_GATEWAY_URL`, `CF_AI_GATEWAY_TOKEN`, `ZYRA_CONTROL_PLANE_URL`, and `ZYRA_CONTROL_PLANE_TOKEN`, along with configured optional Google, Gemini fallback, Vectorize, Live Quiz, Steel, and analytics credentials. Companion server settings are versioned with those credentials. Empty optional settings are skipped. CI credentials, unused R2 rollback credentials, public build settings and feature flags are excluded. Existing staging Firebase credentials remain separately managed to preserve project isolation.

Provision each destination under `zyx-staging-web-`, grant the staging runtime access, then run the approved import. Imports print only secret names and numeric versions. Attach those numeric versions to a candidate before promotion; importing alone does not configure Cloud Run. Preserve existing bindings when repairing missing settings, use the currently serving image, verify the candidate and keep the prior revision available for rollback. Deployment validation requires the Python ticket key, Cloudflare AI Gateway settings (`CF_AI_GATEWAY_URL`, `CF_AI_GATEWAY_TOKEN`), and Zyra control-plane settings (`ZYRA_CONTROL_PLANE_URL`, `ZYRA_CONTROL_PLANE_TOKEN`). This repairs existing API and MCP environment configuration without changing tools, scopes, consent, capability discovery, playbooks or packaged skills.

### Staging push isolation

Staging Web and Android Nightly use Firebase project `zyx-academy-staging`. Production Web and Android Stable are configured as separate apps in the same project, with separate sender accounts. App registration separates client configuration, but Firebase messaging permissions and the sender ID remain shared at project scope. Keep `NEXT_PUBLIC_FIREBASE_*` aligned in `CLOUD_RUN_STAGING_PUBLIC_CONFIG` in both GitHub environments, `staging` and `staging-cloud-run`, and in the staging Cloud Run runtime. The browser worker imports `/firebase-config.js`, which exposes only public runtime Firebase settings with `Cache-Control: no-store`.

The staging sender is `zyx-staging-fcm-sender@zyx-academy-staging.iam.gserviceaccount.com`, with only `cloudmessaging.messages.create` on the staging Firebase project. Bind `FIREBASE_SERVICE_ACCOUNT_JSON` to a numeric version of Secret Manager secret `zyx-staging-web-firebase-service-account-json` in Google project `zyx-academy`. Its value is base64-encoded sender JSON. The Cloud Run staging runtime identity has access to this secret. Private keys belong in Secret Manager and restricted operator backups, never in Git or public configuration.

Build with `operation=candidate`; retain existing traffic until browser background delivery and Android Nightly registration and delivery have been checked. Firebase API acceptance alone does not prove device delivery.

Record the results of these read-only commands with an authenticated operator account. Share only sanitized metadata.

```bash
gcloud projects describe zyx-academy --format='value(projectId,projectNumber)'
gcloud billing projects describe zyx-academy
gcloud run services list --project=zyx-academy --region=asia-southeast3
gcloud run services list --project=zyx-academy --region=asia-east1
gcloud artifacts repositories list --project=zyx-academy --location=asia-southeast3
```

Have the billing owner verify available credits, expiry and eligible SKUs. Review incremental costs before enabling required APIs or creating resources. In IAM, create separate staging deploy and runtime identities. Scope Artifact Registry Writer to the candidate repository, Cloud Run Developer to the bootstrapped candidate service, and Service Account User on the runtime identity to the deploy identity. Give the runtime identity Secret Manager Secret Accessor on the specific staging secrets. Give the deploy identity access to the dedicated preflight secrets it reads. Grant the GitHub federated principal Workload Identity User on the deploy identity. Pin WIF to repository ID `1192540511`, owner ID `139353811`, staging ref and the exact workflow ref. Map `google.subject=assertion.sub` and `attribute.repository_id=assertion.repository_id`. Use this provider attribute condition:

```text
assertion.repository_id == '1192540511' &&
assertion.repository_owner_id == '139353811' &&
assertion.ref == 'refs/heads/staging' &&
assertion.workflow_ref == 'soezyxstt/zyxacademy/.github/workflows/deploy-cloud-run-staging.yml@refs/heads/staging'
```

Bind Workload Identity User on the CI identity to `principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/attribute.repository_id/1192540511`. Use explicit Secret Manager versions and dedicated staging-only resources. [GitHub federation setup](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)

Configure the `staging-cloud-run` GitHub environment with a deployment branch rule for `staging` and no required reviewers. Candidate, promote, and rollback run on manual dispatch. The `import-secrets` job uses the shared `staging` environment and still requires reviewer approval. GitHub registers manual dispatch from the workflow definition on `main`. Dispatch with `--ref staging`. [GitHub manual workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

Copy these variables from `staging` to `staging-cloud-run` before adopting the workflow change. Keep the workload identity provider variable in both environments for secret import.

| Variable | Value |
|---|---|
| `CLOUD_RUN_STAGING_WORKLOAD_IDENTITY_PROVIDER` | Full `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER` name |
| `CLOUD_RUN_STAGING_PUBLIC_CONFIG` | Flat JSON of allowed public build settings with exact `NEXT_PUBLIC_APP_URL` |
| `CLOUD_RUN_STAGING_PREFLIGHT_DATABASE_VERSION` | Numeric Secret Manager version of `zyx-staging-web-preflight-database-url` |

Re-enter the existing `SENTRY_AUTH_TOKEN` as an environment secret in `staging-cloud-run` to preserve source map uploads. If staging sets `QUEUE_PROVIDER` as an environment variable, configure the same value there. Verify the Workload Identity provider and deploy identity accept the OIDC subject for `staging-cloud-run` with the repository, ref, and workflow restrictions above intact.

Use deploy identity `zyx-staging-web-ci@zyx-academy.iam.gserviceaccount.com`, runtime identity `zyx-staging-web-runtime@zyx-academy.iam.gserviceaccount.com`, and a Standard Docker repository named `zyx-staging-web` in Bangkok. CI publishes unique commit-and-run tags and deploys immutable digests. Bootstrap only the new service with an approved harmless placeholder image. Configure its single container with the runtime identity, ingress `all`, a default URL, and the invoker IAM check disabled so the Worker can reach the application-layer gate. Validate that the placeholder exposes no staging application or data. Set the runtime environment and Secret Manager bindings on that service before dispatch. Reserve a controlled window for changing the service template.

Set `ZYX_ENVIRONMENT=staging`, `ZYX_MCP_ENVIRONMENT=staging`, `BETTER_AUTH_URL` to the exact build origin, `STORAGE_PROVIDER_MODE=neon`, `NEON_STORAGE_BUCKET=zyx-staging`, `AWS_REGION=ap-southeast-1`, `AWS_ENDPOINT_URL_S3` to the documented branch endpoint, and `INNGEST_ENV=staging-40f1da25`. Use the existing staging endpoints for `COMPUTE_SERVICE_URL` and `DIKTAT_RENDERER_URL`. Mirror the public JSON as plaintext runtime settings. Bind `DATABASE_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `GEMINI_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `COMPUTE_SERVICE_SECRET`, `DIKTAT_RENDERER_SECRET`, `CF_API_TOKEN` or `CF_BROWSER_API_TOKEN`, and `CLOUD_RUN_ORIGIN_TOKEN` to numeric versions of dedicated `zyx-staging-web-*` secrets. Set `CF_ACCOUNT_ID` for Browser Run. Use the staging application database role and a distinct read-only `zyx_staging_web_preflight` login with access to the migration journal and cutover marker. Scope the CI Secret Accessor grants to these two database URLs and the origin token. Consult the workflow's validator for the complete runtime allowlist.

### Import existing GitHub staging secrets

The `import-secrets` operation copies only the required staging credentials to dedicated Secret Manager destinations. It uses the same branch restriction and federated deploy identity as the release job, with required reviewer approval in the shared `staging` environment. It sends values through standard input and records only setting names and numeric versions. It performs no deployment. The staging database URL must use the pinned pooler and application role.

In Cloud Shell, prepare empty destinations and give CI temporary permission to add versions. This example expects new names. If any destination already exists, inspect its metadata and IAM before continuing.

```bash
(
  set -e
  project=zyx-academy
  staging_ci=zyx-staging-web-ci@zyx-academy.iam.gserviceaccount.com
  staging_runtime=zyx-staging-web-runtime@zyx-academy.iam.gserviceaccount.com
  for suffix in aws-access-key-id aws-secret-access-key better-auth-secret cf-api-token \
      compute-service-secret database-url diktat-renderer-secret gemini-api-key \
      google-client-id google-client-secret inngest-event-key inngest-signing-key resend-api-key; do
    secret="zyx-staging-web-$suffix"
    gcloud secrets create "$secret" --project="$project" --replication-policy=automatic
    gcloud secrets add-iam-policy-binding "$secret" --project="$project" \
      --member="serviceAccount:$staging_runtime" --role=roles/secretmanager.secretAccessor
    gcloud secrets add-iam-policy-binding "$secret" --project="$project" \
      --member="serviceAccount:$staging_ci" --role=roles/secretmanager.secretVersionAdder
  done
)
```

After the workflow is registered on the default branch and the import code is on `staging`, dispatch `gh workflow run deploy-cloud-run-staging.yml --ref staging -f operation=import-secrets`. Review and approve the resource-scoped transfer in GitHub. Record the listed versions. If the import stops partway, it reports the last successful version references. A retry can add versions to an already imported name. Only explicitly pinned versions are used by deployments. Remove the temporary CI Secret Version Adder binding on each destination once the transfer is complete. Keep CI Secret Accessor only on the exact runtime database URL, preflight database URL and origin token. The origin token and new read-only preflight credential are provisioned separately.

After registering the workflow and provisioning the target, dispatch the candidate from the exact accepted staging ref:

```bash
gh workflow run deploy-cloud-run-staging.yml --ref staging -f operation=candidate
gh workflow run deploy-cloud-run-staging.yml --ref staging -f operation=promote -f revision=REVISION
gh workflow run deploy-cloud-run-staging.yml --ref staging -f operation=rollback -f revision=PREVIOUS_REVISION
```

Use the tagged candidate URL as the temporary Worker origin for acceptance. Choose the exact revision for any traffic change. After promotion, move the Worker to the stable service origin and verify it. The first release has a placeholder behind the stable service URL and uses Vercel as its fallback. Validate the rollback on a later compatible two-revision pair before depending on it.

Mirror the public build values used by Vercel staging for Firebase, realtime, analytics and flags. Align the candidate HTTPS origin in the build URL, Better Auth URL and Worker config. Use the staging OAuth client and register its exact `/api/auth/callback/google` URI for the temporary and final origins as needed. Review compute, renderer, Vectorize, Zyra, Inngest, email, Sentry, PostHog and signed-download CORS settings against the eligible staging environment. Preserve existing application feature states. Never export an existing runtime secret through CI output.

## Data and release gates

Use the staging branch `br-gentle-scene-azq0gp91` in project `muddy-sky-44104897`, database `neondb`, the documented pinned pooled host, and private branch-scoped bucket `zyx-staging`. Follow [DATABASE.md](../DATABASE.md) and the [manual Vercel staging runbook](vercel-staging.md). Verify the migration journal read-only, then verify the matching staging worker. Deploying web code performs no migration, backfill, seed, worker restart, or scheduler registration. Cloud Run does not run Vercel cron definitions.

## Cloudflare and DNS

Cloudflare's connected account returned no `zyxacademy.com` zone. Public DNS returned Cloudflare nameservers `elliot.ns.cloudflare.com` and `lucy.ns.cloudflare.com`, and the staging CNAME currently resolves to `a5534c9d38d29398.vercel-dns-017.com`. Request access to the existing zone from its owner. Preserve authoritative nameservers. Export the active zone and verify production, staging, MX, SPF, DKIM, DMARC, CAA, verification and subdomain records before any approved cutover.

The repository Worker config disables automatic routes. Copy `workers/staging-web-edge/wrangler.jsonc` to `workers/staging-web-edge/wrangler.candidate.jsonc` and keep the copy local. Enable `workers_dev` only in that copy. Set `PUBLIC_ORIGIN` to `https://zyx-academy-staging-edge.<account-subdomain>.workers.dev` and `CLOUD_RUN_ORIGIN` to the exact tagged Cloud Run HTTPS URL. Deploy with the lockfile-pinned Wrangler and set the origin secret using its prompt:

```bash
bunx --no-install wrangler deploy --config workers/staging-web-edge/wrangler.candidate.jsonc
bunx --no-install wrangler secret put CLOUD_RUN_ORIGIN_TOKEN --config workers/staging-web-edge/wrangler.candidate.jsonc
node --test deploy/cloud-run/origin-gateway.test.mjs workers/staging-web-edge/index.test.mjs
```

Keep preview URLs disabled. The Worker reports Cache API outcomes in `X-Zyx-Edge-Cache`. Record `CF-Cache-Status` separately when present.

Cloudflare Access can disable Worker Cache API behavior. Verify production-like cache on the approved custom domain if the temporary endpoint or its access policy bypasses it. Use a temporary staging Worker endpoint first, with its exact HTTPS host consistently configured on Worker, Cloud Run and OAuth. For the approved final cutover, save the current staging record, then replace only that CNAME by attaching the Worker Custom Domain `staging.zyxacademy.com`. Cloudflare provisions the DNS record and TLS certificate. The dedicated R2 public bucket uses a separate custom domain, `cdn-staging.zyxacademy.com`. Verify both HTTPS endpoints and leave other DNS records alone. Cache Rules and final-host cookies, OAuth and external callbacks require a live hostname after setup.

### Public media

The dedicated `zyx-staging-public` bucket did not exist in the connected account. Create a Standard bucket after checking billing and approving the domain activation. Keep managed `r2.dev` access off. Publish the reviewed repository image with an account and API token restricted to that bucket:

```bash
node scripts/cloud-run/publish-public-media.mjs
node scripts/cloud-run/publish-public-media.mjs --publish
```

The first command validates the manifest and hashes locally. The second uploads only the listed repository file with its immutable content-derived key. Attach the R2 custom domain and verify the exact key, content type, immutable response header and cache behavior before setting `NEXT_PUBLIC_STAGING_MEDIA_ORIGIN=https://cdn-staging.zyxacademy.com` for the candidate build. An unset value keeps the bundled image URL. Replacements use a new checksum. Retain reviewed old versions through rollback. For a takedown, delete the exact object and purge the exact Cloudflare URL. A previously downloaded immutable file can remain in browser caches through its advertised TTL. [R2 public domains](https://developers.cloudflare.com/r2/buckets/public-buckets/) · [Cloudflare purge](https://developers.cloudflare.com/cache/how-to/purge-cache/)

| Material | Treatment |
|---|---|
| Reviewed brand cover in the manifest | Public and immutable |
| Course, Diktat, article, video and interactive-document assets | Existing enrollment and entitlement paths, including protected downloads and signed access |
| Quiz, exam, schedule and Zyra user attachments | Existing user, tutor, course and administrative checks |
| Form and question images | Existing reference- and route-specific access. Require individual review for publication. |
| Product bundles, source packs, source images, renderer and temporary outputs | Keep private |
| Existing media library or legacy URLs | Preserve existing paths and audit individual keys before any publication |

The connected account reported managed public endpoints enabled for the legacy `zyx` and `zyx-staging` buckets, disabled for both `zyx-zyra-private-*` buckets. The staging legacy list returned three unclassified screenshots. Treat the inventory as partial, keep their URLs out of the candidate configuration, and review direct legacy access with the storage owner. Preserve existing Neon access policies, signed URLs and database values.

## Acceptance and operations

Run the candidate build and native smoke in CI. Record compressed image bytes from Artifact Registry, startup elapsed time and native dependency results. After tagged revision readiness, check the direct URL with no credential and with a spoofed forwarded host. Both must fail. Check candidate landing, auth endpoints, static CSS and JS, 404 and protected files before promotion. Use one active operator and isolated test identities for writes.

Run browser checks for Google sign-in, OAuth state, sign-out, session cookies and CSRF, student and tutor roles, dashboard, Article V4, Diktat, quiz submission and grading, Zyra SSE, coding runtime, authorized uploads, image optimization and signed downloads. Verify an anonymous client and a non-enrolled student cannot read protected Diktat, that one student cannot access another's attachment, and that restricted objects are absent from the public R2 bucket. Compare two synthetic users using the same cache location. Check range requests and reconnect behavior for media and SSE.

For public asset checks, record HTTP status, `Cache-Control`, `CF-Cache-Status` or Worker edge cache status, response bytes, and cold-miss then repeated-hit timings from one edge location. Record browser disk-cache behavior, test replacement keys and rollback, and compare Cloud Run origin request counts with caching enabled. Measure cold and warm p50 and p95, CPU, memory, image-heavy requests and concurrency 1 and 8. Include database-backed pages and provider calls. Retry in Taiwan only if measured network and database timings indicate a practical improvement. On November 19, five unauthenticated Vercel landing samples from the workspace returned 200 with 668,782 bytes each. Observed TTFB p50 was 0.577 s and nearest-rank p95 was 0.747 s. The sample is a connectivity baseline. No paired Cloud Run results are available.

Use Cloud Monitoring for request volume, request latency, error rates, instance count, startup latency, billable time, CPU and memory, and sent bytes. Compare against Worker invocations, cache hits and origin misses. Preserve Sentry and PostHog, review any Vercel-only log drains, and sample verbose runtime logs. Investigate restarts, timeouts or sustained memory pressure before raising concurrency or capacity. Google documents a 32 MiB HTTP/1 request limit. Validate actual upload boundaries through Worker and Cloud Run, and use existing signed uploads for larger payloads. [Container runtime contract](https://cloud.google.com/run/docs/container-contract)

## Cost scenarios

Planning estimates in USD per month, before free credits or shared allowances. They use Tier 1 CPU and RAM at about $0.0000265 combined per billable second and $0.40 per million origin requests. Billable seconds include startups and overlapping requests count as one busy instance. Egress uses a planning assumption of $0.15/GiB, which depends on destination. Registry assumes $0.10/GB-month. These are usage assumptions and exclude existing Neon, AI and external integration bills.

| Monthly usage | Low | Medium | Higher |
|---|---:|---:|---:|
| Origin requests | 20,000 | 200,000 | 1,000,000 |
| Busy instance seconds | 10,000 | 100,000 | 500,000 |
| Cloud Run egress GiB | 2 | 20 | 100 |
| Stored image GB | 2 | 4 | 8 |
| Cloud Run compute, requests and egress | $0.57 | $5.73 | $28.65 |
| Registry storage | $0.20 | $0.40 | $0.80 |
| Worker allowance or paid minimum | $0 | $0 to $5 | $5+ |
| Secret Manager, assuming 15 active versions within access allowance | about $0.54 | about $0.54 | about $0.54 |
| Approximate subtotal | $1.31 | $6.67 to $11.67 | $34.99+ |

Public R2 assumes below 10 GB-month, one million writes and ten million reads, within the account's Standard allowance. Above it, Standard storage is $0.015/GB-month, writes $4.50 per million and reads $0.36 per million, with free direct R2 transfer. Worker Free also has a daily request ceiling and per-invocation CPU limit. Above the paid plan allowance, budget additional Worker request and CPU charges. Set image transformations and load balancing to $0 in the plan. Builds use GitHub-hosted standard runners on the public repository. Check the repository's Actions billing and retention for any runner changes, and avoid Cloud Build. Treat Logging as $0 only while within the project allowance and retention policy. Review actual costs and credit eligibility in billing before provisioning. Configure project budget alerts at $5 and $10 where approved. Alerts send notifications. The one-instance maximum limits regular scaling and charges can continue above the budget. [Cloud Run pricing](https://cloud.google.com/run/pricing) · [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing) · [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/) · [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing) · [Cloud Observability pricing](https://cloud.google.com/stackdriver/pricing) · [Budget alerts](https://cloud.google.com/billing/docs/how-to/budgets)

## Rollback

Record the exact previous ready revision, image digest, Worker deployment version and DNS record alongside each promotion. Roll back through the isolated staging workflow to the previous verified compatible revision. Verify the service reports the intended traffic assignment and retest static assets, auth and a private-file denial. Keep both images and both public media versions through the rollback period. Review Artifact Registry cleanup in dry-run and protect every currently serving or rollback digest.

If the edge configuration causes a failure, restore the recorded Worker version and secret pairing. Purge exact affected public cache URLs where needed. If the staging domain needs to return to Vercel, verify the previous Vercel deployment is compatible with the current data and worker version, detach only the staging Worker Custom Domain, restore the captured staging CNAME and test TLS, OAuth and core operations. Use the existing manual Vercel workflow to deploy matching staging code if needed. Database recovery is a separate, approved data operation under the Neon runbook.
