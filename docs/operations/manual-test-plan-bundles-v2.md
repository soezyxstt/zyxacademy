# Manual test plan: Product Bundle V2 and Idea Bundle V2

Manual, human-driven verification of the two ZIP import boundaries. Complements the automated staging scripts (`staging:test-idea-bundle`, `staging:test-product-bundle`) and the contract tests in `tests/contracts/`; it does not replace them.

Scope covers the admin UI, the HTTP API, the role matrix, the ZIP security boundary, and post-publication database state.

Contracts under test: `docs/bundle/idea-bundle-v2.md`, `docs/bundle/product-bundle-v2.md`.

---

## 1. Preconditions

### 1.1 Environment

| Item | Value |
|---|---|
| Branch | `staging` |
| Flags | `FEATURE_IDEA_BUNDLE_V2=1`, `FEATURE_PRODUCT_BUNDLE_V2=1` |
| Admin guard flag | `FEATURE_PERAN_V2` (when `1`, `/admin/*` redirects non-admin to `/`) |
| Database | Local `dev.db`, or staging Turso. Never production. |
| App | `bun run dev` |

Restart the dev server after any flag change; flags are read through `lib/env.ts` and in route handlers through `process.env` at request time, but the page-level `notFound()` reads the validated `env` object.

### 1.2 Accounts

Three sessions are needed. There is no `/api/dev-login` route on this branch, so create these through the normal auth flow and set roles directly in `dev.db`.

| Account | `user.role` | Used for |
|---|---|---|
| A1 | `admin` | Upload, review, publish |
| T1 | `teacher`, assigned to the bundle course | Review-only path |
| S1 | `student` | Negative authorization |

### 1.3 Data prerequisites

Validation is pure and needs no database. Publication does. Before any publish case, confirm the target rows exist:

- A course whose id matches `manifest.courseId`, with at least one chapter.
- For Product Bundle: at least one published Idea, one active source material, one source excerpt, and one `allowed` ITB curation reference in that course.
- `manifest.creatorId` and `manifest.curatorId` must resolve to real `user` rows, otherwise publication fails with `*_CREATOR_NOT_FOUND` / `*_CURATOR_NOT_FOUND`.

### 1.4 Fixtures

**Idea Bundle.** A complete on-disk fixture tree exists at `tests/fixtures/bundles/idea-v2/`. Zip its contents with `manifest.json` at the archive root:

```bash
cd tests/fixtures/bundles/idea-v2 && zip -r -X ../../../../artifacts/manual/idea-valid.zip . -x '.*'
```

PowerShell equivalent:

```powershell
Compress-Archive -Path "tests\fixtures\bundles\idea-v2\*" -DestinationPath "artifacts\manual\idea-valid.zip" -Force
```

Verify the archive has no wrapping directory; `manifest.json` must be the top-level entry. A wrapping folder produces `BUNDLE_MISSING_MANIFEST`.

Note that this fixture declares `courseId: "course-physics"` and fixture-local creator ids. It will pass validation and staging on any database, but publication requires those identities to exist. Either seed them or edit the fixture and recompute checksums (see 1.5).

**Product Bundle.** No on-disk fixture exists. The only valid product bundle is built in-process by `makeValidFiles()` in `scripts/staging/test-product-bundle.ts`, which never writes a ZIP to disk. Before running Part B, produce one of:

1. A short throwaway script that imports the same helpers and writes `archive(makeValidFiles(...))` to a file, or
2. A hand-built bundle following `docs/bundle/product-bundle-v2.md` plus the invariants in `lib/bundle/product-validator.ts`.

Track this as blocking prep work; the rest of Part B cannot execute without it.

### 1.5 Recomputing checksums

Every mutation of a fixture invalidates two layers: the per-file checksum in `manifest.entityFiles[]` / `manifest.sourceVersions[]`, and `manifest.bundleChecksum`. Cases that intentionally break a checksum must break exactly one layer, otherwise the reported reason code will not be the one under test. `computeIdeaBundleChecksum` in `lib/bundle/idea-bundle-v2.ts` is the reference implementation.

---

## 2. Idea Bundle V2

Panel: `/admin/bundles/idea`. API base: `/api/admin/bundles/idea`.

