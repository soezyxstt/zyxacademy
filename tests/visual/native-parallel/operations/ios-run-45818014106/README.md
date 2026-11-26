# iOS fixture run 45818014106

Maestro passed **152 of 155 flows** on the iPhone 17 Pro simulator running iOS 26.2. The results include 146 of 147 named cases and six of eight scripted journeys. The suite finished in 27 minutes 30 seconds and recorded **167 of 175 named screenshots**. The job concluded with a failure and uploaded its evidence. [Job](https://github.com/soezyxstt/zyxacademy/actions/runs/45818014106/job/139902653253) · [Artifact 15130240909](https://github.com/soezyxstt/zyxacademy/actions/runs/45818014106/artifacts/15130240909) · [JUnit](report.xml) · [Per-flow results](flows.json)

The job checked out PR merge commit `bedd9d00829760966b4513439e94862f21190c11` with the same source tree as workflow head `717b87e5cc8725e1641a42c620f5ffd9e5f00233`. The subsequent PR head `8910dd4cfdb2b92fd8e1e78e3cf4ca0bd2f17fa4` changes 70 Android evidence and index paths. The native app, fixtures, workflow and Chromium reference files are identical across those heads. [Checkout log](job-excerpt.txt) · [PR head comparison](https://github.com/soezyxstt/zyxacademy/compare/717b87e5cc8725e1641a42c620f5ffd9e5f00233...8910dd4cfdb2b92fd8e1e78e3cf4ca0bd2f17fa4)

The source ZIP's size and SHA-256 matched the GitHub artifact record. The 167 archived PNGs are byte-for-byte copies of the raw Maestro outputs at 1206 × 2622 px. Their index records each original file path, PNG hash, completed screenshot command sequence and matching trace. The separate earlier smoke steps uploaded another artifact in the same job. [PNG archive](named-screens.tar.xz) · [Screenshot and artifact provenance](provenance.json) · [All 155 command traces](flow-traces.tar.xz) · [Named case manifest](case-manifest.json) · [Three smoke checkpoints](../ios-smoke-45818014106/README.md)

## Failure evidence

| Flow | Recorded result | Missing named captures |
| --- | --- | --- |
| Admin home to Web Analytics and access denial | After the row tap, Maestro could not find `Tampilan halaman`. The device remained on Admin home and the analytics row was partly below the viewport. The separately launched Analytics and Feature Usage cases passed. [Simulator PNG](failures/admin-analytics-navigation.png) · [Hierarchy](failures/admin-analytics-navigation.json) | Populated, empty and denied Analytics plus both Feature Usage range screenshots |
| Public demo completion, study planning and tryout list | Maestro stopped at `hideKeyboard` after entering the plan target. The screenshot shows the standard iOS numeric keyboard with no visible dismiss key. Demo Progress and Mastery had already been captured. [Simulator PNG](failures/demo-numeric-keyboard.png) · [Hierarchy](failures/demo-numeric-keyboard.json) | Created study plan and tryout list |
| Public form local submission | Maestro stopped at `hideKeyboard` on the Age field. The iOS numeric keyboard was still open. The flow did not reach the form submission assertion. [Simulator PNG](failures/form-numeric-keyboard.png) · [Hierarchy](failures/form-numeric-keyboard.json) | Local form submission success |

[Failure screenshot and hierarchy hashes](failure-provenance.json) · [Eight missing captures](unrecorded-screens.json)

## Chromium viewport comparisons

Both sides use 402 × 874 logical pixels at density 3. Nine pairs reproduce the CI comparison pixel counts and diff images. Six more pair independently opened device cases with browser fixtures at the same viewport, locale, theme and state. All 15 comparisons use the entire 3,162,132-pixel viewport. The raw RGB pixel count includes layout, typography, chrome, system indicators and fixture text. [CI report](comparison.json) · [All 15 comparisons and input hashes](comparison-provenance.json) · [Per-capture comparison gaps](unmatched-comparisons.json)

| State | Fixture match and visible differences | Different pixels |
| --- | --- | ---: |
| Populated Blog list, full web shell | Same articles. The browser adds a patterned background, stronger category labels and dividers. [Diff](diffs/operations-public-blog-list-open-back-full-shell-diff.png) | 1,807,846 (57.172%) |
| Blog article, full web shell | Same headline and body. Native adds Back and compacts the metadata and sharing controls. [Diff](diffs/operations-public-blog-detail-content-full-shell-diff.png) | 564,284 (17.845%) |
| Empty English Blog category, full web shell | Same empty category and message. The branded web footer uses a taller layout and the dark iOS status indicators have low contrast. [Diff](diffs/operations-public-blog-list-empty-full-shell-diff.png) | 1,289,835 (40.790%) |
| Admin home | Both show the two failed generations alert and common section counts. Native adds a title and refresh control. [Diff](diffs/operations-monitoring-admin-populated-diff.png) | 554,108 (17.523%) |
| Populated Web Analytics, direct case | Same 30-day metrics (2,524 views, 321 active users and 1,103 sessions) and leading pages. Summary rows, chart labels and spacing differ. [Diff](diffs/operations-monitoring-admin-ops-web-analytics-populated-diff.png) | 293,273 (9.275%) |
| Populated Feature Usage, direct case | Same 30-day totals (71 activities and 12 students), 5.9 per student, and Materi as the top feature. The chart scale and layout differ. [Diff](diffs/operations-monitoring-admin-ops-feature-usage-populated-diff.png) | 495,854 (15.681%) |
| Public registration form, initial fields | Both start with the same empty registration fields. Field help, shell and heading layout differ. [Diff](diffs/operations-public-form-empty-diff.png) | 1,379,552 (43.627%) |
| Landing hero, Indonesian | Same headline, description and calls to action. The web viewport includes the graph and the native viewport shows testimonials. The browser manifest records 410 px scroll width at the 402 px viewport. [Diff](diffs/operations-public-hero-id-diff.png) | 1,534,412 (48.525%) |
| Empty public demo, English | Same unavailable message. The web fixture adds View plans and uses a centered layout. [Diff](diffs/operations-public-demo-empty-diff.png) | 1,959,025 (61.953%) |

The comparison index pairs 12 of the 167 captured checkpoints with matching Chromium viewports and records three additional full-shell variants for the same named Blog checkpoints. The gap index identifies the 155 captured checkpoints without a verified same-state Chromium viewport and the eight absent native captures. The form summary is among the unpaired checkpoints. Its 402 px browser capture stopped before saving the reference. [Web evidence and capture commands](../README.md) · [Operations route inventory](../route-evidence.md)
