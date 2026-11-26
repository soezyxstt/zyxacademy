# Android diagnostics from run 45801930588

Maestro ran on an Android API 35 emulator at 380 × 844 px and density 160 (1 px/dp). All 151 flows failed. The archive contains one failure screenshot and its accessibility hierarchy for each flow. The 147 generated case flows reached the screenshot command, which rejected its absolute destination. Maestro still saved a diagnostic PNG in each flow's own results directory. The four scripted journeys failed earlier at a content assertion or scroll. The Android job ran commit `316a34996a15c60307272bd10ca9f5bac4e868dc`. [GitHub Actions job](https://github.com/soezyxstt/zyxacademy/actions/runs/45801930588/job/139847121500) · [Original artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45801930588/artifacts/15109186646)

The ZIP is 7,087,052 bytes. Its SHA-256 matches the GitHub artifact digest, `4996196f5960897405956f16fd3bd6e224da12aec3dc728d286d5c32543c9408`. The raw case manifest and the workflow's comparison output are copied verbatim. The latter reports all three planned captures as awaiting capture. [Case manifest](source/manifest.json) · [Original comparison output](source/comparison.json)

## What appears on Android

For every generated case, the requested case ID matches the deep link, the completed Maestro assertion, and the resource ID in the hierarchy beside the PNG. Each image measures 380 × 844. The inventory records all 151 flow names, original PNG paths, image hashes, leading accessibility labels and the failed command. The selected PNGs are byte-for-byte copies of their archived files. [Flow inventory](flows.json) · [Selected Android PNGs](screens)

| Visible result | Flows | What the screenshot establishes |
| --- | ---: | --- |
| Application screen or fixture state | 127 | The visible page at mount time, including forms, lists, empty states and retry prompts. |
| Evaluation alias handoff | 12 | A destination path and Back button. The delegated academic/material screen is outside this fixture. |
| Evaluation not-found or plain access denial | 5 | The corresponding message appeared. |
| Denied evaluation alias redirected to the public landing | 3 | The quiz list, new quiz and quiz edit fixtures reached the landing screen. |
| Primitive gallery | 4 | The scripted monitoring, authoring, evaluation and public journeys remained on the gallery. Their page assertions failed. |

The generated command sequences opened a case, asserted its container and waited for animations. A populated blog list, for example, establishes the initial list state only. It supplies no interaction evidence for opening a detail page or returning via Back, even though the case ID contains “open-back.” The local form submit and validation cases similarly show the entry form. The sampled analytics screenshots show the populated totals, a retry prompt and access denial in separate renders. [Analytics data](screens/analytics-populated.png) · [Retry](screens/analytics-retry.png) · [Access denied](screens/analytics-denied.png) · [Journey failure in the primitive gallery](screens/journey-gallery.png)

## Matched web comparisons

Two diagnostic PNGs match committed Playwright references at the tested SHA on route, populated fixture, Indonesian locale, light theme, width, height and density. The reference harness renders the actual Next.js blog page body in an isolated shell. The native capture includes its own header and Android system bars. Each diff is the absolute per-channel RGB difference of the complete, unscaled images. A pixel counts as different if any channel differs by at least one. [Measurements and source hashes](diff/metrics.json)

| Case | Different pixels | Fraction | Android | Web | Diff |
| --- | ---: | ---: | --- | --- | --- |
| Blog list | 202,280 / 320,720 | 63.071% | [PNG](screens/blog-list.png) | [PNG](../references/blog-list-light-380-dpr1.png) | [PNG](diff/blog-list.png) |
| Blog detail | 67,432 / 320,720 | 21.025% | [PNG](screens/blog-detail.png) | [PNG](../references/blog-detail-light-380-dpr1.png) | [PNG](diff/blog-detail.png) |

The native list wraps “Artikel terbaru” onto two lines, uses wider page gutters, and displays a white background where the web page has a patterned background. On detail, the native header and Back link push the article down. The Android share section shows a system-share button, while web has a copy field and provider buttons. Article title, body and labels confirm the matched fixtures. The dark empty Android blog case displays English, while the corresponding web reference displays Indonesian, so it has no paired diff. [Raw blog list trace](source/blog-list) · [Raw blog detail trace](source/blog-detail) · [English empty case](screens/blog-empty-en.png)

These results establish two nonzero differences at this SHA. Android journey completion, subsequent commits, iOS rendering and cross-platform visual parity require independent evidence.
