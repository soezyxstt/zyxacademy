# Offline data and native library

Status: `ACTIVE` source contract, 2026-11-26. Proposed as a draft against `staging`. Local tests, CI, hosted deployment and installed-device acceptance are separate evidence.

## Scope

The native library opens from bundled files. It shows the last authorized course list, material catalog, downloaded Article/Diktat readings, video links and thumbnails, achievement definitions and storage controls without waiting for a remote page. The online application remains available for account changes, video playback and interactive work.

Shared metadata excludes achievement ownership, scores, private formative evaluators and assessment answers. Video entries contain links and optional thumbnails, not the video stream. The bundled reader uses local fonts and math styles. Remote interactive documents and server actions still need a connection.

Browser pages also persist approved small account queries and complete reading packages. Next.js server-rendered navigation still needs the server unless the service worker serves its offline entry page. Browser persistence does not make every route fully offline.

## Identity and authorization

Each cache scope includes the configured server origin, account ID and language. Resource identity adds course, kind, ID and representation version. Responses include the current server session. Login, logout, account and language changes invalidate the previous writer generation so late responses cannot repopulate a previous account's cache.

Every resource request checks the current session, account state, course/chapter grants, publication state and representation before returning a body or HTTP 304. ETags identify content; they do not grant access. Authenticated responses use `private, no-store`. App-managed persistence owns the account-aware storage; shared CDN caches must not store these responses.

The native transport accepts only fixed offline API routes at its configured Zyx origin. It uses WebView cookies internally, checks the expected account and response identity, refuses redirects and limits response size. JavaScript does not receive cookie values or an arbitrary authenticated fetch command.

## Durable changes

Migration `0048_offline_content_sync.sql` adds `offline_sync_state`, `offline_content_changes` and `offline_cache_policy`. These store the committed cursor, scoped change log and revisioned admin rules.

Content mutation and change records share a PostgreSQL transaction. Updating the cursor row holds a lock until commit. A later writer cannot allocate a higher cursor and commit before an earlier writer, avoiding the lost-change case of using a bare sequence as a commit watermark.

Publication, withdrawal, direct material edits, course/chapter synchronization, enrollment writes and video edits record changes through their shared services. Admin, tutor, import and MCP callers use the same path. Draft edits do not publish a learner package until the existing release workflow approves them.

The log provides durable delivery. A bounded foreground stream carries only a hint to read it. A missed stream message, push notification or webhook cannot strand a device at an old version. No new queue provider or provider credential is required.

## Sync and package replacement

The shared controller checks on account start, app resume, reconnect, live hints and the active check interval. It deduplicates work and cancels requests for a prior account. Normal checks transfer a cursor, current access and small metadata; unchanged bodies use conditional requests.

It validates response identity, removes revoked resources, persists invalidations and reconciles affected course manifests before advancing its cursor. A missing, future or expired cursor requests a full authorized manifest. Duplicate events and late requests cannot lower a stored version. Failed downloads retain the previous complete package and leave the update pending.

Article/Diktat packages include admitted images. The client downloads a candidate, checks required assets, account generation and space limits, then replaces the active package. The asset proxy admits only an exact URL belonging to the current resource and never forwards private cookies to public thumbnail hosts. Required asset failure prevents replacement.

## Admin controls

Open **Admin > System > Offline data** at `/admin/ops/offline`.

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

Automatic cache entries can be removed to make room. Explicit downloads stay pinned until removed or access ends. Pinning preserves the user's download choice, not permanent authorization. If pinned data fills the limit, a new download reports a storage problem instead of silently removing a saved download.

The UI distinguishes connection errors, pending updates, expired access and empty storage. Reading position belongs to its account and material. A content update must not mix private state into another account.

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

Existing publication and academic tools receive invalidation through the same services. This change adds no MCP tools and does not change OAuth scopes, consent, discovery, packaged skills, playbooks, host prompts or environment bindings. Policy editing and manual revalidation are intentionally admin-UI-only, as recorded in `lib/admin-mcp/operations-catalog.ts`.

## Rollout and evidence

Apply the additive migration to the intended environment before deploying routes that query its tables. Release the staging web build separately from this draft. Build native packages from the same revision and install the resulting Nightly builds to test the new bridge and local entry page. Web deployment cannot replace embedded installer files.

This draft does not run a remote migration, publish an installer or change production data. Android and Tauri still need installed-device acceptance. The browser fixture tests shipped HTML and the shared controller with a simulated bridge; it does not establish Android WebView or OS cookie behavior.

Rollback can restore previous web and native binaries while retaining the additive tables. Keep the change log during rollback. A later compatible client can request a full manifest if its old cursor has expired. Reverting a binary is separate from revoking already downloaded offline access.

The PR records exact commands, outcomes and final images. Scenarios cover transaction rollback, cursor recovery, account/chapter isolation, conditional reads, delayed responses, partial downloads, quotas, pinned data, policy conflicts, schedules and native cold launch. Visual checks use actual components and bundled HTML at 380 × 844 and 1536 × 864 in light/dark themes, with Indonesian/English states. Keep screenshots, traces and reports in ignored `artifacts/visual-quality/`, with CI artifacts and PR images as evidence for the tested revision.
