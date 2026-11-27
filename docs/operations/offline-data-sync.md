# Offline data and native library

Status: `ACTIVE` source contract, 2026-11-26. Proposed as a draft against `staging`. Local tests, CI, hosted deployment and installed-device acceptance are separate evidence.

## Scope

Android and desktop start from bundled files and probe the configured origin before opening the normal app, including for returning accounts with cached data. The static probe has a 4.5-second limit on Android and a 3.5-second limit on desktop. Android shows the saved list while the probe runs and keeps it open if the learner starts reading. The Android main-frame error page stays in recovery mode until the learner retries. Desktop opens the existing native sign-in and role-dashboard entry route on success, and shows saved readings when it is disconnected or its probe fails. Connectivity changes do not automatically navigate away from a reader.

The bundled library and browser `/offline` put downloaded Article/Diktat readings first. The library management control exposes the last authorized course and material lists, video links and thumbnails, achievement definitions, refresh and storage controls.

Expo uses the same scoped course manifests and offline catalog endpoints for the Courses, Videos and Achievements sections. Video rows open the verified native player when connected. The app retains bounded thumbnail bytes with their resource lease. Achievement rows contain definitions and thresholds. Shared metadata excludes achievement ownership, scores, private formative evaluators and assessment answers. Video streams remain online-only. The bundled reader uses local fonts and math styles. Remote interactive documents and server actions still need a connection.

The browser library uses the student application shell. The native recovery document uses the same student destination links and responsive controls. Saved-reading search works locally. Online-only destinations retry the configured server and keep the library open when it cannot be reached. The connection label appears in the content.

Browser pages also persist approved small account queries and complete reading packages. Next.js server-rendered navigation still needs the server unless the service worker serves its offline entry page. Browser persistence does not make every route fully offline.

## Identity and authorization

Each cache scope includes the configured server origin, account ID and language. Resource identity adds course, kind, ID and representation version. Responses include the current server session. Login, logout, account and language changes invalidate the previous writer generation so late responses cannot repopulate a previous account's cache.

Every resource request checks the current session, account state, course/chapter grants, publication state and representation before returning a body or HTTP 304. ETags identify content; they do not grant access. Authenticated responses use `private, no-store`. App-managed persistence owns the account-aware storage; shared CDN caches must not store these responses.

The native transport accepts only fixed offline API routes at its configured Zyx origin. It uses WebView cookies internally, checks the expected account and response identity, refuses redirects and limits response size. JavaScript does not receive cookie values or an arbitrary authenticated fetch command.

## Durable changes

Migration `0048_offline_content_sync.sql` adds `offline_sync_state`, `offline_content_changes` and `offline_cache_policy`. These store the committed cursor, scoped change log and revisioned admin rules.

Content mutation and change records share a PostgreSQL transaction. Updating the cursor row holds a lock until commit. A later writer cannot allocate a higher cursor and commit before an earlier writer, avoiding the lost-change case of using a bare sequence as a commit watermark.

The mutation and invalidation coverage follows the data admitted to local storage.

| Persisted data | Mutation paths | Delivery and reconciliation |
| --- | --- | --- |
| Course and chapter outline | Admin and MCP course and chapter save, archive and reorder, Admin Ops create, chapter bundle import and compatibility projection | Course events map to canonical and legacy client IDs. Course archive records access deletion for both old aliases. Chapter changes use the owning course and reconcile current chapter grants. |
| Article and Diktat packages and list entries | Admin document publish, unpublish and edits, canonical compatibility write, Product bundle publish and withdrawal through UI, MCP or revision release, published Diktat PDF metadata update | Events identify the canonical reading and course. A new reading appears in the outline. Saved updates replace complete packages. Unpublication, course revocation and moves outside the learner's chapter grant remove the old reading. |
| Video and playlist catalog | Admin and tutor video and playlist actions, MCP video and playlist writes | Course events trigger a conditional catalog read. Deletion and changes to a video's chapter or URL clear the previous catalog projection before a replacement fetch. Video streams are online-only. |
| Enrollment and access | Group enrollment and grant renewal through Admin UI, MCP, token redemption and PKA. Tutor assignment, account status and roles through shared Admin, MCP and Admin Ops paths. Course pricing and chapter ordering through canonical services. | User-targeted events reach that account's devices. Current authorization narrows or revokes storage before catalog and package downloads. Expiry also takes effect through leases. |
| Browser account queries and native library projections | Same course, enrollment and access mutations | Sync replaces the enrolled-course and course-title projections and removes revoked data. Browser query hydration checks the authorized library snapshot before restoring a course. Native library and reading stores receive the same reconciliation. |
| Achievement definitions | Code-owned badge families, thresholds, artwork and translations | The conditional achievement catalog is refreshed by routine validation or an explicit revalidation. There is no admin writer for these definitions. Badge ownership stays outside the offline catalog. |

