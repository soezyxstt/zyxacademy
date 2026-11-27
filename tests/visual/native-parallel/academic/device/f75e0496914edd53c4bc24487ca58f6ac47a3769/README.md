# Academic native evidence for run 45816738991

## Android

The Android API 35 job passed at revision `f75e0496914edd53c4bc24487ca58f6ac47a3769`. It produced 162 verified stamped screenshots across all 54 routes, passed all 11 Maestro fixture flows and all four accessibility checks, and saved 32 named Maestro screenshots. The interaction suite supplied 28 named screenshots and the accessibility suite supplied four. Raw stamped route images were checked against their SHA-256 hashes, PNG format and dimensions. [Run index](index.json) · [Android route records](android/routes.json) · [Per-flow and per-segment results](android/interaction-outcomes.json) · [Android artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45816738991/artifacts/15117839065)

The same-run CI job compared eight named Maestro cases against Playwright Chromium 157.0.8103.78 at 380 × 852 CSS px and DPR 1. The tool cropped only the measured Android content rectangle at x=0, y=24 from the original 380 × 900 px frames. It applied no masks or resizing. All eight cases had exact geometry and theme, and all eight had nonzero pixel differences. The comparison job reported Android differences and iOS unverified. Neither platform earned visual parity credit. [Comparison results and examples](android/comparison.json) · [Workflow status](matched-viewport-status.json) · [CI comparison artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45816738991/artifacts/15118831466)

| Case | Differing pixels |
|---|---:|
| `tutor-dashboard-assigned-light` | 28,192 |
| `tutor-participants-enrolled-light` | 55,224 |
| `tutor-participants-empty-dark` | 25,898 |
| `tutor-tryout-grading-pending-light` | 14,906 |
| `tutor-quizzes-list-light` | 57,508 |
| `admin-courses-list-light` | 32,624 |
| `admin-courses-empty-dark` | 30,254 |
| `admin-course-chapters-light` | 41,449 |

Download `academic-android-evidence` and `academic-matched-viewport` from the linked run into a scratch directory with those names and point `ARTIFACTS` to that directory. The command below reproduces the eight numeric results from the downloaded manifests and PNGs. The command exits with status 1 when there are pixel differences.

```sh
python3 tests/visual/native-parallel/academic/compare.py \
  "$ARTIFACTS/academic-matched-viewport/android/web/manifest.json" \
  "$ARTIFACTS/academic-android-evidence/interaction-manifest.json" \
  "$ARTIFACTS/recomputed-android-diffs"
```

## iOS

At revision `f75e0496914edd53c4bc24487ca58f6ac47a3769`, the macOS 15 ARM64 runner booted an iPhone 17 Pro on iOS 26.2 and completed CocoaPods installation. Xcode 26.3 then failed in ExpoModulesJSI. Swift reported `sending 'slot' risks causing data races` at `JavaScriptObject.swift:946:36`, and `xcodebuild` exited with code 65. [Run index](index.json) · [iOS build job](https://github.com/soezyxstt/zyxacademy/actions/runs/45816738991/job/139898364219)

The artifact contains 162 exported fixture definitions and zero screenshots. The app build stopped before installation, fixture rendering, or Maestro execution. This snapshot carries zero iOS parity credit. [Pinned iOS artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45816738991/artifacts/15116279193)

Download `academic-ios-evidence` from the linked run to reproduce the inspection. Compare the SHA-256 of `provenance.json`, `job-status.json`, `ios-toolchain.txt`, `simulator-booted.json`, `build.log` and `cases.json` with the index. The booted device appears in the iOS 26.2 runtime entry. The Swift diagnostic and exit code are in `build.log`.
