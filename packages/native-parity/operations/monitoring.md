# Operations monitoring

The entry is `apps/mobile-native/features/operations/monitoring/index.tsx`. The integrator passes the route, current access, an account/session/origin key, locale, navigation and a read adapter. `createSessionMonitoringReader(session, locale)` binds requests to the existing origin-scoped transport. `createSessionMonitoringActions(session)` supplies short-link creation, offline policy save and offline revalidation. Device clipboard and QR rendering use the optional `links` capability.

`createMonitoringFixture` supplies isolated synthetic state, one transient failure, empty, unavailable and denied fixtures. `monitoringCases` lists three stable named cases per route. The Admin Maestro flow mounts the same entry and covers dashboard navigation, web analytics states, retry and the feature-usage range selector.

## Routes and operations

Every Admin screen requires the canonical Admin role. The operations read adapter provisions first-use legacy identity through the same helper as the web layout and uses the current canonical role for the authorization decision. HTTP 401 and 403 clear the relevant view. Read errors retry their original view, range, filter or cursor. The enclosing account key discards UI state when its account, session or origin changes. The native transport rejects redirects and releases unread responses.

| Route and native entry | Existing source and native binding | Local cases |
| --- | --- | --- |
| `/admin`, `HomeDashboardScreen` | Both clients use `getAdminHomeDashboard`. Existing category order, live counts and failed job shortcut. Native analytics sync is an optional callback. | Populated home, recoverable read, denied |
| `/admin/ops/web-analytics`, `WebAnalyticsScreen` | `getDashboardMetrics(30)` for GA4 aggregates and top pages. Distinct zero traffic and provider-unavailable states. Local read retry. Analytics sync callback maps to existing `POST /api/admin/analytics/sync` when supplied. | Populated, zero traffic, unavailable, recoverable read, denied |
| `/admin/ops`, `OpsMonitorScreen` | Reuses existing Ops, Zyra metrics and proposal list endpoints under the Admin screen gate. Ops polls every 60 seconds in the foreground. Provider capacity retains masked aliases and its existing external-usage qualifier. Zyra proposal mutations use callbacks. | Populated, recoverable read, denied |
| `/admin/ops/analytics`, `AiAnalyticsScreen` | Reuses existing server-process request sample and date-bounded AI usage endpoints under the Admin screen gate. Samples poll every 30 seconds in the foreground. All/failed/gateway filters apply only to sample calls. The 7/30/90-day per-user totals and sample gateway share retain their separate scopes. | Populated, empty range, filtered logs, recoverable read, denied |
| `/admin/ops/feature-usage`, `FeatureUsageScreen` | `getFeatureUsageMetrics` with the web 7/30/90-day parser, learner scope, activity trends and zero-data semantics. | Populated, empty range, recoverable read, denied |
| `/admin/ops/tutor-activity`, `TutorActivityScreen` | Existing stats, filter options, cursor pagination and detail queries. Includes ID, date, tutor, course, entity, action and outcome filters. Audit detail presents sanitized before/after snapshots. | Populated, filtered result, next cursor, recoverable read, denied |
| `/admin/ops/keys`, `KeyDiagnosticsScreen` | Existing diagnostics endpoint with canonical Admin precheck. It displays masked aliases and circuit/usage status. Diagnostics poll every 30 seconds in the foreground. | Healthy and degraded aliases, recoverable read, denied |
| `/admin/ops/models`, `ModelsScreen` | `listModelSettingViews` and the existing embedding registry. Feature/group/status/search filters and prior-revision precondition. Save/reset and latency measurement use callbacks. | Populated, reordered local model, revision conflict, recoverable read, denied |
| `/admin/ops/offline`, `OfflineCacheScreen` | Existing policy and catalog GET, revision-checked policy PATCH, and scope-checked revalidation POST. The native adapter supplies the bound session/account headers and same-origin request header for writes. | Populated, local draft and conflict, recoverable read, denied |
| `/admin/ops/short-links`, `ShortLinksScreen` | Existing canonical Admin list. The native creation route adds same-origin and destination/slug validation before calling the existing handler. Copy and QR require host capabilities. | Populated, empty, local creation and duplicate slug, recoverable read, denied |

Native sync, AI model saves/resets/latency refresh and Zyra proposal mutations require integrator bindings to the existing web workflows. Fixture mutations exercise the order and stale revision handling. Native QR/clipboard and visual parity require device checks. No global telemetry is emitted from these screens. GA4 web visits, database learner activity, per-user Zyra token usage and sampled provider requests remain independent sources.

The native operations adapter uses the current session and role. It adds no MCP capability, scope, consent, account binding or environment redirect. The operations catalog associates the new short-link route with the existing `shortlinks.create` tool, which keeps its request-key contract. No live service or real mutation was tested.

## Verification

- `bun test packages/native-parity/operations/monitoring.test.mjs tests/contracts/admin-cp5-authoring-retirement.test.ts tests/contracts/admin-mcp-catalog.test.ts`
- `bun tests/integration/operations-admin-access.ts` and `bun tests/integration/operations-admin-handlers.mjs` use synthetic local PostgreSQL and synthetic external provider responses.
- `bun tests/integration/operations-monitoring-write.mjs` uses a synthetic delegate to verify short-link authorization, origin and input validation.
- `npm --prefix apps/mobile-native run typecheck`
- `.maestro/native-parallel/operations/admin-analytics.yaml` is the device scenario. Android/iOS device execution and pixel diffs remain pending.
