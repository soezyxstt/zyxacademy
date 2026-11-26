# Operations route evidence

The [owner inventory](../../../../plans/native-parallel/routes.tsv) assigns 49 patterns to Operations. The [scenario registry](../../../../packages/native-parity/operations/scenarios.tsv) names three cases per pattern. In the table, prefix each case suffix with `operations-` and the area, such as `operations-public-demo-view-article`. Case names describe intended fixture coverage.

All 147 named cases have a mount-time Android diagnostic from [run 45801930588](android-run-45801930588/README.md), at SHA `316a34996a15c60307272bd10ca9f5bac4e868dc`, Android API 35, 380 × 844, density 160. The [flow index](android-run-45801930588/flows.json) gives each case ID, visible labels, failed command and PNG hash. PNGs are available at `cases/<caseId>.png` in the [archive](android-run-45801930588/diagnostic-screens.tar.xz). The four scripted journeys failed before capturing a page state. The case flows reached `takeScreenshot`, which rejected its destination and still produced diagnostics.

Web evidence comes from isolated local Chromium harnesses. The table identifies saved screenshots and the recorded browser alias outcomes. Alias destinations are local fixtures. The alias runs verified status, redirect target and Back. [Alias manifest](references/evaluation/legacy-browser.json)

Two blog states have [measured web and Android differences](android-run-45801930588/diff/metrics.json). Full interaction coverage, visual parity and iOS rendering remain unverified.