Draft authoring follows the existing approval workflow. Website materials, uploaded PDFs, assessments, private progress and user-authored reading positions are outside the admin-managed offline package inventory. A published Diktat PDF update touches the Diktat descriptor timestamp, so it invalidates the Diktat metadata while its generated PDF remains online.

The log provides durable delivery. A bounded foreground stream carries only a hint to read it. A missed stream message, push notification or webhook cannot strand a device at an old version. No new queue provider or provider credential is required.

## Sync and package replacement

The shared controller checks on account start, app resume, reconnect, live hints and the active check interval. It deduplicates work and cancels requests for a prior account. Normal checks transfer a cursor, current access and small metadata; unchanged bodies use conditional requests.

Stream reconnects use bounded retry delays and do not postpone the active fallback check. A hint arriving during synchronization queues another pass. An unchanged cursor skips the change-log scan and unrelated events do not trigger catalog fetches. Each stream poll checks the current session. The native recovery shell uses the authenticated active check interval and reconnect events because its bridge transports bounded responses. Browser contexts with Web Locks serialize same-scope writes and use BroadcastChannel to notify other tabs with active readers.

Expo verifies the current session and Student role before resuming observed course metadata sync after foreground entry or confirmed reconnection. On backgrounding, confirmed disconnection or loss of verified session access, it cancels metadata work and rejects late results. Expo does not register a background sync task.

Sync validates response identity, removes revoked resources, persists invalidations and reconciles affected course manifests before acknowledging its cursor. Mounted readers keep the current version until the learner accepts an ordinary update. Explicit deletion clears the old reading and refreshes the authorized route. Grant changes are checked without waiting for confirmation. A missing, future or expired cursor requests a full authorized manifest. Duplicate events and late requests cannot lower a stored version. Failed downloads retain the previous complete package and leave the update pending.

Routine checks use the authorized manifest to refresh verification timestamps and leases for complete, current readings with matching revisions. Per-reading requests still recover changed, incomplete, invalidated, stale or expired packages and revalidate saved readings after a cursor reset.

Expired course outlines and video catalogs are checked even when the manifest is still fresh. An authenticated 304 rebuilds the library entries from the stored body under the current course lease and chapter scope. Cached images whose previous lease does not cover the renewed catalog are omitted until a body and its assets are fetched again.

Expo renders Article sections and Diktat Markdown with the shared snapshot generator. It embeds KaTeX fonts and only images whose saved asset URL matches the package and language. The local document opens in a script-disabled view with external navigation and requests disabled. Interactive material uses its static authored representation where available.

Article/Diktat packages include admitted images. The client downloads a candidate, checks required assets, account generation and space limits, then replaces the active package. The asset proxy admits only an exact URL belonging to the current resource and never forwards private cookies to public thumbnail hosts. Required asset failure prevents replacement.

## Admin controls

Open **Offline data** from **Admin > Web Analytics** at `/admin/ops/offline`.

| Setting | Initial value | Effect |
| --- | --- | --- |
| Routine check | Friday, 06:00 WIB | Additional check while active; missed checks run after reconnect |
| Course/catalog age | 24 hours | Recheck small metadata without an event |
| Material age | 7 days | Recheck saved text representations |
| Active change check | 1 minute | Fallback for missed hints |
| Storage limit | 100 MiB | Bound reading storage per active scope |
| Material limit | 250 | Bound retained readings |
| Cache retention | 30 days | Remove old automatic cache entries |
| Access without a new check | 24 hours | Also bounded by session and enrollment expiry |
| Automatic caching | On | Save eligible opened materials |
| Automatic downloads on Wi-Fi only | Off | Optional stricter mode skips automatic downloads on unknown connections |

The UI labels storage in MB and converts it using 1,048,576 bytes. Explicit downloads remain available when the app cannot identify the connection type. When Wi-Fi-only mode is on, the automatic path stays conservative. Data-saving and very slow connection signals also defer automatic downloads.

Admins can request checks for all data, one course or one material, using title pickers. Success means the request exists in the durable log. It does not mean every offline device has received it. Policy updates require the loaded revision; a concurrent edit returns a conflict and retains local form values until the admin loads the latest version. All mutations require the admin role and a same-origin request.

## Storage and offline access