### 2.1 Happy path

**IB-01 Panel renders.**
Sign in as A1, open `/admin/bundles/idea`. Expect heading "Idea Bundle V2", a file input restricted to `.zip`, and an import list. With no prior imports the list reads "Belum ada Idea Bundle."

**IB-02 Valid upload stages.**
Select `idea-valid.zip`, submit "Validasi dan staging". Expect HTTP 201, a success line `Bundle bundle-idea-motion-v2 masuk staging.`, and a new list row showing bundle id, checksum, course, and `Status validated`. Confirm no canonical rows were written: `ide`, `sumber_materi`, and `chunk` counts are unchanged.

**IB-03 Review buttons gate on status.**
On the `validated` row, "Setujui" and "Tolak" are visible; "Publikasikan" is not.

**IB-04 Approve.**
Click "Setujui". Expect message "Bundle disetujui.", row status becomes `approved`, review and publish buttons swap.

**IB-05 Publish.**
Click "Publikasikan". Expect "Bundle dipublikasikan secara atomik." and status `published`. Then verify in the database:
- `impor_bundle.status = 'published'`.
- `publikasi_bundle` has one row for the import with `status = 'published'`.
- Every `item_impor_bundle` row for the import has `status = 'published'`.
- `ide`, `sumber_materi`, `provenance`, and relation rows exist with the bundle's stable ids.
- `vector_sync_queue` holds outbox jobs for embedding-eligible chunks (`source_materials`) and published Ideas (`canonical_ideas`).
- `audit_mutasi` records the review and the publication.

**IB-06 Republish is rejected.**
Reload and attempt publish again through the API. Expect 422 `IDEA_BUNDLE_ALREADY_PUBLISHED`.

### 2.2 Idempotency and conflict

**IB-07 Identical retry is a no-op.**
Upload the byte-identical `idea-valid.zip` again. Expect HTTP 200 (not 201), message ending "sudah ada", and no new row in the list. `impor_bundle` and `item_impor_bundle` counts are unchanged.

**IB-08 Same id, different checksum is blocked.**
Edit `manifest.createdAt`, recompute `bundleChecksum` only, keep `bundleId`. Upload. Expect 422 and the panel error text `IDEA_BUNDLE_CONFLICT`.

### 2.3 Validation failures

Each case is a single mutation of the valid fixture. Expected result in all cases: HTTP 422, no new `impor_bundle` row, and the panel error line showing the joined `reasonCodes`.

| Case | Mutation | Expected first code |
|---|---|---|
| IB-09 | Zip with a `../manifest.json` entry | `ZIP_PATH_TRAVERSAL` |
| IB-10 | Replace `entities/ideas.json` with `[]`, recompute bundle checksum only | `BUNDLE_ENTITY_CHECKSUM_MISMATCH` |
| IB-11 | Delete `sources/kinematika.md`, recompute bundle checksum only | `BUNDLE_MISSING_SOURCE` |
| IB-12 | Duplicate the idea entry with a new `id`, same `stableKey` | `BUNDLE_DUPLICATE_STABLE_KEY` |
| IB-13 | Remove `manifest.json` | `BUNDLE_MISSING_MANIFEST` |
| IB-14 | Add an unknown top-level manifest field | `BUNDLE_INVALID_MANIFEST` |
| IB-15 | Set `schemaVersion` to `idea-bundle.v3` | `BUNDLE_UNSUPPORTED_SCHEMA` |
| IB-16 | Non-empty `manifest.conflicts` | `BUNDLE_UNRESOLVED_CONFLICT` |
| IB-17 | Provenance offsets outside the chunk span | `BUNDLE_INVALID_SPAN` |
| IB-18 | Two relations forming a prerequisite cycle | `BUNDLE_PREREQUISITE_CYCLE` |
| IB-19 | Relation whose `fromIdeaId` equals `toIdeaId` | `BUNDLE_INVALID_RELATION` |
| IB-20 | Mutate `sources/kinematika.md` body only | `BUNDLE_SOURCE_CHECKSUM_MISMATCH` |

IB-09 is raised by `readSecureZip` before validation, so the response error field is the `ZipSecurityError` code rather than `IDEA_BUNDLE_VALIDATION_FAILED`. Both surface in the panel.

