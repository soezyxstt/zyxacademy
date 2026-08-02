# Plan 008: Product Bundle V2 Workflow

Status: blocked until Plan 007 passes.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- lib app components scripts tests docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/007-authoring-context-pack-and-protected-benchmarks.md
- **Category**: direction, migration
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Import externally authored articles, diktat material, questions, solutions, flashcards, and assessment blueprints through a strict Product Bundle workflow with validation, preview, review, dependency checks, and atomic publication.

## Current state to reverify

- `lib/bundle-importer.ts` mixes content types and writes legacy entities directly.
- `lib/assessment-bundle-importer.ts` uses broad payload types and heuristic concept matching; removed assessment objects can become orphaned because they lack a lifecycle status.
- The admin bundle tabs accept JSON and simulate progress rather than reflecting durable server phases.
- `lib/material-storage.ts` already has draft, review, and publish gates that should be adapted where sound.

Anchor excerpts: `lib/bundle-importer.ts:11-21` currently updates changed KOs in place and marks downstream assets stale; `lib/assessment-bundle-importer.ts:22-25` lacks retirement status for removed objects. Product V2 must create immutable versions and explicit lifecycle transitions instead.

## Git workflow

- Create branch `codex/008-product-bundle-v2` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- new `lib/bundle/product-bundle-v2.ts`
- new `lib/bundle/product-validator.ts`
- new `lib/bundle/product-preview.ts`
- new `lib/bundle/product-publication.ts`
- version `lib/assessment-bundle-importer.ts`
- new `app/api/admin/bundles/product/**`
- `components/admin/assessment-bundle-importer-tab.tsx`
- relevant admin preview components
- `lib/env.ts`
- contract and integration tests plus bundle fixtures
- new `scripts/staging/test-product-bundle.ts`
- reuse and extend `scripts/staging/reconcile-bundle.ts`
- `package.json`
- `docs/bundle/product-bundle-v2.md`, `docs/features.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`

Out of scope: in-app AI authoring, mastery computation, Zyra, deleting legacy importers.

## Product contract

The ZIP uses the shared manifest envelope and separate typed entity files. Every product carries stable ID, version, status, Idea IDs and versions, source references, schema version, creator or curator, AI provider or model and prompt version if relevant, checksum, and generation hash.

Validation must enforce:

- referenced Ideas exist, are published, and match declared versions and hashes;
- every product type satisfies its own schema and required links;
- no holdout benchmark content is copied into generated products;
- question difficulty, cognitive level, Idea count, Idea relations, and reasoning pattern are separate fields;
- article and diktat blocks are structurally renderable;
- solution content cannot publish before its question;
- flashcards are atomic active-recall prompts;
- assessment blueprints obey quiz and tryout scope rules;
- stale or changed dependencies produce `NEEDS_REVIEW`, not silent publish.

## Workflow

1. Upload and pure validation.
2. Durable staging with exact diffs against current published versions.
3. Render preview for each product type from staged rows only.
4. Tutor reviews pedagogic and subject accuracy for assigned courses. Admin reviews policy and publishes.
5. Publication is one transaction per bundle and one audit chain. Vector outbox entries become visible after commit.
6. Re-import of the identical bundle is a no-op. Same stable entity ID with a new valid version creates a version, never mutates history in place.
7. `FEATURE_PRODUCT_BUNDLE_V2` controls the workflow.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Create strict contracts and fixtures for all product types, including stale dependency and holdout leak cases.
2. Implement pure validation and deterministic diff.
3. Implement durable staged entities and real progress reporting.
4. Implement server-rendered preview with source and Idea traceability visible to reviewers.
5. Implement review and atomic publication with forced-failure tests at each transaction stage.
6. Add the admin UI using existing primitives and semantic tokens.
7. Run all fixtures against staging and publish only a dedicated staging test bundle.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/product-bundle-v2.test.ts tests/contracts/bundle-publication.test.ts tests/contracts/material-pipeline.test.ts tests/contracts/question-pipeline.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:test-product-bundle -- --run-id <runId> --fixture all
bun --env-file=.env.staging run staging:reconcile-bundle -- --run-id <runId> --type product
git diff --check
```

Pass only when identical re-import writes zero rows, versioned re-import preserves the prior version, every forced failure yields zero partial publications, previews render all staged types, stale dependencies block publication, holdout leaks have zero tolerance, and each published entity has complete source and Idea traceability.

## Test plan

- Add one valid fixture per product type and invalid fixtures for stale Idea, lost provenance, holdout leak, missing product link, invalid assessment scope, unsafe asset, duplicate version, unauthorized review, and partial transaction failure.
- Use the current material and question contract suites as compatibility gates.

## STOP conditions

- Import relies on fuzzy concept-title mapping or maps all chapter Ideas as fallback.
- A published row is edited in place rather than versioned.
- Client-side progress differs from durable server phase.
- A reviewer can publish outside authorized course scope.
- One product becomes visible while another bundle item fails.

## Maintenance notes

All later product fields must be represented in the preview, diff, checksum, and audit projection. A field that is imported but invisible to reviewers is a publication blocker.

## Rollback

Set `FEATURE_PRODUCT_BUNDLE_V2=0`. Mark test publications superseded through an audit event if necessary. Never delete historical product versions or import evidence.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-008-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- Product Bundle V2 supports the complete hybrid authoring lifecycle.
- All products are versioned, Idea-linked, source-traceable, previewable, reviewed, and atomically published.
- Legacy import remains available only as a flag-controlled rollback path.
