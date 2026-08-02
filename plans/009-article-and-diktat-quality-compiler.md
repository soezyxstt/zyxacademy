# Plan 009: Article and Diktat Quality Compiler

Status: blocked until Plan 008 passes.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- lib components scripts tests docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/008-product-bundle-v2-workflow.md
- **Category**: direction, correctness
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Turn approved Ideas into consistently strong articles and compressed diktat material. The compiler validates and assembles externally authored content; it does not spend AI quota or invent canonical facts.

## Current state to reverify

- `lib/materials/compiler.ts` currently performs a basic preflight, creates a shallow outline, excludes duplicate titles, and serializes a deterministic AST.
- `tests/contracts/material-pipeline.test.ts` covers inactive Ideas or KOs, duplicate exclusion, deterministic serialization, and revision diff, but not the full pedagogic product contract.
- `lib/material-storage.ts` already has review and publish states plus vector outbox behavior that should be preserved behind the new repository boundary.
- Current website materials store Markdown, AST, hashes, coverage, and term index.

Anchor excerpt from `lib/materials/compiler.ts:38-53`: `MaterialSectionOutline` currently contains title, one learning objective, included KO IDs, exclusions, prerequisites, and conflicts; `MaterialOutlinePlan` is only a list of those sections plus preflight errors. The new block contract extends this shape rather than discarding deterministic serialization.

## Git workflow

- Create branch `codex/009-material-quality` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- `lib/materials/compiler.ts`
- `lib/materials/interactive-layer.ts`
- `lib/materials/revision-diff.ts`
- new `lib/materials/article-contract.ts`
- new `lib/materials/diktat-contract.ts`
- new `lib/materials/quality-gates.ts`
- adapt `lib/material-storage.ts` to new product repositories behind flags
- new `components/admin/article-preview.tsx`
- new `components/admin/diktat-preview.tsx`
- tests and fixtures for material pipeline
- new `scripts/staging/compile-product-preview.ts`
- new `scripts/staging/verify-material-quality.ts`
- `package.json`
- `docs/features.md`, `docs/ARCHITECTURE.md`, `docs/bundle/product-bundle-v2.md`, `AGENTS.md`

Out of scope: calling Gemini, generating canonical Ideas, question generation, PDF pixel-perfect design changes beyond structural QA.

## Article contract

An article develops multiple Ideas pedagogically. Its ordered blocks must include:

1. prior-knowledge activation;
2. problem introduction;
3. for each Idea: explanation, verbal representation, mathematical representation when applicable, analogy when applicable, worked example, misconception, application, and retrieval prompt;
4. cross-Idea synthesis when more than one Idea is present;
5. summary and retrieval close.

A conditionally inapplicable block must carry a typed reason. Empty placeholders do not count. Each block records covered Idea IDs, source references, learning purpose, generation hash, and reviewer state.

## Diktat contract

`diktat_materi` compresses an approved article. It may remove elaboration, but must preserve every core Idea statement, required formula, variable definition, units, caveat, and source trace. It records the source article version and hash. It cannot add a canonical claim absent from the article or Ideas.

## Quality gates

- 100 percent of article Ideas have all required or justified blocks.
- 100 percent of factual and formula-bearing blocks link to approved Idea and source references.
- No unresolved placeholder, broken internal link, missing asset, invalid math token, or stale dependency.
- Article sequence respects prerequisite Idea relations.
- Diktat Idea coverage equals article core-Idea coverage.
- Diktat compression report lists every removed block and proves no core statement or formula was removed.
- Deterministic compile: identical inputs yield identical AST, Markdown, term index, and generation hash.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Add typed block contracts and invalid fixtures for missing blocks, stale Idea versions, bad formulas, unsupported claims, and lost diktat coverage.
2. Refactor the outline planner to order Ideas by prerequisite graph and reject cycles.
3. Compile staged Product Bundle blocks into deterministic article AST and Markdown.
4. Compile diktat only from the approved article representation, never independently from raw source.
5. Extend preview to show Idea and source traceability plus quality-gate reason codes.
6. Adapt review and publication to fail closed on any quality gate.
7. Run fixture publication and a Tutorial PKA dry run. Do not replace current published Tutorial PKA material in this plan.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/material-pipeline.test.ts tests/contracts/article-quality.test.ts tests/contracts/diktat-compression.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:compile-product-preview -- --run-id <runId> --course tutorial-pka --dry-run
bun --env-file=.env.staging run staging:verify-material-quality -- --run-id <runId>
git diff --check
```

Pass only when all quality metrics are 100 percent for valid fixtures, each invalid fixture fails with the expected stable reason code, deterministic outputs match byte for byte, Tutorial PKA dry run changes zero canonical rows, and legacy material contract tests still pass.

## Test plan

- Cover every required block, justified inapplicability, prerequisite ordering, cycle rejection, source coverage, formula preservation, stale dependency, deterministic compile, and diktat compression loss.
- Extend `tests/contracts/material-pipeline.test.ts` rather than replacing its existing regression cases.

## STOP conditions

- The compiler invents or calls AI for missing content.
- A missing pedagogic block is silently skipped.
- Diktat is generated from sources independently of the reviewed article.
- A stale Idea or dependency can publish.
- Existing Tutorial PKA material is overwritten during dry run.

## Maintenance notes

New pedagogic block types require contract, preview, source-trace, and compression handling together. Reviewers should reject quality gates based only on word count.

## Rollback

Set `FEATURE_PRODUK_IDE_V1=0` and keep current material reads. Staged previews and reports may remain. Do not delete prior published product versions.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-009-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- Article quality is enforced as a pedagogic block contract, not a text-length heuristic.
- Diktat is a traceable compression of an approved article.
- Publication gates are deterministic and fail closed.