The first online Article or Diktat visit records only a bounded visit marker for the account, origin, language and resource. The local ledger retains up to two visit IDs per resource and the 1,000 most recently visited resources per scope. Watching an open reader for changes does not admit a reading package. Starting with the second distinct visit, web and Expo can fetch an unpinned package and its required images when current access, policy, network and storage permit. Expo checks the live native connection before the resource and asset requests when Wi-Fi only is enabled. Reloading the page starts a new visit. Rendering the same reading again or refreshing its content props within the mounted reader keeps the same visit. Existing saved packages continue to synchronize. Use the offline library to manage explicit downloads and pins.

Automatic cache entries can be removed to make room. Explicit downloads stay pinned until removed or access ends. Pinning preserves the user's download choice, and every open still requires a current lease. In Expo, unpinning permits eviction when the current account and language need room. Storage usage shows the bytes, limit and pin count for this scope. Clearing downloads preserves the authorized material list and prevents requests started before the clear from restoring downloads. If pinned data fills the limit, a new download reports a storage problem.

Native and web libraries and saved readers show Offline once as muted text when the device is disconnected. The indicator takes up no space while connected. Reconnection leaves the current reading open. Learners can choose Buka aplikasi to return to the web app. Sync progress, failed requests, expired access and empty storage retain their own messages. Release channel selection still uses the configured environment. Reading position belongs to its account and material. A content update must not mix private state into another account.

The client checks up to 150 distinct course scopes in a pass. Libraries above this existing metadata bound and concurrent writes on platforms without Web Locks lack verified coverage. Operators running one-off SQL, migrations or seed scripts outside the shared mutation services must enqueue a scoped revalidation after commit. Cached RSC history and static application assets follow their Next.js and service worker lifecycle. The durable cursor covers the app-managed library and query projections.

An offline device cannot learn about a server-side permission change until it reconnects. The stored access limit bounds this delay. After that limit expires, the app requires a new check. A shorter limit provides a tighter revocation window. No push transport guarantees immediate removal from a device without a connection.

## API surface

| Endpoint | Role |
| --- | --- |
| `POST /api/offline/sync` | Changes, policy and current access |
| `GET /api/offline/manifest` | Authorized descriptors for one course |
| `GET /api/offline/resource` | Student-safe body or authenticated 304 |
| `GET /api/offline/asset` | Bounded admitted image bytes |
| `GET /api/offline/stream` | Foreground hints with sync recovery |
| `GET/PATCH /api/admin/offline/policy` | Revision-checked policy |
| `GET /api/admin/offline/catalog` | Admin title pickers |
| `POST /api/admin/offline/revalidate` | Targeted invalidation |

Resource headers include `x-offline-*` identity, cursor, revision and validation fields. The shared TypeScript contract lives in `lib/offline/sync-contract.ts`.

## MCP impact

Existing publication, academic, video and access tools receive invalidation through the same services. The event consumers authorize and translate course IDs under the current server origin and account. The revalidation request uses the same authenticated clients on staging and production. This change adds no MCP tools and does not change OAuth scopes, consent, discovery, packaged skills, playbooks, host prompts or environment bindings. Policy editing and manual revalidation are intentionally admin-UI-only, as recorded in `lib/admin-mcp/operations-catalog.ts`.

The reader admission threshold and the library, reader and native shell connectivity presentation are device-local. The existing desktop recovery and admin policy entries in the operations catalog still cover the affected workflows. Native origin lookup and web API calls use the existing clients and environment bindings. The Expo reading renderer accepts the verified package supplied by the app ledger and has no new tools, remote calls, or authorization rules.

## Rollout and evidence

Apply the additive migration to the intended environment before deploying routes that query its tables. Release the staging web build separately from this draft. Build native packages from the same revision and install the resulting Nightly builds to test the new bridge and local entry page. Web deployment cannot replace embedded installer files. Edit the tracked mobile and desktop `index.html` templates and the shared native source. Build the ignored shell bundles, CSS, origins and fonts with `bun run build:native-offline` during packaging.

This draft does not run a remote migration, publish an installer or change production data. Android and Tauri still need installed-device acceptance. The browser fixture tests shipped HTML and the shared controller with a simulated bridge; it does not establish Android WebView or OS cookie behavior.

Rollback can restore previous web and native binaries while retaining the additive tables. Keep the change log during rollback. A later compatible client can request a full manifest if its old cursor has expired. Reverting a binary is separate from revoking already downloaded offline access.

The PR records exact commands, outcomes and final images. Scenarios cover transaction rollback, cursor recovery, account/chapter isolation, conditional reads, delayed responses, partial downloads, quotas, pinned data, policy conflicts, schedules and native cold launch. Visual checks use actual components and bundled HTML at 380 × 844 and 1536 × 864 in light/dark themes, with Indonesian/English states. Keep screenshots, traces and reports in ignored `artifacts/visual-quality/`, with CI artifacts and PR images as evidence for the tested revision.
