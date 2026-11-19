# Recovered mascots in the LP shop

Status: `OPEN / IN PROGRESS`. Draft PR handoff, 2026-11-18.

Base: `staging` at `cd0fbe7915b7e052643d5e8ed8e9b131ee86c43d`.
Branch: `feat/mascot-glb-shop-draft`.

The requested handoff is a draft PR for another agent to continue. Keep it draft. No staging database seed, storage mutation, web deployment, or merge was performed for this change.

## Implemented

- Four recovered characters use the existing `zyra_avatar` purchase and equip slot: Zyra/cat, tiger, rhino and crocodile.
- The original 28 catalog IDs and prices remain intact. Four new entries bring the local catalog to 32 items, including 14 mascots.
- Selected large previews load their GLB through the existing lazy Three.js viewer. No new rendering framework or application dependency was needed.
- The viewer uses the installed Meshopt decoder, real skeletons, morph targets and animation clips. It preserves the existing 30 fps/DPR cap, rotation controls, visibility pause and reduced-motion behavior.
- Model changes abort pending downloads. Late parse results are discarded and disposed. The poster remains until the first draw of the selected model. Load/WebGL failure retains a poster and offers retry.
- The reward dialog and shared cosmetics studio offer seven common, prop-free actions. Profile displays retain the default idle animation.
- Small chat/catalog avatars use head posters. Large loading/failure states use full-body posters. Listing items does not request GLBs or allocate a canvas per item.
- All 153 web GLBs, eight posters, checksums and the recovered wardrobe mappings are committed. Clothing and prop purchases/equipment are not yet implemented.

### Stable IDs and draft prices

| ID | Character | Draft LP price |
| --- | --- | ---: |
| `zyra-avatar-studio-cat` | Zyra | 600 |
| `zyra-avatar-studio-tiger` | Tiger | 900 |
| `zyra-avatar-studio-rhino` | Rhino | 1,250 |
| `zyra-avatar-studio-crocodile` | Crocodile | 1,000 |

Prices follow existing character tiers and need product review before seeding. One character entitlement covers its full-body and head presentation. Server purchases use the active database price; client metadata is not a price authority.

The existing service retains its account advisory lock, atomic LP debit/inventory/ledger transaction, replay handling and ownership/slot checks. There is no new wallet, database schema, migration, feature flag or client-authoritative purchase path.

## Where to continue

| Concern | Files |
| --- | --- |
| Catalog, names, prices | `lib/gamification/catalog.ts`, `zyra-cosmetics.ts`, `labels.ts`, `messages/{id,en}/student.json` |
| Lightweight model registry | `lib/gamification/zyra-glb-mascots.ts` |
| GLB loader and disposal | `components/gamification/zyra-glb-loader.ts` |
| Canvas and animation lifecycle | `components/gamification/zyra-mascot-3d-scene.tsx`, `zyra-mascot-3d.tsx` |
| Action controls and poster selection | `components/gamification/zyra-mascot-preview.tsx`, `zyra-cosmetic-avatar.tsx`, `cosmetic-preview.tsx` |
| Runtime assets and wardrobe mappings | `public/gamification/mascots/v10.1/` |
| Reproducible asset preparation | `scripts/mascots/README.md` and its pinned tooling package |
| SQL purchase/equip tests | `tests/gamification/mascot-purchases-postgres.test.ts` |
| Integrity/catalog tests | `tests/gamification/zyra-glb-assets.test.ts` |
| Browser fixture | `tests/visual/mascot-glb-preview.spec.ts` |

The application paths remain the current achievements Rewards tab and profile appearance settings. `CosmeticsStudio` is a shared component with a fixture; this PR does not introduce a separate studio route.

## Assets and quality limits

`asset-manifest.json` accounts for 8 character variants, 140 tailored clothing/accessory assets and 5 action props. `web-catalog.json` maps 35 wardrobe concepts to the correct file for each of the four characters. It explicitly marks missing look posters as pending.

Total GLB bytes fell from 173,958,500 to 84,115,964, a 51.65% reduction. The full public directory is about 84.49 MB; the viewer requests only the selected character.

| Full model | Bytes | Triangles |
| --- | ---: | ---: |
| Cat | 3,411,720 | 83,488 |
| Tiger | 5,081,616 | 121,680 |
| Rhino | 8,707,468 | 238,012 |
| Crocodile | 11,641,688 | 295,400 |

This pass compresses accessor data with Meshopt without quantization or topology changes. Textures are capped at 1024 pixels and use WebP. WebP reduces transfer size but does not provide KTX2 GPU compression. Triangle counts and draw calls remain unchanged. Rhino and crocodile still need target-phone performance work and likely lower-detail models.

The crocodile retains the repaired skinned neck. Future simplification must retain the neck, facial morph targets, weights and bone names, and check arm/jaw clearance across the actual clips. The original source package includes recovered Blender files and the standalone HTML. Those source files are not runtime or build dependencies and are not committed here.

### Poster review

The primary agent inspected a contact sheet of all eight derived Blender renders, including the connected crocodile neck. These are asset renders, not browser screenshots.

