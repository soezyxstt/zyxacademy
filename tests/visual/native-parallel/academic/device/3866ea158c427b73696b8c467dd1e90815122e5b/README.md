# Android academic evidence for run 45811667510

Android API 35 produced all 162 stamped cases across all 54 academic routes at revision `3866ea158c427b73696b8c467dd1e90815122e5b`. SHA-256, PNG format and dimensions were verified for each capture. All four fixture accessibility checks passed with hierarchy assertions. [Run index](index.json) · [Route records](android/routes.json) · [Android artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45811667510/artifacts/15114712143)

Five complete fixture flows passed. The Admin course state flow passed its empty-state segment. Its recovery segment lost the Maestro device server during a hierarchy read, and ADB could not open its access-denial fixture afterward. Five other flows stopped before Maestro could be invoked because ADB could no longer find the emulator. No product assertion failure was recorded. [Per-flow and per-segment results with log paths](android/interaction-outcomes.json) · [Android job](https://github.com/soezyxstt/zyxacademy/actions/runs/45811667510/job/139880804430)

| Outcome | Fixture flows |
|---|---|
| Passed | `administration-bundle`, `administration-conflict`, `assessment-grading-retry`, `assessment-quiz`, `assessment-tryout` |
| Interrupted by device transport | `courses-states` |
| Maestro was not invoked | `courses`, `tutor-assigned`, `tutor-empty-denied`, `tutor-retry`, `tutor-schedule` |

The Android manifest validated two of eight named Maestro screenshots. The local Playwright component harness used the same source revision at 380 × 852 CSS px and DPR 1. The comparator cropped the Android 380 × 900 frames to their stamped content rectangle at x=0, y=24, width=380, height=852. It applied no masks or resizing. This snapshot records Android evidence and carries zero parity credit. [Comparison results and PNGs](android/comparison.json) · [Device comparison input](android/device-comparison-manifest.json) · [Playwright manifest](android/web-manifest.json)

| Named pair | Differing pixels |
|---|---:|
| `tutor-quizzes-list-light` | 53,660 |
| `admin-courses-empty-dark` | 29,617 |

[Earlier matched-viewport diagnostic](../06ac6f8f84b740a5fae96f2cfaf2b272f9982659/README.md) · [Earlier complete Android route archive](../c60041d6d2cb98513c8232e41838b35c604b3577/README.md)

## Reproduce the two comparisons

Download `academic-android-evidence` from the run and set `ANDROID_ARTIFACT` to its extracted folder. Set `REFERENCES` to a scratch folder with an absolute path. Run the original capture in a checkout at the device revision with the checkout's lockfile dependencies installed. Playwright used Chromium 154.0.8037.57.

```sh
PARITY_WIDTH=380 PARITY_HEIGHT=852 PARITY_DPR=1 \
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
PARITY_CASES=tutor-quizzes-list-light,admin-courses-empty-dark \
PARITY_OUTPUT_DIR="$REFERENCES/web" \
bun tests/visual/native-parallel/academic/capture.ts

python3 tests/visual/native-parallel/academic/compare.py \
  "$REFERENCES/web/manifest.json" \
  "$ANDROID_ARTIFACT/interaction-manifest.json" \
  "$REFERENCES/diffs"
```
