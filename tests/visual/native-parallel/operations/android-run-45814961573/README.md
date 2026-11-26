# Passing Android fixture run 45814961573

Android API 35 ran commit `bd3fcaaa1343011fef456f11e1fc3c69b7a88740` at 380 × 844 px with 1 px/dp. All **155 Maestro flows passed**, including 147 registered cases and eight scripted journeys. Maestro captured **175 of 175** expected screenshots. The 16,488,440-byte source ZIP matched GitHub's SHA-256. [Passing Android job](https://github.com/soezyxstt/zyxacademy/actions/runs/45814961573/job/139892188451) · [Source artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45814961573/artifacts/15116846497)

[All 175 raw PNGs and 19 diff PNGs](named-screens.tar.xz) · [PNG provenance and hashes](provenance.json) · [JUnit report](report.xml) · [Batch reports](reports) · [155 per-flow traces](flow-traces.tar.xz) · [Trace index and checksums](flow-trace-provenance.json)

| Passed journey | Selected captures |
| --- | --- |
| Admin home, Web Analytics, retry, denial and feature ranges | [Populated Analytics](screens/web-analytics.png) · [Denied Analytics](screens/web-analytics-denied.png) · [30 days](screens/feature-usage.png) · [Empty at 7 days](screens/feature-usage-empty-range.png) |
| Evaluation questions and job recovery | [Active bank](screens/evaluation-active.png) · [Historical bank](screens/evaluation-historical.png) · [Job after retry](screens/evaluation-jobs.png) |
| Evaluation Idea weights and draft revision | [Linked Ideas and weights](screens/evaluation-idea-weights.png) |
| Admin authoring, recovery and confirmation | [Blog preview](screens/management-blog-preview.png) · [Validation](screens/management-blog-invalid.png) · [Form summary](screens/management-form-summary.png) · [Delete confirmation](screens/management-link-confirmation.png) |
| Short-link copy and QR | [QR dialog](screens/short-links-qr.png) |
| Public blog list, detail, Back and retry | [List](screens/blog-list.png) · [Detail](screens/blog-detail.png) · [Empty category](screens/blog-empty-dark.png) |
| Homepage learning interactions | [Quiz feedback](screens/landing-quiz-feedback.png) · [Flashcard review](screens/landing-flashcard-reviewed.png) · [Mastery profile](screens/landing-mastery-profile.png) |
| Public demo completion, study planning and tryouts | [Lesson progress](screens/demo-progress.png) · [Mastery](screens/demo-mastery.png) · [Study path planning](screens/demo-path-planned.png) · [Tryouts](screens/demo-tryout-list.png) |

The local form case also passed its submission-success assertion. The Web Analytics screenshot shows the 0–800 axis, date labels 19, 21 and 23 November, two curved series, and ranked pages. [Local registration success](screens/cases/operations-public-form-local-submit.png) · [Populated Analytics](screens/web-analytics.png)

The workflow measured 19 comparable viewports, all with nonzero pixel differences. The 20th pair uses a full-page Admin homepage web image taller than the emulator viewport and is recorded as a viewport mismatch. The 380 px full-shell list, detail and English empty blog pairs differ by 180,527, 71,972 and 141,112 of 320,720 pixels respectively. The comparison report records all results, including both browser blog reference variants. [Comparison results](comparison.json) · [Input and diff hashes](comparison-provenance.json)

These results apply to the named Android build, offline fixture data and eight scripted journeys. [iOS simulator captures are available separately](../ios-run-45806987342/README.md).
