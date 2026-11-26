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

Run the static group before the demo group. The first demo request compiles the Student application views. `PUBLIC_REFERENCE_CASES` accepts comma-separated case names without the `operations-public-` prefix. `PUBLIC_REFERENCE_WIDTHS` accepts `380`, `1536`, or `380,1536`. The case registry also drives the native fixtures in `packages/native-parity/operations/public-fixtures.ts`. The blog reference lives in the parent operations harness.

Each route re-exports its original Next.js page body. The isolated root provides the original locale provider, real translation catalogs, application CSS, local Inter and Lexend faces, and published local image assets. The marketing navbar and footer are outside this reference scope. Pricing and release data, email tokens and demo course data are local fixtures. The fixture form submits locally and fixture unsubscribe uses a local redirect without recording an email preference. Browser requests are confined to localhost.

Captures use Chromium with UTC, reduced motion, sRGB and a fixed browser date. The viewports are 380 × 844 px and 1536 × 864 px, both at DPR 1. The capture records horizontal overflow from the original web markup at the declared viewport. It rejects unexpected HTTP errors, redirects, blocked requests, page errors and console errors. Result manifests record the interaction outcome, locale, theme, dimensions and source width.

The course data in the existing web demo fixture differ from the Expo demo fixture. The original app calculates web pricing using fixture discount settings. The native gallery supplies its own deterministic numeric quotes. These images establish browser states and source layout. Android and iOS screenshots and cross-platform pixel comparisons are separate evidence.
