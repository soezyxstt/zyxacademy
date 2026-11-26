# Supplemental comparisons for Android run 45801930588

The Android API 35 emulator captured these three initial fixture states on commit `316a34996a15c60307272bd10ca9f5bac4e868dc`. The case assertions completed and the named screenshot command then failed. The Android inputs are the diagnostic images saved by Maestro at that failure. [Run and provenance](../README.md) · [Original artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45801930588/artifacts/15109186646)

The browser and device images have the same route, fixture state, locale, theme and 380 × 844 px viewport at density 1. Both show the first viewport at scroll position zero. Each raw diff is the absolute difference in all three RGB channels, with no scaling, crop or offset adjustment. A pixel counts as different when any channel differs. The metrics include each input's revision, SHA-256 and diagnostic trace. [Machine-readable measurements](metrics.json)

| Fixture | Different pixels | Android | Web | Diff |
| --- | ---: | --- | --- | --- |
| English dark blog, empty Zyx Activities category | 131,342 / 320,720 (40.952%) | [PNG](../screens/blog-empty-en.png) | [PNG](../../references/blog-empty-dark-en-380-dpr1.png) | [PNG](blog-empty-en-diff.png) |
| Indonesian light Web Analytics, populated | 44,845 / 320,720 (13.983%) | [PNG](../screens/analytics-populated.png) | [PNG](../../references/monitoring/web-analytics-populated-light-380-viewport.png) | [PNG](analytics-populated-diff.png) |
| Indonesian light question-generation jobs, completed | 46,126 / 320,720 (14.382%) | [PNG](../screens/jobs.png) | [PNG](../../references/evaluation/jobs-completed-light-380-viewport-utc.png) | [PNG](jobs-completed-diff.png) |

- The English blog images both show the empty category. Android carries its own navigation, header and bottom bar. Web has the patterned page background and a different category layout. [Android trace](blog-empty-en/commands.json) · [Screen hierarchy](blog-empty-en/screen-hierarchy.json)
- Web Analytics shares the fixture's totals of 2,524 views, 321 active users and 1,103 sessions. The historical Android chart has a different scale, line shape and date sampling. The web screen shows numbered top pages. [Android trace](analytics-populated/commands.json) · [Web capture metadata](../../references/monitoring/web-analytics-populated-light-380-viewport.json)
- The question generation screens show the same completed job, chapter and two progress records. Both display the job time as 04.30 UTC. The browser reference was made with the web server and browser in UTC. Android shows a differently spaced, expanded job card. [Android trace](jobs-completed/commands.json) · [Web capture metadata](../../references/evaluation/jobs-completed-light-380-viewport-utc.json)

These measurements describe the historical run and its browser references. Current device behavior, iOS rendering and interaction journeys require results from their own runs.
