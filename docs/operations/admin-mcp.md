# Admin MCP operations

Status: `OPEN / IN PROGRESS`

The existing `/api/mcp/authoring` endpoint now registers admin domain tools alongside authoring. This is a local implementation and validation record. It does not certify a deployed host, OAuth connection, provider integration, or complete parity with every admin UI action.

## Access and mutation contract

- New admin permissions require an explicit OAuth request and consent. Existing bearer, cookie and compatibility connections keep their old authoring grants. Resource audience, live session, active admin status, and per-tool scope are checked. No new feature flag was added.
- Read the target and use its current revision. All new writes default to `dryRun: true`. Inspect the returned impact, then send the identical input, request key and confirmation token with `dryRun: false`. Confirmation expires after 10 minutes and binds actor, session, environment, operation and payload.
- Keep one request key per intended change. Business changes and the success/idempotency receipt commit in the same PostgreSQL transaction. Changed payloads under a prior key fail. Stale revisions require rereading and a new plan.
- API credentials and provider errors are never returned. Response data, user email, activation-token values and related operations have separate scopes. Legacy group labels containing activation tokens are redacted. Inputs and results are capped at 1 MB; list pagination is bounded.

## External effects

`admin_operation_jobs` is the durable outbox. The existing Deno Inngest registry runs `admin-operations-outbox` every minute, processes at most 25 queued jobs and allows only one function instance at a time. Jobs bind the originating live admin session, OAuth client, resource, required scopes and environment. Enqueue and execution both check persisted OAuth consent, including secondary response-read permission for exports. Revoked or narrowed consent prevents queued provider effects. Manual/session connections cannot delegate these admin provider operations; legacy jobs without client/resource binding fail closed. No bearer token is stored. Missing provider configuration fails before an effect.

A claim commits before provider work. A provider timeout or crash is marked `unknown`; claims older than 15 minutes become `unknown`. These attempts are never replayed automatically. Use `adminjobs.get`, inspect the provider, then use `adminjobs.reconcile` with a reason and evidence reference. This records an operator assertion, not automated provider verification. Only queued jobs can be cancelled. A queued tool result is not delivery or provider success.

Google Sheets exports use the existing entity spreadsheet, owned A1 block, fingerprint and conflict checks. Read `forms.responses.sheet_state` first. A changed data or sheet snapshot is rejected. Manual edits require the operator to type `TIMPA <form-slug>`; the skill forbids inventing that consent. Deleted linked spreadsheets are not automatically recreated by this MCP workflow. Google API writes and a database receipt cannot share a transaction, so uncertain provider outcomes require reconciliation.

Notification targets are explicit active user snapshots. Course and group audiences cannot silently widen to all users. A snapshot is limited to 1000 recipients. Email preferences are not bypassed by reusing generic broadcasts for campaign mail. The generic notification tool sends the existing in-app/FCM broadcast, not campaign email.

Meet operations use the existing Google adapter and member provisioning. A created provider reference is checkpointed before subsequent calls. Partial member provisioning is reported; an uncertain creation must be reconciled rather than recreated. Generation uses the existing KO pipeline and its existing accounting path.

## Forms and media boundaries

Form definitions validate all currently supported question types, options, grids, scale ranges, file-size limits and absolute schedules. Updates cannot reinterpret existing responses by changing their question array. Preview and simulation never submit, upload, spend the one-response allowance or update Sheets. Identity and file ownership are not attested in simulation. The embedded UI is an isolated answer preview; server simulation remains authoritative for schedule/access checks.

The MCP Apps UI has no network or upload access and uses text nodes for supplied content. Text/structured results remain available to hosts without UI support. Response summaries omit identity and open answers, use respondent denominators, and count each multiselect bucket once per respondent. Summary and Sheets snapshots cap at 5000 responses per date filter. CSV export is paged and guards formula-like cells. Response date filters use native PostgreSQL timestamp comparisons.

Media listing uses bounded provider pagination. Small media uploads support at most 512 KiB, use the shared key builder, check the allowed type signature, create a new object, and clear stored upload bytes after success. Larger files retain the existing upload UI. No arbitrary path, SQL, HTTP or shell tool is exposed.

## Exact additional tool catalog

