# Academic native evidence for Android run 45826291960

The Android API 35 job passed at revision `156028b75a4d6fda0accea8e940ced7d9b9ab9da`. It produced 162 verified stamped screenshots across 54 routes, passed all 11 Maestro flows and four accessibility checks, and saved 32 named PNGs. The Admin course list route passed on its second attempt after the initial readiness stamp was missed. All other route captures and Maestro segments passed on their first attempt. [Run index](index.json) · [Route evidence](android/routes.json) · [Interaction outcomes](android/interaction-outcomes.json) · [Named PNG digests](android/named-screenshots.json) · [Device artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45826291960/artifacts/15122253929)

The same-run GitHub Actions job compared eight named cases with Chromium 157.0.8103.78 at a measured 380 × 852 CSS px viewport and DPR 1. All eight web reference hashes match the prior f75e CI references. All pairs matched geometry and theme, and each still showed pixel differences. This run includes the Admin course layout changes and predates the Tutor roster layout changes. [Numeric results and baseline](android/comparison.json) · [Reference manifest](android/web-manifest.json) · [Device comparison manifest](android/device-comparison-manifest.json) · [Comparison artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45826291960/artifacts/15122578139)

| Case | Prior f75e CI | Current differing pixels | Change |
|---|---:|---:|---:|
| Tutor dashboard | 28,192 | 28,159 | −33 |
| Tutor participant list | 55,224 | 55,224 | 0 |
| Tutor participant empty state | 25,898 | 25,898 | 0 |
| Tutor tryout grading | 14,906 | 14,906 | 0 |
| Tutor quiz list | 57,508 | 57,508 | 0 |
| Admin course list | 32,624 | 23,032 | −9,592 |
| Admin course empty state | 30,254 | 16,832 | −13,422 |
| Admin course chapters | 41,449 | 32,157 | −9,292 |

Download the device and comparison artifacts into a common directory and set `ARTIFACTS` to that directory. The following command recomputes the eight pixel counts from the captured PNGs. It exits with status 1 because each pair has nonzero differences.

```sh
python3 tests/visual/native-parallel/academic/compare.py \
  "$ARTIFACTS/academic-matched-viewport/android/web/manifest.json" \
  "$ARTIFACTS/academic-android-evidence/interaction-manifest.json" \
  "$ARTIFACTS/recomputed-android-diffs"
```
