# Android fixture run 45806987342

The Android API 35 emulator ran commit `72be4055d944352f6bbd67f1f3113e1a66d742d9` at 380 × 844 px, density 1 px/dp. Maestro completed 150 of 151 flows and saved 165 of 166 named screenshots. The Android job failed on the remaining flow. The original 13,080,883-byte ZIP matched GitHub's SHA-256. [GitHub Actions job](https://github.com/soezyxstt/zyxacademy/actions/runs/45806987342/job/139864730881) · [Original artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45806987342/artifacts/15112626675) · [Provenance and PNG hashes](provenance.json)

[JUnit report](report.xml) · [Flow results](flows.json) · [147-case manifest](case-manifest.json) · [Missing capture](missing-captures.json) · [All 165 raw captures and 8 workflow diff PNGs](named-screens.tar.xz)

## Passed scripted journeys

| Journey | Retained checkpoints |
| --- | --- |
| Admin home to Web Analytics and access denial | [Populated](screens/web-analytics.png) · [Empty dark](screens/web-analytics-empty-dark.png) · [Access denied](screens/web-analytics-denied.png) · [Feature use at 30 days](screens/feature-usage.png) · [Empty at 7 days](screens/feature-usage-empty-range.png) |
| Evaluation question and generation recovery | [Active questions](screens/evaluation-active.png) · [Historical references](screens/evaluation-historical.png) · [Jobs after retry](screens/evaluation-jobs.png) · [Empty distractors](screens/evaluation-distractors-empty.png) · [AST access denied](screens/evaluation-ast-denied.png) |
| Admin authoring, recovery and confirmation | [Blog after retry](screens/management-blog-populated.png) · [Preview](screens/management-blog-preview.png) · [Validation](screens/management-blog-invalid.png) · [Form summary](screens/management-form-summary.png) · [Delete confirmation](screens/management-link-confirmation.png) · [Access denied](screens/management-denied.png) |
| Public blog list, detail, Back and retry | [List](screens/blog-list.png) · [Detail](screens/blog-detail.png) · [Empty category](screens/blog-empty-dark.png) |

The local profile submission flow entered all four fields and selected TPB Kalkulus I. Its next tap targeted the file chooser label at the bottom edge of the viewport, and the fixture PDF did not appear. The hierarchy gives the label bounds as y=820–837 on the 844 px screen, beside the Android navigation area. Commit `d4601ce1` targets the button by ID, centers it, and scrolls to the exact PDF name before continuing. [Failed assertion screenshot](form-local-submit-failure/screenshot.png) · [Command trace](form-local-submit-failure/commands.json) · [Screen hierarchy](form-local-submit-failure/screen-hierarchy.json)

## Whole-viewport comparisons

Four rows below come from the original workflow output, which counts any nonzero RGB difference across all 320,720 pixels. Its displayed diff PNGs use autocontrast. The three additional rows use the raw absolute RGB difference and identify both image hashes and revisions. All retain the system and app chrome. [Original comparison](comparison.json) · [Additional measurements](matched-viewport/metrics.json)

| Matched state | Different pixels | Device | Diff |
| --- | ---: | --- | --- |
| Indonesian populated blog list | 203,500 | [PNG](screens/blog-list.png) | [PNG](screens/blog-list-diff.png) |
| Indonesian blog detail | 67,386 | [PNG](screens/blog-detail.png) | [PNG](screens/blog-detail-diff.png) |
| Indonesian dark empty blog category | 131,609 | [PNG](screens/blog-empty-dark.png) | [PNG](screens/blog-empty-dark-diff.png) |
| Form summary | 40,278 | [PNG](screens/management-form-summary.png) | [PNG](screens/management-form-summary-diff.png) |
| English dark empty blog category | 131,305 | [PNG](matched-viewport/blog-empty-en.png) | [PNG](matched-viewport/blog-empty-en-diff.png) |
| Completed question-generation job, 04.30 UTC | 46,055 | [PNG](matched-viewport/jobs-completed.png) | [PNG](matched-viewport/jobs-completed-diff.png) |
| Populated Web Analytics page | 47,756 | [PNG](matched-viewport/web-analytics.png) | [PNG](matched-viewport/web-analytics-diff.png) |

The original report also includes a completed jobs comparison with a different display time, two component-only Web Analytics references, and two viewport mismatches. The matched rows above use the UTC jobs and full Web Analytics page references. The AST comparison remains unpaired because the web viewport and initial panel differ. These measurements describe this Android revision. Later chart, forms and demo changes need captures from the later build.

Three additional blog comparisons use the original Next.js marketing header and footer. The matching named Android states are the populated list, article detail and English dark empty category. [Full-shell measurements and diffs](full-shell-blog/README.md)