### 2.4 Publication-time failures

These pass validation and fail after approval. Drive them through the API.

| Case | Setup | Expected |
|---|---|---|
| IB-21 | Publish an import still in `validated` | 422 `IDEA_BUNDLE_ADMIN_APPROVAL_REQUIRED` |
| IB-22 | `manifest.courseId` names a course that does not exist | 422 `IDEA_BUNDLE_COURSE_MISSING` |
| IB-23 | `creatorId` names a missing user | 422 `IDEA_BUNDLE_PUBLISHER_NOT_FOUND` or `IDEA_BUNDLE_REVIEWER_NOT_FOUND` depending on which identity is absent |
| IB-24 | Publish an id that does not exist | 404 `IDEA_BUNDLE_NOT_FOUND` |

**IB-25 Partial failure rolls back.**
Reproduces the automated forced-failure case by hand. Set `STAGING_BUNDLE_FAILURE_TEST=1` and call `publishIdeaBundle({ importId, publishedBy, testFailureAfter: "ideas" })` from a scratch script. Expect the call to throw `IDEA_BUNDLE_TEST_FAILURE`, and afterwards:
- `impor_bundle.status` is still `approved`, not `failed` or `published`.
- Zero `ide` rows and zero `sumber_materi` rows exist for the bundle's stable ids.
- No `publikasi_bundle` row.

This is the single most important manual case; it proves no partial publication is visible after a transaction failure.

---

## 3. Product Bundle V2

Panel: `/admin/bundles/product`. API base: `/api/admin/bundles/product`.

Requires the fixture from 1.4. The valid fixture covers all seven product types: `article`, `diktat`, `question`, `solution`, `flashcard_set`, `flashcard`, `assessment_blueprint`.

### 3.1 Happy path

**PB-01 Panel renders.**
As A1, open `/admin/bundles/product`. Expect heading "Product Bundle V2" and, unlike the Idea panel, a "Preview" button on every row.

**PB-02 Valid upload stages.** Same expectations as IB-02, message "masuk staging", status `validated`.

**PB-03 Preview and traceability.**
Click "Preview". Expect a "Preview dan traceability" section listing one article per product, each showing `title (productType vN)`, the linked Idea ids and source ids, and up to two content sections. Math in previews renders through `MathText`; confirm a formula in the article body renders as math, not raw LaTeX.

**PB-04 Publication not blocked.**
With current dependencies, the warning "Publikasi tertahan karena dependency memerlukan review." is absent.

**PB-05 Approve then publish.**
Approve, then publish. Expect "Product Bundle dipublikasikan secara atomik." and status `published`. Verify routing of content to the correct tables:
- article content in `artikel`,
- diktat in `diktat_materi`,
- question in `soal`,
- solution in `pembahasan_soal`,
- flashcard set and card in `set_flashcard` and `flashcard`,
- blueprint in `blueprint_asesmen`.

There is no generic `product` namespace; a row landing anywhere else is a defect. Also verify `publikasi_bundle`, per-item statuses, the canonical vector outbox entries, and `audit_mutasi`.

### 3.2 Idempotency, conflict, versioning

**PB-06 Identical retry is a no-op.** HTTP 200, "sudah ada", no new rows.

**PB-07 Same id, different checksum.** 422 `PRODUCT_BUNDLE_CONFLICT`.

**PB-08 Versioned re-import.**
Bump every product `version` to `2`, refresh `generationHash`, give the bundle a new `bundleId`, point the question at a second `allowed` ITB reference, recompute checksums. Upload, approve, publish. Expect success, and expect both generations to remain queryable: version 2 rows exist under versioned target ids such as `product-id:v2`, and the original version 1 rows are still present and unchanged.

### 3.3 Dependency gating

**PB-09 `NEEDS_REVIEW` dependency blocks publication.**
Add a dependency entry with `freshness: "NEEDS_REVIEW"` pointing at the article product, new `bundleId`, recompute checksums. Upload and approve.
- In "Preview", expect the warning "Publikasi tertahan karena dependency memerlukan review." and `publicationBlocked: true` in the JSON response.
- Publishing anyway returns 422 `PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW`.
- Confirm no product rows were written.

