# Navigation performance validation

Status: `OPEN / IN PROGRESS`  
Date: 2026-11-06

This is local candidate evidence reported by the parent agent. It does not establish deployment or causal improvement. The original 40-run baseline was invalid; only original R3 and R5 smoke at N=2 was valid.

## Selected measurements

Use `artifacts/performance/verified-{desktop,mobile}/baseline-summary.json` for R1, R2, and R4, and `artifacts/performance/paced-{desktop,mobile}/baseline-summary.json` for R3 and R5. Each selected route and viewport has 40 valid warm, zero failed, and three valid browser-context cold observations. The total is 400 warm and 30 browser-context cold observations. Cold here does not mean a cold container or database.

| Primary p95, ms | R1 | R2 | R3 | R4 | R5 |
|---|---:|---:|---:|---:|---:|
| Desktop | 493.5 | 399 | 392.6 | 427.3 | 407.3 |
| Mobile | 491.6 | 298.1 | 377.6 | 408.3 | 392.1 |

Primary gates passed locally. The shell R1 desktop p95 of 460.8 ms exceeds its 200 ms gate. Long task p95 is 114 ms for R1 and 95 ms for R2, both above 50 ms. These gates remain unresolved.

The previous fast R3/R5 runs had 7 or 8 HTTP 429 failures at `get-session` because the lab ran too quickly. Do not merge them into selected statistics. The paced runs wait two seconds before navigating to the source; that wait is outside click timing. Router prefetch is classified separately. Route interception disables HTTP cache, so these results are not field or RUM data. An ignored local preload stub handles `/_vercel/**/script.js`; analytics delivery was not verified.

R6 lacks a fixture or link, R7 has only one category, and R8 is a legacy redirect and is inapplicable. There is no 5,000-question benchmark, complete pool telemetry, server RSC span, or actual Cloud Run measurement.

## Supporting evidence

- WP4 material and assessment batching is integrated. PGlite coverage has four tests and 56 assertions, with query counts 22 versus 43, 24 versus 47, and 16 versus 40. The separate five-course next-concept proof records 3 versus 15 SELECTs.
- Recommendation cache has five tests: insertion is best effort with sanitized errors; read and compute failures propagate.
- Ignored CPU profiles `artifacts/performance/profile-dashboard.json` and `artifacts/performance/profile-admin.json` contain minified Radix, Next layout, and NProgress frames. Bundle inspection identified `i.set` forcing `offsetWidth`. This is evidence for investigation, not proof of an exclusive cause or a basis for a blind fix.
- `artifacts/performance/capacity/local.json` records 24 successful requests at concurrency 1, 4, and 8, with peak 610275328 bytes, approximately 582 MiB. This is local, not Cloud Run; `gcloud` was unavailable.
- `bun run typecheck` passed; `bun run lint` had zero errors and 22 pre-existing warnings outside the changes. Logs: `artifacts/performance/final-typecheck.log` and `artifacts/performance/integrated-lint.log`. `bun scripts/performance/run-next-staging.ts build --build-kind candidate` exited 0, recorded in `artifacts/performance/verified-candidate-build.log`.
- Test selectors and animations changed after that build, while application source did not. A rerun of the full source manifest would require a different hash. The original manifest was not edited.

## Visual evidence

The parent personally ran and opened the required screenshots. Signoff applies only to captured states. The standard `bun run test:visual -- tests/visual/visual-check.spec.ts` run with `VISUAL_CHECK_PATHS=/dashboard,/admin/questions,/admin/forms` passed six route checks. Each route was captured at 380 x 844 and 1536 x 864. The focused `bun run test:visual -- tests/visual/question-bank-pagination.spec.ts` run passed four checks at both viewports, covering both tabs, search draft, filters, clear, back, forward, and debounce cancellation. Historical coverage is empty state only; populated historical and detail remain unverified. Logs include `artifacts/performance/verified-visual-tests.log` and `artifacts/performance/interaction-final-visual.log`.

Screenshots are in `artifacts/visual-quality/results/`. They contain staging PII; do not embed or share them. The ignored `artifacts/performance/verify-extra-states.ts` also succeeded at both viewports for selection across pages and back, and forms had zero GETs before its tab and one after, with no errors. See `artifacts/performance/extra-states.log`. The profile button has a stable test ID and account aria label.