| Owned route | Area | Case suffixes | Historical Android observations | Saved web evidence |
| --- | --- | --- | --- | --- |
| `/admin/assessments/[id]` | evaluation | `assessment-detail-populated`, `assessment-detail-alternate`, `assessment-detail-recovery` | screen or fixture state, not found or denied | [Status, location and Back](references/evaluation/legacy-browser.json) |
| `/admin/assessments` | evaluation | `assessments-populated`, `assessments-alternate`, `assessments-recovery` | screen or fixture state, not found or denied | [Status, location and Back](references/evaluation/legacy-browser.json) |
| `/admin/ast-inspector` | evaluation | `ast-inspector-populated`, `ast-inspector-alternate`, `ast-inspector-recovery` | screen or fixture state | [AST tabs](references/evaluation/cases.json) |
| `/admin/diktats` | evaluation | `diktats-populated`, `diktats-alternate`, `diktats-recovery` | route handoff placeholder, not found or denied | [Status, location and Back](references/evaluation/legacy-browser.json) |
| `/admin/distractors` | evaluation | `distractors-populated`, `distractors-alternate`, `distractors-recovery` | screen or fixture state | Pending |
| `/admin/jobs` | evaluation | `jobs-populated`, `jobs-alternate`, `jobs-recovery` | screen or fixture state | [Generation form, empty and completed](references/evaluation/cases.json) |
| `/admin/leaderboard` | evaluation | `leaderboard-populated`, `leaderboard-alternate`, `leaderboard-recovery` | route handoff placeholder, screen or fixture state | [Status, location and Back](references/evaluation/legacy-browser.json) |
| `/admin/questions` | evaluation | `questions-populated`, `questions-alternate`, `questions-recovery` | screen or fixture state | [Production Idea widget with local fixtures](references/evaluation/ideas/cases.json) |
| `/admin/quiz-insights/[id]` | evaluation | `quiz-insight-populated`, `quiz-insight-alternate`, `quiz-insight-recovery` | route handoff placeholder, not found or denied, screen or fixture state | [Status, location and Back](references/evaluation/legacy-browser.json) |
| `/admin/quiz-insights` | evaluation | `quiz-insights-populated`, `quiz-insights-alternate`, `quiz-insights-recovery` | route handoff placeholder, screen or fixture state | [Status, location and Back](references/evaluation/legacy-browser.json) |
| `/admin/quizzes/[id]/edit` | evaluation | `quiz-edit-populated`, `quiz-edit-alternate`, `quiz-edit-recovery` | route handoff placeholder, not found or denied, access redirect to public landing | [Status, location and Back](references/evaluation/legacy-browser.json) |
| `/admin/quizzes/new` | evaluation | `quiz-new-populated`, `quiz-new-alternate`, `quiz-new-recovery` | route handoff placeholder, access redirect to public landing | [Status, location and Back](references/evaluation/legacy-browser.json) |
| `/admin/quizzes` | evaluation | `quizzes-populated`, `quizzes-alternate`, `quizzes-recovery` | route handoff placeholder, access redirect to public landing | [Status, location and Back](references/evaluation/legacy-browser.json) |
| `/admin/blog/[id]/edit` | management | `blog-id-edit-populated`, `blog-id-edit-empty`, `blog-id-edit-recoverable-error` | screen or fixture state | Pending |
| `/admin/blog/new` | management | `blog-new-populated`, `blog-new-empty`, `blog-new-recoverable-error` | screen or fixture state | Pending |
| `/admin/blog` | management | `blog-populated`, `blog-empty`, `blog-recoverable-error` | screen or fixture state | Pending |
| `/admin/discussions` | management | `discussions-populated`, `discussions-empty`, `discussions-recoverable-error` | screen or fixture state | Pending |
| `/admin/docs/[slug]` | management | `docs-slug-populated`, `docs-slug-empty`, `docs-slug-recoverable-error` | screen or fixture state | [Docs article](references/management-docs-detail-380-dpr1.png) |
| `/admin/docs` | management | `docs-populated`, `docs-empty`, `docs-recoverable-error` | screen or fixture state | [Docs list](references/management-docs-list-380-dpr1.png) |
| `/admin/forms/[id]` | management | `forms-id-populated`, `forms-id-empty`, `forms-id-recoverable-error` | screen or fixture state | [Responses summary](references/management-form-summary-380-dpr1.png) |
| `/admin/forms` | management | `forms-populated`, `forms-empty`, `forms-recoverable-error` | screen or fixture state | [Builder](references/management-form-builder-380-dpr1.png) and [empty list](references/management-form-list-empty-380-dpr1.png). Populated list timed out. |
| `/admin/media` | management | `media-populated`, `media-empty`, `media-recoverable-error` | screen or fixture state | Pending |
| `/admin/meet/[id]` | management | `meet-id-populated`, `meet-id-empty`, `meet-id-recoverable-error` | screen or fixture state | Pending |
| `/admin/meet` | management | `meet-populated`, `meet-empty`, `meet-recoverable-error` | screen or fixture state | Pending |
| `/admin/ops/analytics` | monitoring | `admin-ops-analytics-populated`, `admin-ops-analytics-retry`, `admin-ops-analytics-denied` | screen or fixture state | Pending |
| `/admin/ops/feature-usage` | monitoring | `admin-ops-feature-usage-populated`, `admin-ops-feature-usage-retry`, `admin-ops-feature-usage-denied` | screen or fixture state | [Range navigation](references/monitoring/feature-range-flow-results.json) and [direct empty](references/monitoring/feature-empty-direct-light-380.png) |
| `/admin/ops/keys` | monitoring | `admin-ops-keys-populated`, `admin-ops-keys-retry`, `admin-ops-keys-denied` | screen or fixture state | Pending |
| `/admin/ops/models` | monitoring | `admin-ops-models-populated`, `admin-ops-models-retry`, `admin-ops-models-denied` | screen or fixture state | Pending |
| `/admin/ops/offline` | monitoring | `admin-ops-offline-populated`, `admin-ops-offline-retry`, `admin-ops-offline-denied` | screen or fixture state | Pending |
| `/admin/ops` | monitoring | `admin-ops-populated`, `admin-ops-retry`, `admin-ops-denied` | screen or fixture state | Pending |
| `/admin/ops/short-links` | monitoring | `admin-ops-short-links-populated`, `admin-ops-short-links-retry`, `admin-ops-short-links-denied` | screen or fixture state | Pending |
| `/admin/ops/tutor-activity` | monitoring | `admin-ops-tutor-activity-populated`, `admin-ops-tutor-activity-retry`, `admin-ops-tutor-activity-denied` | screen or fixture state | Pending |
| `/admin/ops/web-analytics` | monitoring | `admin-ops-web-analytics-populated`, `admin-ops-web-analytics-retry`, `admin-ops-web-analytics-denied` | screen or fixture state | [Populated](references/analytics-data-light.png), [empty](references/analytics-empty-light.png), [unavailable](references/analytics-unavailable-light.png) |
| `/admin` | monitoring | `admin-populated`, `admin-retry`, `admin-denied` | screen or fixture state | [Dashboard](references/monitoring/home-populated-light-380.png) |
| `/admin/pricing` | management | `pricing-populated`, `pricing-empty`, `pricing-recoverable-error` | screen or fixture state | Pending |
| `/admin/tautan` | management | `tautan-populated`, `tautan-empty`, `tautan-recoverable-error` | screen or fixture state | Pending |
| `/about` | public | `founders-id`, `long-copy-en`, `portfolio` | screen or fixture state | [Founders](public-pages/references/founders-id-380-dpr1.png), [English copy](public-pages/references/long-copy-en-380-dpr1.png), [portfolio](public-pages/references/portfolio-380-dpr1.png) |
| `/blog/[slug]` | public | `blog-detail-content`, `blog-detail-missing`, `blog-detail-retry` | screen or fixture state | [Populated](references/blog-detail-light-380-dpr1.png) |
| `/blog` | public | `blog-list-open-back`, `blog-list-empty`, `blog-list-retry` | screen or fixture state | [Populated](references/blog-list-light-380-dpr1.png), [empty](references/blog-empty-dark-en-380-dpr1.png), [Back](references/blog-back-light.png) |
| `/demo/[view]` | public | `demo-view-article`, `demo-view-missing`, `demo-view-quiz` | screen or fixture state | [demo-view-article-1536-dpr1](public-pages/references/demo-view-article-1536-dpr1.png), [demo-view-article-380-dpr1](public-pages/references/demo-view-article-380-dpr1.png) |
| `/demo` | public | `demo-course-article`, `demo-empty`, `demo-retry` | screen or fixture state | [demo-course-article-1536-dpr1](public-pages/references/demo-course-article-1536-dpr1.png), [demo-course-article-380-dpr1](public-pages/references/demo-course-article-380-dpr1.png), [demo-empty-1536-dpr1](public-pages/references/demo-empty-1536-dpr1.png), [demo-empty-380-dpr1](public-pages/references/demo-empty-380-dpr1.png), [demo-retry-1536-dpr1](public-pages/references/demo-retry-1536-dpr1.png), [demo-retry-380-dpr1](public-pages/references/demo-retry-380-dpr1.png) |
| `/download` | public | `download-platforms`, `download-empty`, `download-retry` | screen or fixture state | [Platforms](public-pages/references/download-platforms-380-dpr1.png), [empty](public-pages/references/download-empty-380-dpr1.png), [error](public-pages/references/download-retry-380-dpr1.png) |
| `/forms-playground` | public | `form-empty`, `form-validation`, `form-local-submit` | screen or fixture state | [Entry](public-pages/references/form-empty-380-dpr1.png), [validation](public-pages/references/form-validation-380-dpr1.png), [local submit](public-pages/references/form-local-submit-380-dpr1.png) |
| `/` | public | `hero-id`, `english-faq`, `demo-link` | screen or fixture state | [Hero](public-pages/references/hero-id-380-dpr1.png), [English FAQ](public-pages/references/english-faq-380-dpr1.png), [demo link](public-pages/references/demo-link-380-dpr1.png) |
| `/plans` | public | `plans-default`, `plans-course-limits`, `plans-retry` | screen or fixture state | [Loaded prices](public-pages/references/manifest-plans-prices.json) |
| `/privacy` | public | `privacy-id`, `privacy-en-anchor`, `privacy-terms-link` | screen or fixture state | [Initial server render](public-pages/references/ssr-privacy-380-dpr1.png) |
| `/terms` | public | `terms-id`, `terms-en-anchor`, `terms-privacy-link` | screen or fixture state | [Initial server render](public-pages/references/ssr-terms-380-dpr1.png) |
| `/testimonial` | public | `testimonial-list`, `testimonial-dark-en`, `testimonial-plans` | screen or fixture state | [Initial server render](public-pages/references/ssr-testimonial-380-dpr1.png) |
| `/unsubscribe` | public | `unsubscribe-confirm`, `unsubscribe-invalid`, `unsubscribe-retry` | screen or fixture state | [Initial server render](public-pages/references/ssr-unsubscribe-380-dpr1.png) |
