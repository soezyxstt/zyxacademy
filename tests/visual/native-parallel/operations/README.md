# Operations web references

Reproduce from the repository root after installing locked root dependencies:

```sh
NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next dev tests/visual/native-parallel/operations --webpack -p 3211
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --import tsx tests/visual/native-parallel/operations/capture-blog.ts
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --import tsx tests/visual/native-parallel/operations/capture.ts
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --import tsx tests/visual/native-parallel/operations/capture-viewport.ts
```

This isolated Next fixture renders the actual `app/(marketing)/blog` list and detail, `WebAnalyticsOverview`, and `BlogThumbnail`. Webpack replaces the blog repository, auth, translations, storage, and tutor actions with local mocks. Blog uses `public-fixtures.ts`; analytics uses `monitoring-fixtures.ts`. The fixture is not the marketing/admin shell, a backend or permission test. Links use a local `/id/blog` rewrite. Fonts come from `tests/visual/fixtures/fonts`, locale id-ID, timezone UTC, reduced motion, sRGB. All data are synthetic.

The successful `capture-blog.ts` run produced full-page list, detail, and browser-back images for light/dark at 380×844 CSS px, DPR 1. Viewport references cover list, detail, and empty category in dark at 380×844 DPR 1 and 402×874 DPR 3. The captures are top-of-page browser viewport screenshots, not device screenshots. The remaining PNGs with no suffix are full-page browser captures. Screenshots reflect the working tree at capture, based on `f4ed84dc1b65047e4f6f91984f7604231e974a97`; sources were concurrently modified for this migration. It is not a zero-difference comparison to native, nor evidence of Android or iOS behavior. Primary reviewer must inspect images.

`capture.ts` previously passed all ten component cases with an older synthetic analytics dataset. After switching to the shared monitoring fixture, the rerun was interrupted by a 30-second navigation timeout during concurrent compiles. The current script requires two Recharts line paths before accepting a populated chart capture; the partial analytics PNG produced during the interrupted rerun had a blank chart and is not a reference. Recharts also emitted initial layout-size warnings. No analytics reference is claimed until that rerun passes. `capture-viewport.ts` passed for all six viewport captures. Both themes use Indonesian text; the native empty-state scenario marked English cannot be compared directly without changing locale. No emulator/simulator was found on PATH (`adb` and `xcrun` absent). Browser DPR does not establish native device parity.
