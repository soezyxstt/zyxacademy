# Cloud Run web compatibility

The candidate packages the staging Next.js application in a Linux AMD64, Debian glibc image. Bun installs the frozen lockfile and runs the full authoring skills, V4 fingerprint, and Next production pipeline. The runtime uses Node 24 as an unprivileged user. Next's standalone output carries its traced dependencies and application artifacts, with the generated static directory and the repository's public directory copied separately.

## Build and runtime audit

| Area | Implementation and verification still needed |
| --- | --- |
| Build and SSR | Next.js 16.3 conditional standalone behavior remains available. The Cloud Run build defers the database-backed sitemap to request time. Production and Vercel keep the existing revalidation interval. The Docker build uses a loopback-only placeholder PostgreSQL URL, never staging credentials. The authoring skills lock and Next Google font downloads still require build network access. |
| Server actions and routing | The loopback server receives the exact canonical HTTPS Host and protocol from the origin gateway. The packaging step guards the Next.js 16.3 generated launcher marker before enabling its internal trusted-host setting. Retest the launcher, localized routes, protected redirects, and server action Origin checks when upgrading Next. The CI build ID distinguishes repeated builds of the same SHA for Next version-skew checks. |
| Native canvas and sharp | The same glibc architecture builds and runs the application. Linux x64 receives the lockfile-selected native libraries. Fontconfig and Liberation fonts provide system fallback. Image sanitizers and the existing Next optimizer remain in the Node runtime. The packaged smoke check draws PNG and encodes WebP. |
| PDF | `pdf-parse` and `pdfjs-dist` use external native dependencies, package-relative workers, CMaps, fonts, and WASM assets. The image includes the worker files and assets explicitly. The smoke uses the checked-in public sample for a first-page raster and imports the pinned PDF.js module. Diktat rendering and durable computation still use the existing external services. |
| Browser execution | Production-mode coding uses remote Cloudflare Browser Run or Steel. V4 authoring fingerprint and runtime must agree with the matching worker's browser identity. Only local tooling calls Puppeteer directly. Playwright's remote client and metadata remain usable with no Chromium installation in the image. Validate an actual coding submit and remote authoring session separately. |
| Pyodide | The existing exact revision routes continue to serve browser runtime files. The smoke checks the packaged WASM signature and downloads the versioned lockfile over HTTP. Run a Python learner session over the final candidate origin. |
| V4 runtime data | Existing output tracing retains source inputs required by runtime verification and fingerprints. Retain those includes. The generated authoring skill catalog and KaTeX fonts are checked inside the runtime image. Recheck V4 reader and verification against the same commit deployed to staging Neon Functions. |
| Database and storage | `pg.Pool` is per process. Use the verified staging pooled endpoint and private Neon storage settings at runtime. Application storage routes retain their own authorization. Record pool contention and cross-region latency under the proposed concurrency of eight. |
| Authentication | Keep public build URL, runtime auth URL, Worker origin, and Google callback aligned for each hostname. The local smoke checks the unauthenticated session endpoint and private asset denials through the gateway. OAuth, session renewal, origin checks, roles, enrollment, uploads, and signed downloads need synthetic account acceptance on the candidate. |
| Streaming and jobs | The gateway forwards streaming bodies and responses. Zyra and authoring routes retain their existing external service calls and durable jobs. Request-based CPU can throttle work scheduled through Next `after()`, including discussion title generation and Vectorize sync. Rehearse these operations before promotion. Retain the staging Inngest registration and measure live stream first-byte and cancellation behavior. |
| Vercel integrations | Vercel Analytics, Speed Insights and Vercel log drains depend on Vercel infrastructure. Sentry DSN and PostHog browser settings remain build configuration. Optional Sentry source-map publication uses a BuildKit secret mount. `vercel.json` cron schedules do not carry over. Inventory cron callers before enabling any replacement or moving a staging domain. |

The container filesystem is writable and ephemeral. The Next optimizer's disk cache is limited to 64 MiB, counts toward container memory, and survives only for that instance. Next's application data and render caches remain local with the current single-instance design. Shared cache coordination and asset retention across revisions need review before scaling out. Until then, avoid serving multiple revisions concurrently and use cached immutable assets with rollback retention. Raster assets used in paid courses and attachments keep their authorized delivery endpoints. For frequently requested public images, prefer variants generated once and stored at versioned R2 paths. The existing optimizer still serves public local and allowed remote sources.

## Evidence and reproducibility

```bash
docker build --platform linux/amd64 -f Dockerfile.cloud-run \
  --build-arg "SOURCE_REVISION=$(git rev-parse HEAD)" \
  --build-arg "CLOUD_RUN_BUILD_ID=$(git rev-parse --short HEAD)-$(date +%s)" \
  --secret id=public_config,src=/outside/build-context/cloud-run-public.json \
  -t zyx-cloud-run-staging:local .
bash .github/scripts/smoke-cloud-run.sh zyx-cloud-run-staging:local
docker image inspect --format '{{.Size}}' zyx-cloud-run-staging:local
```

Use a JSON object of public staging settings. Supply `NEXT_PUBLIC_APP_URL` as the staging HTTPS origin, with no trailing slash. Use the workflow's allowlist for optional settings. Give each new build a unique build ID so builds with a changed public configuration avoid reuse of the previous BuildKit secret-dependent layer.

The smoke checks local HTTP startup under one CPU and 1 GiB, captures first response time and a warm memory sample, verifies denials without an origin token, then exercises landing, localized SSR, protected redirects, a no-session API, private-path denials, static chunks, image optimization, the public sample PDF, coding assets, and graceful shutdown. The synthetic configuration contains no staging database credentials or service keys. Its results do not cover actual staging data, OAuth, external services, CDN latency, or Cloud Run cold starts.

Container build, image size, and startup measurements are pending CI. Before promotion, record representative cold and warm p50/p95, peak memory, out-of-memory events, request concurrency, Neon round trips, streaming first byte, and static/cache transfer against Vercel staging. Include the same landing, Article V4, Diktat, Quiz, Zyra, and Python workloads in both measurements. Compare Bangkok and Taiwan only if observed database latency warrants it.

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js standalone and output file tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Cloud Run container runtime contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Cloud Run billing and CPU allocation](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