**PB-10 `STALE` dependency behaves the same.** Repeat PB-09 with `freshness: "STALE"`.

### 3.4 Validation failures

Single-mutation cases against the valid fixture. All expect HTTP 422 and no new import row.

| Case | Mutation | Expected code |
|---|---|---|
| PB-11 | Set an Idea link weight so the product total is not `1` | `PRODUCT_IDEA_WEIGHT_SUM_INVALID` |
| PB-12 | Set an Idea link weight to `0` or negative | `PRODUCT_IDEA_LINK_INVALID` |
| PB-13 | Give a flashcard two Idea links | `PRODUCT_FLASHCARD_IDEA_COUNT_INVALID` |
| PB-14 | Put two prompts in one flashcard, or set `atomic: false` | `PRODUCT_FLASHCARD_NOT_ATOMIC` |
| PB-15 | Remove the flashcard's `setId` target | `PRODUCT_FLASHCARD_SET_MISSING` |
| PB-16 | Delete the question the solution references | `PRODUCT_SOLUTION_QUESTION_MISSING` |
| PB-17 | Blueprint references a question id not in the bundle | `PRODUCT_ASSESSMENT_QUESTION_MISSING` |
| PB-18 | Blueprint `chapterIds` outside the manifest course | `PRODUCT_ASSESSMENT_SCOPE_INVALID` |
| PB-19 | Remove `itbCuration` from the question product | `PRODUCT_ENTITY_INVALID` |
| PB-20 | Duplicate an `itbCuration.referenceId` | `PRODUCT_ITB_CURATION_DUPLICATE` |
| PB-21 | Question links two Ideas without a relation for each | `PRODUCT_QUESTION_RELATION_INCOMPLETE` |
| PB-22 | Multi-Idea question at cognitive level `remember` | `PRODUCT_QUESTION_MULTI_IDEA_HOT_REQUIRED` |
| PB-23 | Two products sharing id and version | `PRODUCT_DUPLICATE_VERSION` |
| PB-24 | `manifest.courseId` differs from a product's course | `PRODUCT_COURSE_MISMATCH` |
| PB-25 | Non-empty `manifest.conflicts` | `PRODUCT_UNRESOLVED_CONFLICT` |
| PB-26 | Mutate `entities/products.json` without refreshing its manifest checksum | `PRODUCT_ENTITY_CHECKSUM_MISMATCH` |
| PB-27 | Remove `entities/dependencies.json` | `PRODUCT_ENTITY_FILE_MISSING` |
| PB-28 | Remove `manifest.json` | `PRODUCT_MANIFEST_MISSING` |
| PB-29 | Upload a non-ZIP file renamed to `.zip` | `PRODUCT_ZIP_INVALID` |

### 3.5 Holdout leak

**PB-30 Holdout marker is rejected.**
Set the first article block's content to `HOLDOUT_CANARY`, new `bundleId`, recompute checksums, upload. Expect 422 `PRODUCT_HOLDOUT_LEAK`. This is the assessment-integrity guard; it must fail closed even though the bundle is otherwise well formed.

### 3.6 Diktat lineage

Applies when a diktat product carries Article lineage fields (`sourceArticleId`, `sourceArticleVersion`, `sourceArticleGenerationHash`).

| Case | Mutation | Expected code |
|---|---|---|
| PB-31 | Lineage present, matching Article dependency removed | `PRODUCT_DIKTAT_LINEAGE_DEPENDENCY_MISSING` |
| PB-32 | Lineage with version present but generation hash omitted | `PRODUCT_DIKTAT_LINEAGE_INCOMPLETE` |
| PB-33 | Lineage generation hash altered | `PRODUCT_DIKTAT_LINEAGE_HASH_MISMATCH` |

### 3.7 Publication-time failures

| Case | Setup | Expected |
|---|---|---|
| PB-34 | Publish while status is `validated` | 422 `PRODUCT_BUNDLE_ADMIN_APPROVAL_REQUIRED` |
| PB-35 | `creatorId` missing from `user` | 422 `PRODUCT_BUNDLE_CREATOR_NOT_FOUND` |
| PB-36 | `curatorId` missing from `user` | 422 `PRODUCT_BUNDLE_CURATOR_NOT_FOUND` |
| PB-37 | Publish a nonexistent id | 404 `PRODUCT_BUNDLE_NOT_FOUND` |

