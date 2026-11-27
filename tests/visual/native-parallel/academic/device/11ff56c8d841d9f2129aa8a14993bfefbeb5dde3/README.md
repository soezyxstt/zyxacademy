# Academic native evidence for Android run 45819670493

The Android API 35 job passed at revision `11ff56c8d841d9f2129aa8a14993bfefbeb5dde3`. It produced 162 verified stamped screenshots from 54 routes, passed all 11 Maestro flows and all four accessibility checks, and saved 32 named Maestro screenshots. Every route and Maestro segment completed on its first attempt. The archive verifies the stamped PNGs against the device manifest and lists the SHA-256 and dimensions of each named PNG. [Run index](index.json) · [Route captures](android/routes.json) · [Interaction outcomes](android/interaction-outcomes.json) · [Named PNG digests](android/named-screenshots.json) · [Android artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45819670493/artifacts/15119049594)

Local Playwright used Chromium 154.0.8037.57 at the exact Android revision. The comparator used the measured 380 × 852 CSS px viewport at DPR 1 and cropped the original 380 × 900 px native frame to x=0, y=24. All eight named cases matched theme and geometry and showed pixel differences from 14,421 to 53,660 pixels. The local comparison retains the reference and difference hashes for reproduction. [Comparison](android/comparison.json) · [Reference manifest](android/web-manifest.json) · [Device comparison manifest](android/device-comparison-manifest.json)

To reproduce, download the linked Android artifact into a directory named `academic-android-evidence` under `$ARTIFACTS`, check out the recorded revision, install its locked dependencies, and run the following command. This command exits with status 1 for pixel differences or a missing platform artifact.

```sh
PARITY_CHROMIUM_EXECUTABLE=/path/to/chromium-154.0.8037.57 \
  python3 scripts/native-parity/academic/match-viewport.py "$ARTIFACTS" "$OUTPUT"
```
