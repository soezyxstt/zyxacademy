# Academic device evidence for run 45804599913

Android API 35 produced 159 of 162 stamped fixture route captures across 53 of the 54 academic routes at revision `06ac6f8f84b740a5fae96f2cfaf2b272f9982659`. SHA-256, PNG format and pixel dimensions were verified for all 159 captured frames. The populated, empty and denied variants of `/admin/materials/review` lacked a readiness stamp. Android passed zero of 11 Maestro flows. iOS stopped in the Expo CLI before the app build when opening the missing `~/.expo/devicectl-exists` file, yielding zero iOS screenshots. [Run index](index.json) · [Android route records](android/routes.json) · [GitHub Actions run](https://github.com/soezyxstt/zyxacademy/actions/runs/45804599913)

The workflow comparison artifact reported both platforms as unverified. The local diagnostic archive compares seven explicitly mapped Android stamped fixture routes with the original Playwright component harness from the same revision. The stamped Tutor participants empty screenshot is listed in the route records and falls outside this seven-case mapping. No Maestro screenshot was validated for that case. [Approved mapping](run-source.json) · [Workflow comparison artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45804599913/artifacts/15110428558)

Playwright 1.62.1 used Chromium 154.0.8037.57 and a 380 × 852 CSS-pixel viewport at DPR 1. The Android frame measured 380 × 900 pixels. The comparison cropped only to the Android content rectangle at x=0, y=24, width=380, height=852. It applied no masks or resizing. All seven pairs differed in 14,421–53,660 pixels. Device route observations and diagnostic pairs carry zero parity credit. [Per-case numeric results and PNG examples](android/comparison.json) · [Playwright manifest](android/web-manifest.json)

## Reproduce the Android diagnostic

Download `academic-android-evidence` and `academic-ios-evidence` from the linked run into a scratch directory using their artifact names as subdirectories. Set `ARTIFACTS` to that directory and `REFERENCES` to a separate scratch directory with an absolute path. Use the current archive tools and run the original Playwright capture in a checkout at the device revision, with the checkout's lockfile dependencies installed and Chromium available.

```sh
PARITY_WIDTH=380 PARITY_HEIGHT=852 PARITY_DPR=1 \
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
PARITY_CASES=tutor-dashboard-assigned-light,tutor-participants-enrolled-light,tutor-tryout-grading-pending-light,tutor-quizzes-list-light,admin-courses-list-light,admin-courses-empty-dark,admin-course-chapters-light \
PARITY_OUTPUT_DIR="$REFERENCES/android/web" \
bun tests/visual/native-parallel/academic/capture.ts
```

From the repository with the archive tools and Python Pillow installed, run the archive generator. The `FAIL` lines report the observed differences. The generator exits successfully after archiving valid measurements.

```sh
python3 tests/visual/native-parallel/academic/device/archive.py \
  "$ARTIFACTS" "$REFERENCES" \
  tests/visual/native-parallel/academic/device/06ac6f8f84b740a5fae96f2cfaf2b272f9982659
```
