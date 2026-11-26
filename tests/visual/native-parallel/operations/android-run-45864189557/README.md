# Android fixture run 45864189557

Maestro passed **154 of 155 flows** on Android API 35 at 380 × 844 px and 1 px/dp. All eight scripted journeys and 146 of 147 registered cases passed. The job saved **174 of 175 named screenshots**. The local form submission case accounts for the sole final error and missing screenshot. [GitHub job](https://github.com/soezyxstt/zyxacademy/actions/runs/45864189557/job/140062654565) · [Artifact 15140539093](https://github.com/soezyxstt/zyxacademy/actions/runs/45864189557/artifacts/15140539093) · [JUnit](report.xml) · [Batch and retry reports](reports)

The job checked out merge commit `74ff22df2b67a6f877fe9f5767e8820c655b8e1c`, with workflow head `6fda5518d1e845b19d54e5e50ee9c1381b0a3d1b` and base `8a1a516c0327582c09f7f0e1a54aab5b8233f5c4`. The Operations feature, fixtures, Maestro journeys, capture workflow and browser references match the workflow head. The merge tree includes newer shared code. The 16,362,392-byte ZIP passed CRC validation and matched GitHub's SHA-256. [Checkout excerpt](job-excerpt.txt) · [Build, artifact and PNG provenance](provenance.json)

The PNG archive preserves the original completed Maestro screenshots byte for byte. The flow index maps all 155 final JUnit results to their individual traces, and the trace archive preserves 173 attempts, including 18 first attempts superseded by a retry. [Raw PNG archive](named-screens.tar.xz) · [Command traces](flow-traces.tar.xz) · [Per-flow index](flows.json) · [Registered case manifest](case-manifest.json)

## Form transport error and recovered journeys

`operations-public-form-local-submit` opened the fixture and completed the case-ID assertion. Its email input command was still marked `RUNNING` when the Maestro device server died on `viewHierarchy` with gRPC `UNAVAILABLE`. The trace has no completed submission or success assertion. No failure screenshot or hierarchy was retained. The per-case log ends before the exception, which is recorded in JUnit. The run's retry selector looked for `device offline` in each flow's own log. It retried the 17 later cases, which all passed, and did not select the form case. [Form command trace](failure/public-form-transport-commands.json) · [Maestro log](failure/public-form-transport-maestro.log) · [Batch JUnit](reports/04-cases.xml) · [Failure provenance](failure-provenance.json)

The Admin home journey recovered from an offline emulator at launch. The retry completed Web Analytics, denial, and both Feature Usage ranges and retained five screenshots. The Idea draft journey captured two linked Ideas and 100% readiness before the save action, then completed the draft confirmation assertion `Perubahan disimpan sebagai draf.` Both results are in the final trace index. [Initial Admin attempt](failure/admin-launch-offline-commands.json) · [Admin retry JUnit](reports/00-journeys-retry.xml) · [Per-flow index](flows.json)

## Chromium viewport comparisons

The archive records **20 measured pairs from 17 Android checkpoints** using 380 × 844 px whole viewports at 1 px/dp. The 19 CI diff images reproduce pixel for pixel. The additional English dark demo pairing shows the same unavailable message and sign-up action. Both images in each pair keep their full viewport, including platform chrome where present. The comparison records nonzero RGB differences out of 320,720 pixels. [Comparison metrics and provenance](comparison-provenance.json) · [CI comparator output](comparison.json) · [Empty demo diff](diffs/operations-public-demo-empty-diff.png)

| State | Different pixels |
| --- | ---: |
| Populated Blog list with web marketing layout | 180,533 (56.290%) |
| Blog article with web marketing layout | 71,978 (22.443%) |
| Empty English Blog category with web marketing layout | 141,118 (44.000%) |
| Populated Web Analytics reached from Admin home | 49,333 (15.382%) |
| Populated 30-day Feature Usage in the Admin journey | 66,013 (20.583%) |
| Empty 7-day Feature Usage in the Admin journey | 43,459 (13.550%) |
| Empty public demo | 199,172 (62.102%) |

The gap index identifies **157 captured checkpoints** without a verified same-state browser viewport. It includes Admin home because the 380 px Chromium source is a 1,692 px tall full-page capture. The form submission has no Android screenshot in this run. [Per-checkpoint comparison gaps](unmatched-comparisons.json) · [Missing captures](missing-captures.json)