| Tool | Scope |
| --- | --- |
| `admin.environment` | Live admin session, no data grant required |
| `adminjobs.cancel` | `jobs:write` |
| `adminjobs.get` | `jobs:read` |
| `adminjobs.list` | `jobs:read` |
| `adminjobs.reconcile` | `jobs:write` |
| `analytics.courses` | `analytics:read` |
| `analytics.overview` | `analytics:read` |
| `blog.create` | `blog:write` |
| `blog.get` | `blog:read` |
| `blog.list` | `blog:read` |
| `blog.set_publication` | `blog:write` |
| `blog.update` | `blog:write` |
| `chapters.archive` | `chapters:write` |
| `chapters.create` | `chapters:write` |
| `chapters.get` | `chapters:read` |
| `chapters.list` | `chapters:read` |
| `chapters.order` | `chapters:read` |
| `chapters.reorder` | `chapters:write` |
| `chapters.update` | `chapters:write` |
| `courses.archive` | `courses:write` |
| `courses.create` | `courses:write` |
| `courses.get` | `courses:read` |
| `courses.list` | `courses:read` |
| `courses.update` | `courses:write` |
| `enrollments.get` | `access:read` |
| `enrollments.list` | `access:read` |
| `forms.archive` | `forms:write` |
| `forms.create` | `forms:write` |
| `forms.get` | `forms:read` |
| `forms.list` | `forms:read` |
| `forms.presets.create` | `forms:write` |
| `forms.presets.delete` | `forms:write` |
| `forms.presets.get` | `forms:read` |
| `forms.presets.list` | `forms:read` |
| `forms.presets.update` | `forms:write` |
| `forms.preview` | `forms:read` |
| `forms.responses.export` | `forms:responses:export` |
| `forms.responses.export_sheet` | `forms:responses:export` |
| `forms.responses.get` | `forms:responses:read` |
| `forms.responses.list` | `forms:responses:read` |
| `forms.responses.sheet_state` | `forms:responses:export` |
| `forms.responses.summarize` | `forms:responses:read` |
| `forms.set_acceptance` | `forms:write` |
| `forms.simulate_submission` | `forms:read` |
| `forms.update` | `forms:write` |
| `forms.validate_answers` | `forms:read` |
| `generation.scope` | `jobs:write` |
| `generation.start` | `jobs:write` |
| `groups.adjust_quota` | `groups:write` |
| `groups.create` | `groups:write` |
| `groups.get` | `groups:read` |
| `groups.inspect` | `groups:read` |
| `groups.list` | `groups:read` |
| `groups.members.add` | `groups:write` |
| `groups.members.list` | `groups:members:read` |
| `groups.members.remove` | `groups:write` |
| `groups.set_status` | `groups:write` |
| `groups.update` | `groups:write` |
| `jobs.get` | `jobs:read` |
| `jobs.list` | `jobs:read` |
| `links.create` | `links:write` |
| `links.delete` | `links:write` |
| `links.get` | `links:read` |
| `links.list` | `links:read` |
| `links.update` | `links:write` |
| `materials.get` | `materials:read` |
| `materials.list` | `materials:read` |
| `materials.update_metadata` | `materials:write` |
| `media.list` | `media:read` |
| `media.upload` | `media:write` |
| `meet.create` | `meet:write` |
| `meet.end` | `meet:write` |
| `meet.get` | `meet:read` |
| `meet.list` | `meet:read` |
| `notifications.audience` | `notifications:send` |
| `notifications.history` | `notifications:read` |
| `notifications.send` | `notifications:send` |
| `schedules.create` | `schedules:write` |
| `schedules.delete` | `schedules:write` |
| `schedules.get` | `schedules:read` |
| `schedules.list` | `schedules:read` |
| `schedules.update` | `schedules:write` |
| `settings.feature_flags` | `settings:read` |
| `shortlinks.create` | `shortlinks:write` |
| `shortlinks.delete` | `shortlinks:write` |
| `shortlinks.get` | `shortlinks:read` |
| `shortlinks.list` | `shortlinks:read` |
| `shortlinks.update` | `shortlinks:write` |
| `tokens.create` | `access:write` |
| `tokens.get` | `access:read` |
| `tokens.list` | `access:read` |
| `tokens.reveal` | `access:secrets:read` |
| `tokens.revoke` | `access:write` |
| `tutorial.assignments.list` | `schedules:read` |
| `tutorial.bookings.get` | `schedules:read` |
| `tutorial.bookings.list` | `schedules:read` |
| `tutorial.slots.list` | `schedules:read` |
| `users.get` | `users:read` |
| `users.list` | `users:read` |
| `users.set_roles` | `users:roles:write` |
| `users.set_status` | `users:status:write` |
| `videos.create` | `videos:write` |
| `videos.delete` | `videos:write` |
| `videos.get` | `videos:read` |
| `videos.list` | `videos:read` |
| `videos.playlists.create` | `videos:write` |
| `videos.playlists.list` | `videos:read` |
| `videos.update` | `videos:write` |

