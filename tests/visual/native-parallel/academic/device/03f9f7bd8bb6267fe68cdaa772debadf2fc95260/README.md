# Academic native evidence for Android run 45831051547

Android API 35 passed at revision `03f9f7bd8bb6267fe68cdaa772debadf2fc95260`. The job produced 162 verified stamped screenshots across 54 routes, passed all 11 Maestro flows and four accessibility checks, and saved 32 named PNGs. The Admin course list was the only route that needed a second attempt. [Run index](index.json) · [Route evidence](android/routes.json) · [Interaction outcomes](android/interaction-outcomes.json) · [Named PNG digests](android/named-screenshots.json) · [Device artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45831051547/artifacts/15127176115)

Playwright used the official Google Chrome stable 157.0.8103.78 package on Debian 13 for both exact source revisions. The eight local reference PNGs have identical hashes across the two revisions. Their pixels differ from the earlier Ubuntu CI references, so the table uses the locally recomputed 156028 Android baseline. The measured comparison viewport is 380 × 852 CSS px at DPR 1. All cases matched geometry and theme. Each pair still shows pixel differences. [Numeric results and browser package](android/comparison.json) · [Current reference manifest](android/web-manifest.json) · [Baseline reference manifest](android/baseline-web-manifest.json) · [Device comparison manifest](android/device-comparison-manifest.json)

| Case | 156028 local baseline | Current differing pixels | Change |
|---|---:|---:|---:|
| Tutor dashboard | 25,407 | 25,407 | 0 |
| Tutor participant list | 53,098 | 42,751 | −10,347 |
| Tutor participant empty state | 25,380 | 16,926 | −8,454 |
| Tutor tryout grading | 14,421 | 14,421 | 0 |
| Tutor quiz list | 53,660 | 53,660 | 0 |
| Admin course list | 21,873 | 21,873 | 0 |
| Admin course empty state | 16,264 | 16,264 | 0 |
| Admin course chapters | 31,182 | 31,182 | 0 |

The archive retains the web reference, both device frames, and the current diff for the populated and empty Tutor lists. To reproduce the numbers, use the recorded Chrome package and the checkout for each device revision. Download the current and baseline device artifacts into separate directories and run `scripts/native-parity/academic/match-viewport.py` for each checkout. [Tutor examples](android/examples) · [Baseline device artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45826291960/artifacts/15122253929)
