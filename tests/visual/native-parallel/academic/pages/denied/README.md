# Protected web routes as a Student

[`manifest.json`](manifest.json) pairs each denied academic fixture with its original Next.js route. Playwright uses a Better Auth session for the seeded `academic-student` account. The browser checks fresh canonical identity before each route and records the original request, navigation status and final destination. Dynamic route IDs resolve to seeded web records. Every retained screenshot is a light-theme Chromium capture at 380 × 852 CSS pixels, DPR 1, with locale `id-ID` and timezone `Asia/Jakarta`.

All 54 routes redirected with HTTP 307 to `/`, where the browser rendered the public homepage and the Student’s account menu. The run recorded 54 distinct PNG hashes. No route rendered a same-path forbidden screen.

A redirect requires the browser to reach the public homepage and render its visible heading. A same-route forbidden result requires HTTP 403 and a visible access-denied heading. The checks reject blank, loading, unauthenticated and generic error views. Known Admin and Tutor fixture markers must be absent from the rendered main content and any streamed successful Admin or Tutor document. Screenshot references use SHA-256 of the PNG bytes, so identical files are stored once and listed under each case that rendered them.

The original screenshot run recorded zero same-origin background responses with status 2xx under `/api/admin` and `/api/tutor`. That manifest retains the two observed prefixes and their empty result lists. [Academic HTTP inventory](../../../../../../packages/native-parity/academic/report/http-contracts.tsv).

[`api-observations.json`](api-observations.json) records a separate browser run for the same fixture cases. Each page records same-origin requests from navigation through hydrated page load. Paths omit query strings and substitute route patterns for dynamic IDs. Static build assets are grouped by extension. The trace contains methods and response statuses. A request can have a null status when the browser closed the capture before a response or aborted it. The trace omits headers and bodies. Identity and authorized controls remain separate from the denied cases.

The observer classifies Admin and Tutor API prefixes, their native academic adapters, live session administration, and quiz template writes as staff endpoints. It records account and session traffic, ordinary Student services, and public pricing separately. Quiz reads, discussions, live participation, course resources, and coding APIs can use per-resource access rules and are recorded as scope-dependent. An observed 2xx on a staff endpoint fails the case. Endpoints the page never requested remain outside the navigation evidence.

The manifest records separate anonymous sign-in, authorized Admin and Tutor, and repeated Student navigation checkpoints. The captures provide original web behavior for future role-state comparison. Native device comparison requires a measured viewport and an independently captured device case.

Reproduce using the [disposable PostgreSQL and Next.js fixture](../../../../../../packages/native-parity/academic/local/README.md) on ports 55434 and 3314. Load the synthetic records in [`protected-web-seed.sql`](../../../../../../packages/native-parity/academic/local/protected-web-seed.sql). The bundle objects used for authorized detail screenshots are unnecessary for this denial run. From the repository root run the capture with system Chromium or specify a local executable through `PARITY_CHROMIUM_EXECUTABLE`.

```sh
node --import tsx tests/visual/native-parallel/academic/pages/denied/capture.mjs
```

Pass registered denied case IDs as arguments for a targeted refresh of the same recorded source revision. Earlier recorded attempts remain in the case entry. The runner uses real loopback routes and blocks external and non-read browser requests.

To reproduce the request trace, run the same Next app and synthetic database fixture on port 3317. Set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to `http://localhost:3317` for that server. Point `PARITY_ACL_WEB_ROOT` to the checkout the process serves. This mode preserves the original screenshots and manifest.

```sh
PARITY_ACL_WEB_ROOT=/path/to/serving/checkout \
  node --import tsx tests/visual/native-parallel/academic/pages/denied/capture.mjs --acl
```
