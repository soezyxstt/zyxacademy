# Public marketing web references

Run from the repository root with the locked dependencies installed.

```sh
NEXT_TELEMETRY_DISABLED=1 DEMO_VISUAL_DELAY_MS=0 \
  node node_modules/next/dist/bin/next dev tests/visual/native-parallel/operations/public-pages --webpack -p 3212

PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium PUBLIC_REFERENCE_GROUP=static \
  node --import tsx tests/visual/native-parallel/operations/public-pages/capture.ts

PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium PUBLIC_REFERENCE_GROUP=demo \
  node --import tsx tests/visual/native-parallel/operations/public-pages/capture.ts
```

Run the static group before the demo group. The first demo request compiles the Student application views. `PUBLIC_REFERENCE_CASES` accepts comma-separated case names without the `operations-public-` prefix. `PUBLIC_REFERENCE_WIDTHS` accepts comma-separated widths of `380`, `402`, or `1536`. The case registry also drives the native fixtures in `packages/native-parity/operations/public-fixtures.ts`. The blog reference lives in the parent operations harness.

Each route re-exports its original Next.js page body. The isolated root provides the original locale provider, real translation catalogs, application CSS, local Inter and Lexend faces, and published local image assets. The marketing navbar and footer are outside this reference scope. Pricing and release data, email tokens and demo course data are local fixtures. The fixture form submits locally and fixture unsubscribe uses a local redirect without recording an email preference. Browser requests are confined to localhost.

Captures use Chromium with UTC, reduced motion, sRGB and a fixed browser date. The default viewports are 380 × 844 px and 1536 × 864 px, both at DPR 1. Width `402` uses an 874 px height and DPR 3. The capture records horizontal overflow from the original web markup at the declared viewport. It rejects unexpected HTTP errors, redirects, blocked requests, page errors and console errors. Result manifests record the interaction outcome, locale, theme, dimensions and source width.

The course data in the existing web demo fixture differ from the Expo demo fixture. The original app calculates web pricing using fixture discount settings. The native gallery supplies its own deterministic numeric quotes. These images establish browser states and source layout. Android and iOS screenshots and cross-platform pixel comparisons are separate evidence.

## Captured checkpoint

The [live manifest](references/manifest-live.json) indexes verified browser interactions and source layouts. The [SSR manifest](references/manifest-ssr.json) indexes initial states rendered from actual Next route HTML and local application assets with application JavaScript disabled. To repeat the SSR checkpoint, keep the fixture server running and run `PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --import tsx tests/visual/native-parallel/operations/public-pages/capture-ssr.ts`.

The initial 18 checkpoint PNGs use the 380 × 844 viewport at DPR 1. Chromium measured 388 px for the landing document. The quiz section's decorative dots extend 8 px past the viewport, and the images preserve the declared crop. The browser form captured the initial fields, required-field validation, and successful local submission. The success toast appeared and the full-name field reset. The attachment row stayed visible after submission, and React reported that FileUploadField updates FormsPlaygroundPage during render. The submission image includes the local Next dev issue badge. The SSR plans image shows the initial loading state.


## Loaded Plans prices

The real Next.js Plans route captured loaded prices at 1536 × 864 px, DPR 1. The browser-only fixture mounts the same `PlansClient` source with local translation and routing boundaries. It captures loaded prices at 380 × 844 px and 1536 × 864 px, DPR 1, then asserts that increasing the group size updates the displayed price. Its local response to `GET /api/pricing` uses the canonical default discount settings and a browser date of 20 September 2026. Minimal initially displays Rp 390.000 per person and Rp 1.170.000 per semester for three people and three courses. See the [price manifest](references/manifest-plans-prices.json).

```sh
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
  node --import tsx tests/visual/native-parallel/operations/public-pages/capture-plans.ts
```

The direct Next.js mobile run reached the page before the cold pricing endpoint completed. The warmed retry lost its local server before navigation. The 380 px price-loaded image comes from the browser-only fixture.

## Demo route references

The [demo manifest](references/manifest-demo.json) records isolated Chromium captures of the real `/demo` and `/demo/[view]` pages. The empty dashboard runs the route with zero course summaries. The populated dashboard verifies the first article link, and the alternate-course dashboard verifies that the article link retains `course=fictional-kimia`. The article view verifies the article title. The quiz verifies selection of the first answer. The missing-course check requires the 404 heading and records the actual HTTP status because Next.js streaming can send the shell first. Its screenshot preserves the Next dev issue badge, and the manifest records the React script-element diagnostic.

The demo runner serves local images from the repository's `public` directory. It reads the fixture server's built static assets when available to avoid a dev server timeout on the larger JavaScript chunks. It supplies a local anonymous session response when the quiz checks authentication. The manifest combines successful captures from focused reruns.

The dashboard images show the visible link and initial plan. Course retry, article completion and quiz submission were outside this capture. The web and native demo fixtures use different course IDs and article content, so there is no paired pixel comparison. [Operations route evidence](../route-evidence.md)

## 402 px references

The Indonesian light landing hero, English light form entry and English dark demo empty state passed at 402 × 874 CSS px, DPR 3, and produced PNGs of 1206 × 2622 px. The landing document measured 410 CSS px wide. The form and demo fit the viewport. These are browser captures of the initial states. [Capture manifest](references/manifest-402-dpr3.json)

```sh
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium PUBLIC_REFERENCE_CASES=hero-id,form-empty,demo-empty PUBLIC_REFERENCE_WIDTHS=402 \
  node --import tsx tests/visual/native-parallel/operations/public-pages/capture.ts
```