An initial desktop run had one hydration 418 error. Its cause is unknown and it did not recur in the latest passing runs; it is not claimed fixed. Loading, error, retry, and zero-enrollment real-fixture captures remain incomplete. Configured FCM service and browser token race behavior remain unverified. The parent terminated its server. No direct external database writes, action mutations, commit, or deployment were performed. Normal remote page GET requests may execute existing application cache or streak writes; those side effects were not independently excluded.

## Confirmed remote origin and subsequent experiment

The user confirmed `https://staging.zyxacademy.com` as the active staging origin. Public GET probes returned HTTP 200 for the landing and HTTP 307 to sign-in for unauthenticated `/admin`. The response identifies Google Frontend, but this does not verify the Cloud Run revision or resource settings. Initial cookie probes failed because the local launcher used a temporary local auth secret; neither the process environment nor `.env.neon` supplied the deployed secret. This did not establish a fault in deployed authentication. The user supplied the staging configuration through a private card. A subsequent probe using its auth secret matched the selected staging session identity and completed 17 sequential HTTP requests: two cookie probes and three authenticated GETs per route. No secret, session cookie, or response body was persisted in the measurement artifact.

| Deployed route | TTFB observations, ms | Response status |
|---|---|---|
| `/dashboard` | 7037.91, 5031.19, 4983.60 | 200, 200, 200 |
| `/admin` | 1022.28, 430.42, 440.52 | 200, 200, 200 |
| `/admin/courses` | 394.99, 364.07, 377.45 | 200, 200, 200 |
| `/admin/courses/mat-i` | 391.46, 345.83, 370.15 | 200, 200, 200 |
| `/admin/questions` | 418.30, 368.97, 334.88 | 200, 200, 200 |

The deployed dashboard delay is reproduced before first-byte delivery, including the two subsequent observations near five seconds. Browser rendering cannot explain that measured pre-first-byte interval. The samples do not identify which server, database, proxy, or network component caused it, and do not prove a cold or warm container or database state. N=3 is descriptive evidence, not a p95 estimate. HTTP document TTFB must not be compared as the same metric as local SPA primary-ready timing. The local implementation has not been deployed, and the deployed revision remains unverified. See `artifacts/performance/confirmed-staging-http.json` and `artifacts/performance/remote-staging-http.json`. Byte counts in the latter are decoded response bodies, not compressed transfer sizes.

A follow-up used an explicit desktop Chrome User-Agent because Next.js metadata streaming can depend on the request User-Agent. Its matched-session dashboard GETs also returned HTTP 200, with TTFB observations of 6292.05, 5503.87, and 4581.13 ms. These five requests, including two cookie probes, are recorded separately in `artifacts/performance/remote-staging-browserua-http.json`. They are HTTP probes with a browser User-Agent, not browser rendering or SPA measurements. The delay remains observable under that request condition.

Source inspection of the old dashboard at Git HEAD shows successive awaited stages before page content is returned. This is a plausible contributor only if that source matches the deployed revision. The working implementation streams independent sections and batches several reads, but still waits for auth and enrollment before its page shell. Root locale resolution can also await session and account preference above the route loading boundary. Confirming the deployed revision and timing those stages in the deployed request remain necessary to attribute the observed delay to a specific component or to verify the benefit of the local changes.

A later desktop-only experiment disabled automatic progress-bar increments and collected 40 valid warm samples each for R1 and R2. Both shell and long-task gates remained unmet. Because its source-navigation pacing differed from the initial R1/R2 batch, the result does not isolate a causal improvement. The configuration change was reverted and is not part of the implementation. `artifacts/performance/progress-desktop/` is exploratory evidence only. The `.next` directory from that discarded experiment was removed during authorized disk cleanup; its manifest was not edited. The complete selected measurements above remain evidence for the previously built application source. A fresh build is required before starting the restored source through the provenance-checking launcher.

## Disk cleanup

Authorized cleanup removed the discarded `.next` build, typecheck cache, and Bun download cache. It reclaimed 1,372,688,384 bytes (about 1.28 GiB), increasing free disk from about 3.82 GiB to 5.10 GiB. Source, installed dependencies, private credentials, measurement reports, and visual evidence were retained. See `artifacts/performance/disk-cleanup.json`. A fresh build is required before a local production server can be started.
