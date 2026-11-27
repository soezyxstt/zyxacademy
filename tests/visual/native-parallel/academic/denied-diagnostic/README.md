# Student denial navigation and pixel diagnostic

| Observation | Result |
| --- | --- |
| Web navigation | All 54 original protected requests returned HTTP 307 to `/`, which returned HTTP 200 and rendered the public homepage. |
| Android fixture navigation | All 54 stamped Student requests rendered `Akses ditolak.` and `Kembali`. The measured RGB content was identical across those cases. |
| Exact concrete request pairs | 45 compared. Nine had different resource paths and were excluded from pixel measurement. |
| Pixel divergence | 151,051 to 152,083 of 323,760 pixels differed per pair, or 46.6552% to 46.9740%. |

The per-case record includes both requested paths, the web redirect chain, the Android screen observation, the verified PNG hashes, and the difference PNG hash when measured. [Per-case results](results.json) · [Pinned Android artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45831051547/artifacts/15127176115)

The browser captures were rendered at `cd2b970c4f74f45e95c0c9a21380b46ba3d04252` and retained in `2cad827070b0697cdf0db29e8e2826b345e6afff`. They record a real Better Auth session for the seeded Student account `academic-student`. The Android artifact uses the app’s synthetic Student fixture on run `45831051547` at `03f9f7bd8bb6267fe68cdaa772debadf2fc95260`. The only source change between the revisions is the iOS status-bar override and error handling in `run-device.sh`. The Android runner, application, route registry, and fixtures are identical between the revisions. [Web manifest](../pages/denied/manifest.json) · [Source diff](https://github.com/soezyxstt/zyxacademy/compare/cd2b970c4f74f45e95c0c9a21380b46ba3d04252...03f9f7bd8bb6267fe68cdaa772debadf2fc95260) · [Android job](https://github.com/soezyxstt/zyxacademy/actions/runs/45831051547/job/139947644371)

The diagnostic checks the exact case ID, registered route pattern, theme, role, fixture path, and Android capture ordinal. The browser must be light theme at 380 × 852 CSS px, DPR 1. The Android manifest must record the same measured viewport and density. Each PNG is verified against its manifest hash and frame size. Native navigation state is observed from the visible text in the measured crop and associated with the stamped fixture request. The stamp was observed during capture, and the retained raw PNG is the stable frame after the stamp disappeared. Android captures record a fixture deep link and a rendered screen, so fields retain the `/academic` fixture entry and requested path without inferring an HTTP navigation trace for the app. [Fixture capture runner](../../../../../scripts/native-parity/academic/capture.py) · [Fixture entry](../../../../../apps/mobile-native/features/academic/FixtureEntry.tsx)

The browser requested routes either match the Android fixture path byte for byte or are excluded from the pixel comparison. Nine browser paths substitute seeded `academic-web-*` IDs. The Idea review detail also resolves to `fisika-dasar` on web and `biologi-dasar` in the Android fixture. The report preserves both paths and independent observations for every excluded case.

For matching requests, the pixel count measures divergence between the public homepage and the in-app denial screen. The existing comparator converts each original PNG to sRGB and crops Android to the recorded rectangle at x=0, y=24, width 380, height 852. It preserves original pixel coordinates within the measured content. Same-state parity credit is zero. [Comparator](../compare.py)

The `/admin/courses` example has 151,690 differing pixels. The retained Android PNG is the original 380 × 900 frame. The difference is 380 × 852. [Web reference](../pages/denied/captures/bd901889c0a5024fe71267b7fad0a34960e6f5b34ef794efe381351d74ed65ab.png) · [Android frame](examples/academic-admin-courses-denied-nativeFrame.png) · [Difference](examples/academic-admin-courses-denied-difference.png)

## Reproduce

Use Python with Pillow 12.3.0 and Tesseract 5.5.0 with English OCR data. The downloaded `academic-android-evidence` ZIP has SHA-256 `a10e3ca4441b7f85e5119c77ef3b3473b26cbd1707607c5ea089d88f82be5290`. Extract it into a scratch directory and run the command from the repository root. It writes the report and one example pair’s native frame and difference PNG.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 tests/visual/native-parallel/academic/denied-diagnostic/diagnose.py \
  /path/to/extracted/academic-android-evidence /path/to/scratch/results --artifact-id 15127176115
```