**PB-38 Per-stage rollback matrix.**
For each stage in `article`, `diktat`, `question`, `solution`, `flashcard_set`, `flashcard`, `assessment_blueprint`, `outbox`: stage a fresh bundle, approve, then set `STAGING_PRODUCT_FAILURE_TEST=1` and call `publishProductBundle({ ..., testFailureAfter: <stage> })`. For every stage expect the throw `PRODUCT_BUNDLE_TEST_FAILURE`, `impor_bundle.status` still `approved`, and zero visible product rows across all seven target tables. A single stage that leaves rows behind is a release blocker.

---

## 4. Cross-cutting

### 4.1 ZIP security boundary

Applies identically to both endpoints. Build each archive by hand and upload it; expect 422 and the code below, with the request rejected before any JSON parsing.

| Case | Archive property | Expected code |
|---|---|---|
| ZS-01 | Entry path `../manifest.json` | `ZIP_PATH_TRAVERSAL` |
| ZS-02 | Absolute entry path | `ZIP_ABSOLUTE_PATH` |
| ZS-03 | NUL byte or invalid UTF-8 in an entry name | `ZIP_INVALID_PATH` |
| ZS-04 | Two entries normalizing to the same path | `ZIP_DUPLICATE_PATH` |
| ZS-05 | Symlink entry | `ZIP_SYMLINK` |
| ZS-06 | Entry with an executable mode or extension | `ZIP_EXECUTABLE` |
| ZS-07 | `.zip` nested inside the archive | `ZIP_NESTED_ARCHIVE` |
| ZS-08 | Password-protected archive | `ZIP_ENCRYPTED` |
| ZS-09 | More than 256 entries | `ZIP_ENTRY_LIMIT` |
| ZS-10 | Single file over 8 MiB | `ZIP_FILE_LIMIT` |
| ZS-11 | Compression ratio over 200:1 (zip bomb) | `ZIP_COMPRESSION_LIMIT` |
| ZS-12 | Deliberately corrupted CRC | `ZIP_CRC_MISMATCH` |
| ZS-13 | Truncated archive | `ZIP_TRUNCATED` |
| ZS-14 | Multi-disk archive | `ZIP_MULTI_DISK_UNSUPPORTED` |
| ZS-15 | Non-deflate compression method | `ZIP_UNSUPPORTED_COMPRESSION` |
| ZS-16 | Plain text file renamed to `.zip` | `ZIP_NOT_ARCHIVE` |

**ZS-17 Upload size ceiling.** A file over 32 MiB returns HTTP 413 with `IDEA_BUNDLE_FILE_LIMIT` / `PRODUCT_BUNDLE_FILE_LIMIT`, short-circuiting before the ZIP reader.

**ZS-18 Missing file part.** POST with no `file` field returns 400 `*_FILE_REQUIRED`.

After every case in 4.1, confirm nothing was written to a filesystem path: the reader parses in memory and never extracts.

### 4.2 Role matrix

The panels live under `app/(admin)/layout.tsx`, which redirects any non-admin to `/` when `FEATURE_PERAN_V2=1`. So teacher review must be exercised against the API directly, not the UI.

| Case | Actor | Action | Expected |
|---|---|---|---|
| RM-01 | Anonymous | GET either panel | Redirect to sign-in |
| RM-02 | S1 student | GET either panel | Redirect to `/` |
| RM-03 | S1 student | POST upload | 401 `Unauthorized` |
| RM-04 | T1 teacher | GET either panel | Redirect to `/` |
| RM-05 | T1 teacher | POST upload | 401 `Unauthorized` |
| RM-06 | T1 teacher, assigned to the course | POST review `approved` | 200 |
| RM-07 | T1 teacher, not assigned to the course | POST review | 403 `IDEA_BUNDLE_REVIEW_COURSE_FORBIDDEN` |
| RM-08 | T1 teacher | POST publish | 401 `Unauthorized` |
| RM-09 | A1 admin | POST publish | 200 |
| RM-10 | A1 admin | Second review on an already-reviewed import | 422 `*_REVIEW_IMMUTABLE` |
| RM-11 | Any | POST review with `{"decision":"maybe"}` | 400 `*_REVIEW_INVALID` |
| RM-12 | Any | POST review with an extra JSON field | 400 `*_REVIEW_INVALID` (schema is `.strict()`) |