## Remaining parity and rollout work

PKA is explicitly excluded from this expansion by product decision. No PKA tools, scopes, broadcasts or worker configuration are added; the existing PKA system is unchanged.

- This source-level inventory does not yet expose every admin action. Existing authoring tools retain bundle, question and quiz quality gates; the admin catalog does not bypass them.
- Remaining UI-only areas include tutorial booking overrides/tutor assignment, broad assessment analytics and grading mutations, material ingestion/upload orchestration beyond existing authoring, media move/copy/delete/folder operations, pricing and deployment/credential management. Destructive bulk data contraction and feature rollout are excluded from implicit operation execution.
- Group archival preserves learning history; token revocation stops new enrollment rather than deleting the group. Course/chapter archival rejects nonempty dependencies. `groups.inspect` supplies the membership-aware revision for group writes.
- Local native package includes the admin skill, but the deployed skills snapshot still comes from the separate pinned source repository. Promote that source and update the exact environment pin through its normal review process before claiming host availability.
- Apply PostgreSQL migration 0003 only to an explicitly authorized environment after read-only preflight. Deploy web and worker from the same revision, configure provider credentials in that exact environment, reauthorize required scopes, and verify an actual host and provider flow. No remote migration, installation or deployment was performed here.

## Local verification

PostgreSQL integration adaptation covers real transactions, canonical projections, replay protection, revision conflicts, scope denial, role escalation, group capacity, token redaction, simulation side effects, response export and outbox claims. MCP transport tests cover the real catalog and resource handlers after skill registration. Provider tests use mocks; they do not certify Google, FCM, R2 or a deployed Inngest runner.

The primary agent executed Playwright at 380x844 and 1536x864 and inspected the generated preview, validation, simulation success, aggregate, empty, error, file/other validation and OAuth selected/deselected/disabled/focus screenshots under ignored `artifacts/visual-quality/results/`. Additional long-label and dark-mode screenshots are recorded there. No production or personal data was used.

Validation update: the locked skill build and skill contracts passed (12 tests); canonical academic sync passed (3 tests) against the isolated migrated database; communications SQLite integration passed (2 tests). The production build was killed by SIGKILL during compilation, so build verification remains open. TypeScript checking passed with incremental mode enabled. No real MCP host or provider delivery has been verified.

Scope update: all newly added PKA tools, scopes and broadcast dispatch paths were removed at the operator request. The transport contract checks that no PKA tool is advertised. Existing PKA routes, actions and data were not changed.

## Latest staging adaptation

Status: `OPEN / IN PROGRESS`

The implementation has been adapted to staging commit `a67a4744`, which uses PostgreSQL and provider-selected private storage. Earlier SQLite fixtures and validation were completed against the previous branch only; they do not establish compatibility with current staging. Existing capabilities are retained. No new worker service or large operation is being added. Forms date filters use PostgreSQL timestamps, and the new outbox table uses generated PostgreSQL migration 0003. OAuth integration preserves staging canonical admin checks, configured public origin and persisted consent. No remote database, deployment or provider mutation has been performed.

Integrated local verification: 84 tests passed across 19 isolated Bun processes, using PGlite for real PostgreSQL constraints and generated migrations. The application TypeScript check exited 0 with incremental mode and a 2560 MB heap cap. Results are recorded in ignored `artifacts/admin-mcp/staging-adaptation/results.json`. Provider effects remain mocked. No new full Deno check or production build was run during this adaptation. Previous visual evidence covers the unchanged form resources and consent component; the current staged app and a real MCP host have not received new visual or runtime verification.

Final adaptation checks: application TypeScript, full ESLint (0 errors, 21 warnings), static worker dependency audit (241 internal modules) and staged/working-tree whitespace checks exited 0. The 19 isolated focused test processes passed all 84 tests. No merge conflict markers remain. Checks were run sequentially, without disabling incremental mode and without a full Deno check or production build. This completes local adaptation; it does not certify remote deployment, OAuth host import or provider delivery.

## Staging and production isolation

Status: `ACTIVE`