| Character | Full poster | Head poster |
| --- | --- | --- |
| Cat | [Full](../../public/gamification/mascots/v10.1/posters/cat.webp) | [Head](../../public/gamification/mascots/v10.1/posters/cat-head.webp) |
| Tiger | [Full](../../public/gamification/mascots/v10.1/posters/tiger.webp) | [Head](../../public/gamification/mascots/v10.1/posters/tiger-head.webp) |
| Rhino | [Full](../../public/gamification/mascots/v10.1/posters/rhino.webp) | [Head](../../public/gamification/mascots/v10.1/posters/rhino-head.webp) |
| Crocodile | [Full](../../public/gamification/mascots/v10.1/posters/crocodile.webp) | [Head](../../public/gamification/mascots/v10.1/posters/crocodile-head.webp) |

## Validation

| Check | Result | Boundary |
| --- | --- | --- |
| Five focused Bun test files | 29 passed, 6,445 assertions, exit 0 | Real purchase/equip functions with local PGlite; no live database |
| Application TypeScript check | Passed, exit 0 | Local source types |
| Scoped ESLint | Passed, exit 0 | Changed production TS/TSX files |
| All GLB hashes and embedded dependencies | Passed, exit 0 | 153 shipped files |
| Decode with the app's exact Three Meshopt decoder | Passed, exit 0 | All 153 assets |
| Three GLTFLoader and animation checks | Passed, exit 0 | 76 character clips, 11,052 finite posed-vertex checks; image dimensions supplied by a Sharp-backed Node shim |
| Eight Blender poster renders | Passed, exit 0; primary inspected | Asset appearance only |
| Production build | Terminated by SIGKILL, exit 137, during Turbopack compilation | Full build not established |
| Playwright component fixture | Exit 1: Chromium `socket() failed: Operation not permitted` | Browser/GPU, responsive layout and interaction signoff remain open |

The browser fixture compiled after its initial fixture bundling issues were corrected, then failed at browser launch. It defines five scenarios at the repo's 380 x 844 and 1536 x 864 projects: selected model/actions, shop/dialog, profile, invalid-asset retry, and WebGL fallback. No browser screenshot was produced or accepted. The real Node loader checks explicitly record `gpuRender: false` and `browserValidation: false` in `scripts/mascots/three-loader-validation.json`.

Re-run from the repo root with Bun 1.3.14 and the frozen lockfile:

```sh
bun install --frozen-lockfile
bun test tests/gamification/cosmetic-slots.test.ts tests/gamification/catalog-v39.test.ts tests/gamification/zyra-mascot-models.test.ts tests/gamification/mascot-purchases-postgres.test.ts tests/gamification/zyra-glb-assets.test.ts
bun run typecheck
PLAYWRIGHT_BASE_URL=http://mascot-fixture.test bun run test:visual tests/visual/mascot-glb-preview.spec.ts
```

The fixture intercepts its own HTTP origin and serves real local assets; that URL is not an external deployment. Use the repo's browser installation command if needed. Add `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` only when using a verified installed Chromium. The primary agent must inspect the resulting screenshots before claiming the visual gate passes.

## Staging catalog seed blocker

The existing `scripts/staging/seed-gamification-catalog.ts` reads the shared catalog, but its migration preflight accepts only the pinned 18-row or 26-row journal. Newer repository records describe 37 rows after migrations 0024 through 0034. A local reproduction using the actual checked-in migration hashes confirms that the constructed 37-row history throws `UNEXPECTED_MIGRATION_HISTORY`. The current live history was not queried in this task.

Do not call the unguarded seed helper or the old staging integration test to bypass this guard. Do not rerun old migrations. Before making the new items visible:

1. Read the actual staging identity, journal, required profile/catalog columns and existing catalog using verified staging credentials.
2. Update only the seed-specific preflight to accept the unchanged pinned 26-row prefix and the exact known appended migrations. Keep the migration bridge's original strict classifier intact. Reject unknown, missing, duplicate, reordered and altered entries in focused tests.
3. Retain the current hostname, branch, database, schema, catalog-conflict, locking and transaction checks.
4. Confirm the four draft prices, deploy the reviewed application branch through the established staging release flow, run the guarded seed, then verify the four IDs and resulting catalog. Seeding and deploying are separate actions.
5. Exercise buy, retry, equip, refresh and public/private profile behavior with an eligible staging test account. Do not infer hosted acceptance from the PGlite tests.

## Remaining implementation

1. **Complete build and browser acceptance.** Check all four characters, the seven shared actions, camera framing, animation on/off, hidden/offscreen pause, reduced motion, rapid switching and failure recovery on real target browsers.
2. **Measure and reduce rendering cost.** Benchmark phones before choosing simplification and KTX2 settings. Preserve rig/morph/neck behavior. Moving the versioned assets to the established storage adapter/CDN can follow after the local path works.
3. **Add owned clothing slots and composition.** One wardrobe concept maps to four fitted meshes. Rebind garments to the matching skeleton and persist only compatible owned equipment. Add the database contract, generated migration and transactional tests before exposing purchases.
4. **Attach action props.** Cycling, flying, basketball, flowers and beach actions need their attachment logic. `giveFlowers` specifically attaches through `Paw_L`. The initial action selector deliberately includes only the seven prop-free clips.
5. **Create wardrobe thumbnails.** The recovered HTML did not include the 152 legacy PNG references. Generate them from the actual equipped models; do not use broken source paths.
6. **Review the existing single-viewer lease.** Opening a second large viewer retires the first. The underlying component can now recover through Retry or a new model selection, but automatic restoration after a nested dialog closes remains open. Keep one active canvas and avoid shared mutable skeletons.

No production data, rollout flag, old cosmetic ownership or price was changed by this draft.
