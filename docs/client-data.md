# Browser data ownership

Status: ACTIVE implementation contract. Deployment acceptance is tracked separately in [the migration audit](audit/client-data-20261117.md).

## Ownership

TanStack Query owns reusable server data that client components must refresh, share, poll or invalidate. Server Components still load initial course pages, entitled learning content, assessments and read-only catalogues. Do not replace a direct server database read with a browser request merely to use Query.

React state owns drafts, selected questions, timers, uploads, opened panels and in-progress flashcard queues. URL parameters own shareable filters and navigation. Query does not own Zyra token streams, WebSockets, upload byte progress, Python workers or PDF bytes. Zustand is not required by this change.

The split is transport and validation in `lib/query`, `lib/quiz` and `lib/articles`; feature controllers in hooks; presentation in components. Existing Server Actions remain server-authorized mutation transports. `router.refresh()`/`revalidatePath()` refresh Next.js data, not the browser Query cache. Query invalidation does not refresh an RSC projection by itself. Retain both when a write affects both owners.

## Query identity and transport

Use `queryKeys` in `lib/query/keys.ts`, then export a `queryOptions` factory. Private keys include the session's user ID before resource IDs and filters. Public pricing uses a separate public prefix. Use `null` rather than a sentinel string that could be a real resource ID. Include all response-changing course, attempt and filter variables. Do not put access tokens, answer drafts or a freshly computed timestamp in a key.

`useQueryAccount` subscribes only within authenticated consumers. The root provider does not request a session. Demo and read-only presentation paths stay outside live-account hooks. A resolved account transition evicts other account entries; key isolation prevents reuse even before that effect. The sidebar also prunes other account caches. No browser cache persistence or cross-tab broadcasting is enabled.

Every migrated HTTP query consumes Query's `AbortSignal`, checks the HTTP status and parses unknown JSON through a runtime schema before cache admission. A TypeScript assertion is not validation. The same-origin transport hides raw server errors. Validation errors do not replace a prior valid cache entry; sensitive views hide data when their current query errors. A cache is never an authorization check. Every API and Server Action must continue to enforce the real session and entitlement on the server.

`getQueryClient` creates a new client for each server call and reuses one browser instance across initial suspension. It does not share server data across requests. Do not create a server singleton, or copy Query results into local state merely to render them.

## Freshness

| Resource | Fresh for | Automatic refresh |
| --- | --- | --- |
| Public pricing | 25 seconds | 30 seconds and focus |
| Student today | 60 seconds | Existing throttled activity/focus bridge |
| Study path | 60 seconds | Learning activity invalidates scoped paths |
| Discussion count | 60 seconds | 120 seconds and discussion events |
| Zyra allowance | 15 seconds | Explicit refresh after interaction |
| Admin operations | 55 seconds | 60 seconds |
| Admin flags | 20 seconds | 30 seconds |
| Admin key diagnostics and AI stats | 25 seconds | 30 seconds |
| AI usage range | 60 seconds | Range change or explicit refresh |
| Attempt review | Immediately stale | Pending released feedback only, at most 30 seconds |

Background polling is off. General unused data expires after five minutes. Attempt reviews use zero garbage-collection delay because answer release must be checked again on mount. No protected content or review answer cache is persisted. Study-plan placeholders can bridge a day-filter change only within the same user and course.

## Writes and invalidation

Quiz submission, grading, reward completion and article time increments do not retry or queue offline. A lost response may hide a write the server accepted; retry safety requires a server idempotency contract, not a client retry setting. The quiz clock attempts automatic submission once, keeps drafts after failure, and allows manual retry. A synchronous lock prevents duplicate entry while uploads finish. The server remains authoritative for deadlines, scores and release.

Today-plan completion keeps item-level optimistic rollback and cancels competing reads. Overlapping completions do not overwrite each other's rollback; the last pending write triggers a refresh. Pricing save validates its response, cancels an older read, then updates the shared public entry.

Article progress is serialized per account/article/version. The request carries an expected account ID that the server compares with the real session, so a queued write cannot become another account's progress after a login switch. Elapsed time is consumed once per report, excludes hidden-document ticks and is not invented for sections completed by scrolling. Completion becomes visible after a valid response. Late responses cannot reduce percent, completion or accumulated time. `keepalive` is best effort, not guaranteed delivery on close. Without server idempotency, failed increments cannot safely be replayed automatically.

Learning completion events preserve interoperability with unmigrated RSC/Server Action consumers. The student shell refreshes today and invalidates study paths. Solution completion emits the same signal. Keep the authoritative server actions for flashcard scheduling and solution rewards.

## Validation and further adoption

Run `bun run audit:client-data artifacts/query-data-layer/inventory.json` to inventory explicit client modules, statically reachable helpers, API routes and transport calls. This is a source inventory, not runtime tracing: dynamic imports, re-exports and indirect requests require review. A raw fetch count is not a migration target.

Run the Query unit tests, changed feature contracts, application typecheck and lint. TanStack's recommended ESLint rules check key dependencies and stable Query usage. Browser fixtures must cover account switches, invalid responses, failed writes, draft retention, timers, navigation, demo isolation and desktop/mobile overflow. Do not infer lower production latency from passing unit tests.

## References

Official documentation checked for this implementation: [SSR and Server Components](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr), [query options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options), [query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys), [defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults), [cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation), [mutation invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations). Read the installed Next.js Server/Client Component and fetching-data guides before changing server boundaries.
