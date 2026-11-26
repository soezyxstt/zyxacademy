# Operations web references

Reproduce from the repository root after installing locked root dependencies:

```sh
NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next dev tests/visual/native-parallel/operations --webpack -p 3211
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --import tsx tests/visual/native-parallel/operations/capture-blog.ts
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --import tsx tests/visual/native-parallel/operations/capture.ts
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --import tsx tests/visual/native-parallel/operations/capture-viewport.ts
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --import tsx tests/visual/native-parallel/operations/capture-blog-empty-en.ts
```

This isolated Next fixture renders the actual `app/(marketing)/blog` list and detail, `WebAnalyticsOverview`, and `BlogThumbnail`. Webpack replaces the blog repository, auth, translations, storage, and tutor actions with local mocks. Blog uses `public-fixtures.ts`; analytics uses `monitoring-fixtures.ts`. The default runner captures individual page bodies and components. The local substitutes provide deterministic visual states. Links use a local `/id/blog` rewrite. Fonts come from `tests/visual/fixtures/fonts`, locale id-ID, timezone UTC, reduced motion, sRGB. All data are synthetic.

The successful `capture-blog.ts` run produced full-page list, detail, and browser-back images for light/dark at 380×844 CSS px, DPR 1. Viewport references cover list, detail, and empty category in dark at 380×844 DPR 1 and 402×874 DPR 3. The captures are top-of-page browser viewport screenshots, not device screenshots. The remaining PNGs with no suffix are full-page browser captures. Screenshots reflect the working tree at capture, based on `f4ed84dc1b65047e4f6f91984f7604231e974a97`; sources were concurrently modified for this migration. It is not a zero-difference comparison to native, nor evidence of Android or iOS behavior. Primary reviewer must inspect images.

`capture.ts` passed all ten component cases with the shared monitoring fixture. The six analytics full-page captures at 380×844 DPR 1 cover populated, empty and unavailable states in light/dark. The test asserts both chart lines have non-empty SVG paths before capture; Recharts emitted initial layout-size warnings. The analytics page uses a fixed 30-day window and has no range selector. No Android or iOS analytics comparison has been made. `capture-viewport.ts` passed for all six viewport captures. The list/detail captures and one empty-state capture use Indonesian. `capture-blog-empty-en.ts` sends the fixture-only locale header and captures the English dark empty category at both viewport sizes to match the English device case. No emulator/simulator was found on PATH (`adb` and `xcrun` absent). Browser DPR does not establish native device parity.

## Blog with the marketing shell

The [marketing-shell manifest](references/manifest-blog-shell.json) indexes the original Next marketing layout, navbar, main content wrapper, and footer around the original blog bodies. These captures retain the published fixture articles and a signed-out guest session. The fixture serves the repository logos locally and uses the existing local command-menu, locale persistence and blog repository substitutes. OAuth is disabled. The capture rejects requests outside the local fixture origin, unsuccessful responses, console errors, page errors, and horizontal overflow. It verifies that the 56 px navbar and the main content offset match. The original shell-less captures retain their original names.

The list and detail use Indonesian in light mode. The empty category and separate footer capture use English in dark mode. Each state is captured at 380 × 844 CSS px, DPR 1, and 402 × 874 CSS px, DPR 3, in Chromium with local fonts, UTC, and sRGB. The runner waits for the production page transition to reach full opacity before capturing. Browser DPR 3 aligns the reference dimensions with the device capture. It does not exercise native layout.

```sh
SKIP_ENV_VALIDATION=1 BLOG_SHELL_FIXTURE=1 NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_APP_URL=http://localhost:3219 \
  node node_modules/next/dist/bin/next dev tests/visual/native-parallel/operations --webpack -p 3219

PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
  node --import tsx tests/visual/native-parallel/operations/capture-blog-shell.ts
```