Call `admin.environment` before reading or modifying admin data and compare its environment and origin with the user's intended target. Server names include the environment, and initialization instructions include the configured origin. Every additional admin data tool requires `expectedEnvironment` and `expectedOrigin`; missing or mismatched targets fail before business queries or writes. Existing authoring tools retain their signed bootstrap boundary.

Identity derives from the configured public/auth URL and explicit `ZYX_MCP_ENVIRONMENT`. Contradictory configured origins or known hostname/environment combinations fail closed. `VERCEL_ENV=production` describes a deployment tier and cannot turn the staging hostname into production. Unknown deployment hostnames require an explicit environment. OAuth resource matching and live persisted consent remain in force. Mutation plans expose the actual target and their signatures bind the normalized origin, so equal secrets do not allow a staging plan to execute on production. External jobs bind the same origin and cannot be claimed by a different environment's worker.

The plugin skill forbids substituting production when staging is unavailable, including when only production tools are exposed in the harness. These local checks do not verify remote deployment configuration, physical database/bucket separation, or an external harness following the user intent. An agent that deliberately supplies production as its intended target is outside what environment matching can detect. Remote acceptance must verify both connection identities and exact database/storage targets read-only before use.

Isolation verification: six focused negative scenarios pass, including missing/wrong targets for all three admin registrars, conflicting configuration, staging hosted in a production deployment tier, and cross-origin signed plans. PostgreSQL outbox tests also reject a different-origin worker claim. Transport tests require target fields on every additional admin data tool. The application incremental TypeScript check, full lint (0 errors, 21 warnings), 11 plugin distribution checks and static worker import audit passed. Focused result receipts, including corrected test fixtures, are under ignored `artifacts/admin-mcp/environment-isolation/`.

Read-only public metadata probes returned HTTP 200 for both canonical endpoints. Staging advertised resource `https://staging.zyxacademy.com/api/mcp/authoring` with authorization server `https://staging.zyxacademy.com`; production advertised resource `https://www.zyxacademy.com/api/mcp/authoring` with authorization server `https://www.zyxacademy.com`. No credentials were sent and redirects were not followed. This proves their advertised OAuth resources differ, not physical database/storage isolation. The harness exposes tools labeled production; a read-only probe failed, and no authenticated staging connection was verified. Environment files for staging/production are absent from this checkout. These guards and skill updates have not been deployed or installed remotely.

PR review corrections: queued provider jobs now revalidate live client consent as well as session/admin authority; video updates accept partial metadata and preserve the existing playback URL when omitted. PostgreSQL regressions cover consent revocation, narrowed export permissions, manual-client rejection and title-only video edits. OAuth integration also rejects approval of unrequested scopes explicitly.

Review-fix verification: the standalone OAuth consent integration command exited 0; eight focused files passed 80 tests through the CI contract runner. The final video/outbox regressions passed 15 tests after preserving all omitted video fields. Incremental application TypeScript, focused source lint and whitespace checks exited 0. CI acceptance for the updated PR head remains pending; no provider or remote database writes were performed.

## CI fixture compatibility follow-up

Status: `OPEN / IN PROGRESS`, local validation passed; remote CI acceptance pending.

The affected-code test compiler reported 105 diagnostics in 28 files that were unchanged by the MCP PR. Every reported file/line/error-code tuple was reproduced against staging commit `a67a4744` with matching installed dependencies. The comparison source was kept outside repository test discovery after inspection; its evidence is in ignored `artifacts/admin-mcp/staging-baseline-error-comparison.json`.

The follow-up aligns existing fixture types and provenance fields with current schemas, narrows optional contracts/visual unions, and preserves assertion expectations and deliberately invalid legacy cases. The existing PDF worker uses an equivalent portable Fetch signature so its entrypoint can also be imported by Node contract tests. The reader fixture supplies the cookie mock required by locale resolution. No operational capability, assertion coverage or CI selection was removed.

The exact CI-selected test compiler scope (216 roots) passed with incremental checking and a 2560 MB heap cap. All 26 changed contract files passed 243 tests through the isolated CI runner; the changed reader suite passed 20 tests. Worker-project typechecking, focused worker lint and whitespace checks also exited 0. The final planner retained the same 203 runtime suites and compiler roots. Previous failures from the comparison-only copied tests are retained in local logs; final clean receipts are `artifacts/test-contracts/1793612372076/results.json` and `/data/workspace/zyx-tooling/pr292-reader-fixture.log`. No staging or production data was accessed or changed.
