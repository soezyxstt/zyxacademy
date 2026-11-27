# iOS and web viewport comparisons

Six iPhone 17 Pro simulator captures from artifact `15115168375` match Chromium references on route, locale, theme, shared fixture state, and viewport size. The simulator job ran commit `72be4055d944352f6bbd67f1f3113e1a66d742d9`. The workflow ended before the full fixture suite reported results. The named case assertions and the monitoring journey's screenshot commands completed for these six images. [Device run](../README.md) · [Capture hashes](../provenance.json) · [Pair measurements and trace locations](metrics.json)

Both inputs in each row measure 1206 × 2622 px at 402 × 874 logical pixels and DPR 3. The diffs use each image as captured, including system and navigation chrome. Each pixel counts as different when any absolute RGB channel difference is nonzero.

| Matched state | Locale and theme | Different pixels out of 3,162,132 | Fraction | iOS | Web | Diff |
| --- | --- | ---: | ---: | --- | --- | --- |
| Populated blog article, full marketing shell | Indonesian light | 512,676 | 16.213% | [PNG](../screens/operations-public-blog-detail-content.png) | [PNG](../../references/blog-shell-detail-id-light-402-dpr3.png) | [PNG](blog-detail-full-shell-diff.png) |
| Profile form initial entry | English light | 1,380,225 | 43.649% | [PNG](../screens/operations-public-form-empty.png) | [PNG](../../public-pages/references/form-empty-402-dpr3.png) | [PNG](form-initial-diff.png) |
| Web Analytics, populated 30-day window | Indonesian light | 280,735 | 8.878% | [PNG](../screens/web-analytics.png) | [PNG](../../references/monitoring/web-populated-light-402-dpr3.png) | [PNG](web-analytics-populated-diff.png) |
| Web Analytics, empty 30-day window | Indonesian dark | 179,218 | 5.668% | [PNG](../screens/web-analytics-empty-dark.png) | [PNG](../../references/monitoring/web-empty-dark-402-dpr3.png) | [PNG](web-analytics-empty-dark-diff.png) |
| Feature Usage, populated 30-day range | Indonesian light | 496,287 | 15.695% | [PNG](../screens/feature-usage.png) | [PNG](../../references/monitoring/features-30-days-light-402-dpr3.png) | [PNG](feature-usage-30-days-diff.png) |
| Feature Usage, empty 7-day range | Indonesian light | 257,762 | 8.152% | [PNG](../screens/feature-usage-empty-range.png) | [PNG](../../references/monitoring/features-7-days-direct-light-402-dpr3.png) | [PNG](feature-usage-7-days-empty-diff.png) |

The article title and opening section agree. Its position shifts below the iOS system bar and back link. The form shows the same initial empty fields. Field labels, input spacing, helper text, and the introduction move content lower in Chromium. The populated Web Analytics pair shares 2,524 page views, 321 active users, and 1,103 sessions. The populated Feature Usage pair shares 71 activities, 12 unique students, and 5.9 activities per student. The 7-day capture shows three zero counts after the iOS range selection. Chromium loads that range directly. [Named case manifest](../case-manifest.json) · [Monitoring journey trace](<../traces/Operations Admin home to Web Analytics and access denial/commands.json>) · [Additional Chromium captures](../../references/monitoring/cases-402-dpr3-empty.json)

The artifact contains no Admin home or blog list screenshot. The public demo uses different article data from the browser fixture, and the available Plans capture has no verified matching 402 px reference. The six comparisons measure visual differences in the captured states. Form submission, later builds, and the remaining routes require their own evidence.
