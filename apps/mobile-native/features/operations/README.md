# Native operations

Import from `apps/mobile-native/features/operations/index.ts`. Call `resolveOperationsArea(href)` on a local URL. A null result hands navigation back to the host. Dynamic segments and supported Indonesian/English marketing paths use the same ownership boundary as the web inventory.

## Mounting product routes

* Mount `AdminOperationsScreen` with `href`, the current `NativeSessionTransport`, its verified `NativeAccountContext`, and `navigate(href, options?)`. The private screens remount on account, session, origin or locale changes. The server checks authorization at its entry points. For an alias, honor the supplied `{ replace: true }` when opening the academic or compatibility destination.
* Mount `PublicOperationsScreen` independently with the public origin, locale, navigation and Back. It selects the locale from localized URLs and builds an anonymous public client. Use the lower-level `PublicScreen` when injecting an existing client. Pass a browser handoff, file picker or article renderer as needed. Do not bind the authenticated Admin transport to this entry. See `packages/native-parity/operations/public.md` for the public projection and detailed demo handoffs.
* Individual `EvaluationScreen`, `ManagementScreen` and `MonitoringScreen` exports accept injected transports or capabilities. The Admin entry accepts options for rich content, files, external URLs and device capabilities. See the corresponding reports under `packages/native-parity/operations/`.

## Running the fixture

Use a disposable checkout with the repository's Bun version and Node 24. From the repository root:

```sh
bun install --frozen-lockfile
npm ci --prefix apps/mobile-native
node scripts/native-parity/operations/mount.mjs
cd apps/mobile-native
npx expo run:android
```

Use `npx expo run:ios` on a Mac with Xcode. Open `zyx-native-parity://operations-fixture?path=%2Fadmin` or `zyx-native-parity://operations-fixture?path=%2Fblog` on the installed build. The temporary route only mounts the fixture in this checkout. The public fixture uses synthetic clients and intercepts external URL handoffs. The Admin fixture keeps writes in memory.

`packages/native-parity/operations/scenarios.tsv` lists case IDs and runnable deep links for all 49 route patterns. Regenerate it from the root with `bun scripts/native-parity/operations/report.ts`. Each case supplies a locale, theme, route and fixture state. Opening another case resets the fixture session.

## Reproduction

```sh
bun test packages/native-parity/operations/
bun tests/integration/operations-public-blog.ts
bun tests/integration/operations-admin-access.ts
bun tests/integration/operations-admin-handlers.mjs
bun tests/integration/operations-evaluation-actions.mjs
bun tests/integration/operations-management-reads.mjs
bun tests/integration/operations-management-actions.mjs
bun tests/integration/operations-public-actions.mjs
npm run typecheck --prefix apps/mobile-native
```

Run each integration file in its own process because its mocked session source and PostgreSQL test database are process-local. The domain reports identify the handlers and external dependencies used by each screen. The reference harness and screenshots live in `tests/visual/native-parallel/operations/`. On the PR, the Operations device fixtures workflow builds the fixture, runs Maestro, and stores captures, the test log, and available viewport comparisons. A mounted fixture, compiled Hermes bundle, or successful Maestro assertion alone provides no pixel-parity result.
