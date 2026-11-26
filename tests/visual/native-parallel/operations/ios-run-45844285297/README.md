# iOS fixture run 45844285297

Maestro passed **154 of 155 flows** on the iPhone 17 Pro simulator running iOS 26.2. All eight scripted journeys and 146 of 147 named cases passed. The run recorded **174 of 175 named PNGs**. Plans retry was the only failure. [GitHub job](https://github.com/soezyxstt/zyxacademy/actions/runs/45844285297/job/139993782309) · [Artifact 15142415580](https://github.com/soezyxstt/zyxacademy/actions/runs/45844285297/artifacts/15142415580) · [JUnit](report.xml) · [Per-flow index](flows.json)

The job checked out merge commit `af8f5e2f762f5249396671203521abc20542a44e`, with workflow head `332a4d0a34d9349a6d4e255669d85832a8257247` and base `14e95ce3b19f98db79d42724a15bc3bad11c03ca`. This is also the checkout used by the Android job in the same workflow. The Operations feature, fixtures, Maestro journeys, capture scripts and workflow match the workflow head. The merge includes newer shared native code, including Button. [Checkout log](job-excerpt.txt) · [Android result from the same checkout](../android-run-45844285297/README.md)

The 186,084,955-byte ZIP matched the GitHub SHA-256. All 174 named PNGs match raw Maestro output at 1206 × 2622 px. The screenshot index links exact archive members to the original path, completed capture command and trace hash. [PNG archive](named-screens.tar.xz) · [155 command traces](flow-traces.tar.xz) · [Screenshot provenance](provenance.json) · [Fixture manifest](case-manifest.json)

## Previously failing flows

| Flow | Result | Named PNGs in the archive |
| --- | --- | --- |
| Admin home to Web Analytics and access denial | Passed navigation, denial and both Feature Usage ranges | `web-analytics.png`, `web-analytics-empty-dark.png`, `web-analytics-denied.png`, `feature-usage.png`, `feature-usage-empty-range.png` |
| Public demo learning | Passed study plan creation and opened the tryout list | `demo-progress.png`, `demo-mastery.png`, `demo-path-planned.png`, `demo-tryout-list.png` |
| Public form submission | Passed the local registration-success assertion | `cases/operations-public-form-local-submit.png` |

[Earlier iOS failure report](../ios-run-45818014106/README.md) · [This run's flow records](flows.json)

## Plans retry gap

Maestro found the Retry control and requested a tap, then failed the assertion that `public-retry` was no longer visible. The failure PNG shows the pricing error and `Coba lagi` still on screen. No named post-retry PNG was saved. [Failure PNG](failures/plans-retry-still-visible.png) · [Accessibility hierarchy](failures/plans-retry-still-visible.json) · [Missing capture report](unrecorded-screens.json)

XCTest reported tapping the center at (72, 535). BackBoard repeatedly skipped touch packets after reporting a missing touch-down, then canceled an active contact when its digitizer detached. The earlier simulator run reported the same tap coordinate, delivered a UIKit event, and passed the post-retry assertions. These records point to an intermittent simulator touch delivery failure. The current run leaves Plans recovery unverified. [Bounded log excerpts](failures/plans-retry-touch-excerpts.txt) · [Log source and line provenance](failures/plans-retry-touch-provenance.json)

## Chromium viewport comparisons

There are **19 measured pairs across 16 device checkpoints** at 402 × 874 logical pixels and density 3. Nine reproduce CI pixel for pixel. Ten pair existing 402 px Chromium fixtures with the same iOS route, state, locale and theme, including four Analytics and Feature Usage journey checkpoints. All use the full 3,162,132-pixel viewport. [CI comparator report](comparison.json) · [All comparison inputs, differences and hashes](comparison-provenance.json)

| State | Different pixels |
| --- | ---: |
| Populated Blog list with full web shell | 1,807,955 (57.175%) |
| Blog article with full web shell | 564,393 (17.848%) |
| Empty English Blog category with full web shell | 1,289,830 (40.790%) |
| Web Analytics after Admin navigation, populated | 293,637 (9.286%) |
| Web Analytics, empty dark | 178,927 (5.658%) |
| Feature Usage, populated 30-day range | 495,997 (15.686%) |
| Feature Usage, empty 7-day range | 257,127 (8.131%) |

The gap index identifies **158 captured checkpoints** without a verified same-state Chromium viewport and the single missing native Plans retry checkpoint. The browser references for study plan, tryout list, form submission success, access denial and management form summary do not provide matching 402 × 874 DPR 3 states. [Per-checkpoint gaps](unmatched-comparisons.json)