RM-12 matters because the review schema rejects unknown fields; a client sending extra keys fails rather than silently dropping them.

### 4.3 Feature flag rollback

| Case | Setup | Expected |
|---|---|---|
| FF-01 | `FEATURE_IDEA_BUNDLE_V2=0`, restart | `/admin/bundles/idea` returns 404; sidebar entry gone |
| FF-02 | Same | All four idea API routes return 404 `IDEA_BUNDLE_V2_DISABLED` |
| FF-03 | `FEATURE_PRODUCT_BUNDLE_V2=0`, restart | `/admin/bundles/product` returns 404 |
| FF-04 | Same | All four product API routes return 404 `PRODUCT_BUNDLE_V2_DISABLED` |
| FF-05 | Flags off | Legacy importers still reachable as the rollback path |
| FF-06 | Flags back on | Previously published imports and their audit records are intact; nothing was deleted |

FF-06 is the contract requirement that published evidence is never deleted as a rollback mechanism.

### 4.4 UI conformance

Run these on the two panels with both bundles in the list.

- **UI-01** Test at 380px width. The import list stays single column, the checksum wraps rather than overflowing, and the action buttons wrap without horizontal page scroll.
- **UI-02** Toggle dark mode. Success text uses `status-success`, errors use `status-error`, and no raw hex or default Tailwind neutral leaks through.
- **UI-03** No `rounded-full` on any non-circular element in either panel.
- **UI-04** During upload, the submit button shows its loading state and all row actions are disabled.
- **UI-05** A failed upload shows the joined reason codes, not a generic message. Verify against IB-10, which should render `BUNDLE_ENTITY_CHECKSUM_MISMATCH` verbatim.
- **UI-06** Keyboard only: tab to the file input, select, submit, then reach "Setujui" and "Publikasikan" with a visible focus ring.

---

## 5. Post-run verification

After the Part A and Part B publications, run the independent reconcilers rather than trusting the UI:

```bash
bun --env-file=.env.staging run staging:reconcile-bundle -- --run-id <runId> --type idea
```

```bash
bun --env-file=.env.staging run staging:reconcile-bundle -- --run-id <runId> --type product
```

Each writes `artifacts/staging-overhaul/<runId>/plan-006-reconcile.json` or `plan-008-reconcile.json`. A run is `passed` only when the import is `published`, a `publikasi_bundle` row is `published`, and the item count is non-zero.

Note that `reconcile-bundle` reads the `plan-00X-result.json` artifact for the import id, so it expects a run id produced by the automated scripts. For a purely manual run, query `impor_bundle` and `publikasi_bundle` directly instead.

---

## 6. Observations from plan authoring

Not defects to fix inside this plan; they change how the manual run is executed.

1. **The Idea panel has no preview.** `GET /api/admin/bundles/idea/[id]` exists and `validationReport` is passed into the client component, but `components/admin/idea-bundle-v2-panel.tsx` never renders it and has no equivalent of the product panel's "Preview" button. An Idea reviewer approving through the UI is approving without seeing entity contents. Cases IB-09 through IB-20 must therefore be verified from the API response, not the panel.
2. **No on-disk Product Bundle fixture.** Blocks Part B until built; see 1.4.
3. **Teacher review is API-only.** The `/admin` layout guard redirects teachers before they reach either panel, while both review routes accept `teacher`. The documented tutor review step in `docs/bundle/idea-bundle-v2.md` has no UI path.
4. **`/api/dev-login` does not exist on this branch.** Set roles directly in `dev.db` for 1.2.

---

## 7. Evidence

Record per case: case id, actor, HTTP status, reason code, database assertion result, pass or fail, and a screenshot for every UI case. File under `artifacts/manual/<date>/`.

Release blockers, any one of which fails the run: IB-25, PB-30, PB-38, every case in 4.1, RM-03, RM-05, RM-08, FF-06.
