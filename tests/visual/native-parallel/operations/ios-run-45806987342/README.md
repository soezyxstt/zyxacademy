# iOS simulator fixture run 45806987342

The iPhone 17 Pro simulator ran commit `72be4055d944352f6bbd67f1f3113e1a66d742d9` at 402 × 874 pt, 3× density, yielding 1206 × 2622 px screenshots. Xcode reported `Build Succeeded` at 12:02:42 UTC, about 53 minutes after the GitHub job started. Maestro began at 12:04 UTC. The 60-minute job budget cancelled capture before the full suite and JUnit report could complete. The artifact uploaded during cleanup and its 18,580,203 bytes match GitHub's SHA-256. [GitHub Actions job](https://github.com/soezyxstt/zyxacademy/actions/runs/45806987342/job/139864730287) · [Original artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45806987342/artifacts/15115168375)

The retained PNGs are 15 byte-for-byte copies of Maestro's raw `takeScreenshot` outputs. All 15 named screenshot commands completed. Ten came from individual cases, whose case-ID assertions completed. The other five came from the Admin Analytics journey, whose recorded steps and assertions completed through the final feature-range checkpoint. The original workflow comparison saw no collected files after cancellation. [PNG provenance, hashes and command traces](provenance.json) · [Registered cases](case-manifest.json) · [Original comparison report](comparison.json)

| Fixture | Simulator captures |
| --- | --- |
| Admin dashboard to Web Analytics, retry and denial | [Populated](screens/web-analytics.png) · [Empty dark](screens/web-analytics-empty-dark.png) · [Access denied](screens/web-analytics-denied.png) |
| Feature usage range change | [Populated 30 days](screens/feature-usage.png) · [Empty 7 days](screens/feature-usage-empty-range.png) |
| Other monitoring cases | [Model configuration](screens/operations-monitoring-admin-ops-models-populated.png) · [Tutor activity access denied](screens/operations-monitoring-admin-ops-tutor-activity-denied.png) |
| Public blog and forms | [Blog detail](screens/operations-public-blog-detail-content.png) · [Initial profile form](screens/operations-public-form-empty.png) |
| Public learning and plans | [Demo course article](screens/operations-public-demo-course-article.png) · [Demo article view](screens/operations-public-demo-view-article.png) · [Plans after retry](screens/operations-public-plans-retry.png) |
| Evaluation and authoring | [Assessments](screens/operations-evaluation-assessments-populated.png) · [Assessment recovery fixture](screens/operations-evaluation-assessment-detail-recovery.png) · [Blog editor](screens/operations-management-blog-id-edit-populated.png) |

The follow-up workflow uploads the three blog checkpoints before the complete fixture suite. It gives the full iOS workflow 150 minutes, handles the URL-scheme prompt once for named cases, and collects partial PNGs after the full suite step. [Early checkpoint workflow](https://github.com/soezyxstt/zyxacademy/commit/faa66261) · [Retention and timing update](https://github.com/soezyxstt/zyxacademy/commit/7000a0d1)
