# Android fixture run 45844285297

Maestro passed **154 of 155 flows** on Android API 35 at 380 × 844 px and 1 px/dp. All 147 registered cases and seven of eight scripted journeys passed. All **175 of 175 named screenshots** were saved. The single failed journey had already captured the question editor before trying to save. [GitHub job](https://github.com/soezyxstt/zyxacademy/actions/runs/45844285297/job/139993782350) · [Artifact 15133795411](https://github.com/soezyxstt/zyxacademy/actions/runs/45844285297/artifacts/15133795411) · [JUnit](report.xml) · [Six batch reports](reports)

The build checked out merge commit `af8f5e2f762f5249396671203521abc20542a44e`, from workflow head `332a4d0a34d9349a6d4e255669d85832a8257247` and base `14e95ce3b19f98db79d42724a15bc3bad11c03ca`. The Operations feature, fixture cases, Maestro journeys, capture scripts, and workflow match the workflow head. The actual merge tree includes newer shared native code, including Button. [Checkout log](job-excerpt.txt) · [Build, artifact and PNG provenance](provenance.json)

The 16,574,220-byte ZIP matched GitHub's SHA-256. Each retained named PNG matches the raw Maestro screenshot command output byte for byte. The per-flow index records the original JUnit attributes, batch, fixture case, screenshot slots and trace hash. [Raw PNG archive](named-screens.tar.xz) · [All 155 command traces](flow-traces.tar.xz) · [Per-flow index](flows.json) · [Registered case manifest](case-manifest.json)

## Failed Idea draft journey

Maestro added a second Idea, verified two linked Ideas and 100% readiness, and saved `evaluation-idea-weights.png`. It then attempted to tap `Simpan draft` and timed out waiting for `Perubahan disimpan sebagai draf.` The failure screenshot shows the scroll view still in the editor. The hierarchy places the save labels between y=820 and y=840, at the bottom edge of the 844-pixel viewport. These records confirm the pre-save state and leave the draft-save outcome unverified. [Failure PNG](failure/draft-confirmation.png) · [Accessibility hierarchy](failure/draft-confirmation.json) · [Failure hashes](failure-provenance.json)

The Admin home journey reached Web Analytics, denial and both Feature Usage range captures. The public demo reached its saved study plan and tryout list, and the public registration form reached the local submission-success assertion. Find their named PNGs in the archive using the per-flow index.

## Chromium viewport comparisons

The archived results include **20 measured pairs across 17 captured checkpoints** at 380 × 844 px. Nineteen CI differences reproduced pixel for pixel. The English dark public demo adds a matched viewport for the unavailable state. Both show the same message and sign-up action. The web centers the content and includes View plans. Every measured pair has nonzero differences across the full 320,720-pixel viewport. [Comparison results and hashes](comparison-provenance.json) · [CI comparator output](comparison.json) · [Empty demo diff](diffs/operations-public-demo-empty-diff.png)

| State | Different pixels |
| --- | ---: |
| Populated Blog list with full web shell | 180,534 (56.290%) |
| Blog article with full web shell | 71,979 (22.443%) |
| Empty English Blog category with full web shell | 141,117 (44.000%) |
| Populated Web Analytics reached from Admin home | 46,343 (14.450%) |
| Populated 30-day Feature Usage in the Admin journey | 65,955 (20.565%) |
| Empty 7-day Feature Usage in the Admin journey | 43,429 (13.541%) |
| Empty public demo | 199,172 (62.102%) |

The gap index identifies **158 captured checkpoints** without a verified same-state browser viewport. The 380 px Admin home reference is a 1,692 px tall full-page capture. The browser's public registration success screenshot contains an uploaded PDF and a different scroll position from the native fixture. Both raw Android screenshots remain available. [Per-checkpoint comparison gaps](unmatched-comparisons.json) · [Operations route evidence](../route-evidence.md)
