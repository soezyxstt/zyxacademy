# Android blog and full marketing shell

The three Android captures come from the successful named cases in run `45806987342` at SHA `72be4055d944352f6bbd67f1f3113e1a66d742d9`. They are the initial screens from the [named screenshot archive](../named-screens.tar.xz). The Chromium references render the original Next.js marketing shell with the fixture blog repository and a guest session. The case manifest and web manifest agree on route, fixture state, locale, and theme. [Android provenance](../provenance.json) · [Android case manifest](../case-manifest.json) · [Web manifest](../../references/manifest-blog-shell.json)

Both images in each pair are 380 × 844 px at density 1. Each diff shows the absolute per-channel RGB difference across the full viewport, including the Android system bars and both navigation headers. A pixel counts as different when any channel differs. The source PNGs, diffs, and capture revisions are pinned by hashes in the [measurements](metrics.json).

| State | Different pixels out of 320,720 | Fraction | Web | Diff |
| --- | ---: | ---: | --- | --- |
| Populated list, Indonesian light | 185,269 | 57.767% | [PNG](../../references/blog-shell-list-id-light-380-dpr1.png) | [PNG](blog-list-full-shell-diff.png) |
| Article detail, Indonesian light | 71,431 | 22.272% | [PNG](../../references/blog-shell-detail-id-light-380-dpr1.png) | [PNG](blog-detail-full-shell-diff.png) |
| Empty Zyx Activities category, English dark | 141,592 | 44.148% | [PNG](../../references/blog-shell-empty-en-dark-380-dpr1.png) | [PNG](blog-empty-en-full-shell-diff.png) |

The list shows the same article titles and categories. The native header uses a text wordmark and a menu button, and the native list uses a plain background. The web shell adds a logo, search, and sign-in controls above a patterned background. In the detail view, the native back link and system bars push the article title down. Native exposes system sharing, and web shows a copyable link with share controls. In the empty state, both surfaces show “No articles yet.” The native screen shows three footer links. The web shell shows a brand description and grouped links.

These measurements establish visible differences for this Android revision. The mounted list capture records the initial state. The separate scripted journey records navigation, Back, and retry. The run retains its [shell-less comparisons](../README.md#whole-viewport-comparisons). The workflow pairs future Android and iOS named cases with the full-shell references at their configured density, using a separate `-full-shell-diff.png` path for each image.
