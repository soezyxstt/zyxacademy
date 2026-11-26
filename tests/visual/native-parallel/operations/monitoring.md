# Monitoring web references

Run the shared, isolated Next fixture from the repository root, then start the monitoring capture on the same server.

```sh
NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next dev tests/visual/native-parallel/operations --webpack -p 3211
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --import tsx tests/visual/native-parallel/operations/capture-monitoring.ts
```

`PARITY_MONITORING_SCREENS=features,home,web` restricts and orders the routes. `PARITY_MONITORING_CASES=features-7-days-empty` selects a scenario. `PARITY_MONITORING_WIDTHS=380` runs the mobile CSS layout only.

The web fixture uses the Admin dashboard components, Web Analytics projection, Feature Usage overview and range selector, Ops monitor, AI analytics, key diagnostics, model settings, offline settings and Short Links components from the real web application. The tutor activity fixture composes the real filters and activity table with the synthetic data. The full authenticated layout, live providers and live server actions are outside this fixture. The scripts use the same synthetic dataset as the native harness, enforce a localhost origin and fulfill the expected API reads locally. They block external requests and mutations, including provider access. The fixture isolates the command menu and model server-action imports at compilation. The browser clock is fixed, the locale is id-ID and the timezone is Asia/Jakarta. Full-page and fixed-viewport screenshots are written with test results under `artifacts/native-parity/operations-web/monitoring/`.

| Web reference | Scenarios | Comparable native entry |
| --- | --- | --- |
| Admin home | Failed job alert, no failed jobs, first analytics destination and keyboard focus | `/admin` and the failed-jobs and populated dashboard fixtures |
| Web Analytics | Populated with two curves, empty, provider unavailable | `/admin/ops/web-analytics`, populated and empty modes, or provider-null fixture injection |
| Feature usage | Default 30 days, select 7 days with no activity, select 90 days | `/admin/ops/feature-usage`, range query and range selector |
| Ops monitor | Populated, synthetic transient read error, successful retry | `/admin/ops`, modes populated or recoverable |
| AI analytics | Populated, Gateway sample filter, empty sample and usage | `/admin/ops/analytics`, mode populated or empty, Gateway filter |
| Key diagnostics | Masked healthy and degraded aliases, synthetic read error, retry | `/admin/ops/keys`, modes populated or recoverable |
| Model settings | Feature list, Zyra tab, embedding profiles | `/admin/ops/models` and matching tabs |
| Tutor activity | Populated, real log detail dialog, empty | `/admin/ops/tutor-activity` and matching modes |
| Offline settings | Current policy, draft edits, synthetic read error followed by retry | `/admin/ops/offline`, policy draft and recoverable mode |
| Short Links | Populated, QR dialog, empty | `/admin/ops/short-links`; the QR capability remains a host dependency |

The browser fixtures exercise selected interactions and visual states. Canonical role authorization and denied requests are verified by the local integration tests in the [monitoring handoff](../../../../packages/native-parity/operations/monitoring.md). Android and iOS device results and pixel diffs remain pending.

## Recorded results

Four populated dashboard references at 380×844 and 1536×864, DPR 1, passed their link destination and alert checks and were opened for inspection. They show responsive section and row layout, with Web Analytics first in the analytics group. They were captured against the workspace based on `a9f4221549a52442dae9eaccfd78f0abb240a2a5`. [Dashboard PNGs](references/monitoring)

The Web Analytics component has an independently captured populated, empty and unavailable set in both themes at 380 CSS px. That runner verified two populated chart curves and the page width. [Analytics references and reproduction](README.md)

The focused 7-day Feature Usage URL returned HTTP 200 and rendered the selected range, three zero metrics and the empty chart state at 380×844, DPR 1, in light theme. The screenshot was opened for inspection. The complete selector-click matrix did not finish. The shared Next dev runner initially hit an unrelated native dependency import, then intermittent client-mount timeouts during sibling route recompiles. The other scenarios remain reproducible in the harness, with outcomes pending. [Seven-day feature reference](references/monitoring/feature-empty-direct-light-380.png)

A follow-up on a dedicated local Next server passed the 380×844 light-theme range journey on one browser page. The real selector moved from the default 30 days to 7 empty days and then to 90 populated days. The two selected URLs carried the expected `range` query, the populated chart had visible bars, the empty state appeared, and Playwright recorded no unexpected HTTP, runtime, console or horizontal-overflow errors. The 30-day dark view also passed as a separate checkpoint. All four viewport screenshots were opened for inspection. The full light/dark desktop and remaining secondary-route matrix is still incomplete. [Range journey results and PNGs](references/monitoring/feature-range-flow-results.json)
