# Plan 007: Authoring Context Pack and Protected Benchmarks

Status: blocked until Plan 006 passes.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- lib app components scripts tests docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: plans/006-idea-bundle-v2-workflow.md
- **Category**: security, direction
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Export a deterministic Authoring Context Pack for external AI or tutor authoring while preventing protected ITB holdout questions, murid data, secrets, and unpublished content from leaving Zyx.

## Current state to reverify

- Existing assessment sources and assessment objects can represent past questions, but authoring eligibility and holdout separation are not a hard boundary.
- Existing bundle flows do not produce one versioned context export rooted in approved Ideas.
- Murid profiles live in operational tables and must never be included in a content-authoring bundle.

Anchor excerpt from `lib/assessment-bundle-importer.ts:19-25`: current imports match by `canonicalQuestionHash`, update changed rows in place, and leave removed objects as `aoOrphaned` because there is no lifecycle status. The new export must select only explicit current versions and visibility states.

## Git workflow

- Create branch `codex/007-authoring-context` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- new `lib/authoring/context-pack.ts`
- new `lib/authoring/policy.ts`
- new `lib/authoring/redaction.ts`
- new `app/api/admin/authoring-context/**`
- new admin export UI adjacent to Idea Bundle review
- `lib/env.ts`
- R2 staging integration using a run-specific prefix
- new `scripts/staging/test-authoring-context.ts`
- new `scripts/staging/scan-context-pack.ts`
- `package.json`
- tests and fixtures under `tests/contracts/authoring-context.test.ts`
- `docs/bundle/authoring-context-pack-v1.md`, `docs/features.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `AGENTS.md`

Out of scope: calling an external AI provider, importing products, modifying benchmark questions, production R2.

## Export contract

1. Export only published, current Ideas and source excerpts approved for authoring.
2. Include course and chapter metadata, Idea stable IDs and versions, source citations, Idea relations, learning objectives, content requirements, allowed benchmark summaries, bundle schema contracts, and generation constraints.
3. Exclude all `authoring_visibility=holdout` question stems, options, answers, solutions, embeddings, and uniquely identifying paraphrases.
4. Exclude users, emails, enrollments, attempts, answers, mastery, chats, credentials, internal URLs with signatures, and provider secrets.
5. Use a deterministic ZIP layout and checksum. The same database snapshot and request produce the same manifest and entity checksums.
6. Store the encrypted or private artifact in the staging R2 bucket under `overhaul/<runId>/authoring-context/<packId>.zip`; use no public URL and apply a retention timestamp.
7. Record export actor, filter policy version, source entity versions, holdout count excluded, artifact checksum, and R2 object key in `audit_mutasi`.
8. `FEATURE_AUTHORING_CONTEXT_V1` controls the UI and API.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Implement a pure allowlist projection. Do not serialize database rows directly.
2. Add adversarial fixtures containing secrets, signed URLs, murid data, and holdout content in nested JSON and Markdown.
3. Build deterministic ZIP serialization and verification.
4. Add admin-only API. Tutor may request a pack only for an assigned course if policy permits; default to admin-only until this path is explicitly tested.
5. Upload one staging test pack to R2, download it through authenticated server code, verify checksum, and delete only the test object by exact key after the evidence artifact is complete.
6. Add a content scan that fails on known fixture canaries and forbidden field names.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/authoring-context.test.ts tests/contracts/authoring-redaction.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:test-authoring-context -- --run-id <runId> --course tutorial-pka
bun --env-file=.env.staging run staging:scan-context-pack -- --run-id <runId>
git diff --check
```

Pass only when two exports from the same snapshot have identical checksums, the forbidden-content scan reports zero findings, every holdout row is counted as excluded, no murid or credential field is present, the R2 round trip checksum matches, and audit metadata is complete.

## Test plan

- Cover deterministic ordering, nested murid fields, signed URLs, secret canaries, allowed references, holdout references, stale Ideas, unassigned tutor access, R2 checksum mismatch, and retention metadata.
- Unit tests must use an in-memory artifact adapter; only the staging smoke test touches R2.

## STOP conditions

- Any holdout content or murid data appears in the pack.
- The same snapshot produces different checksums.
- The R2 target is public, not staging, or lacks a run-specific prefix.
- Export can include draft, stale, superseded, or unreviewed Ideas.
- The system calls an external model as part of export.

## Maintenance notes

Treat the export field allowlist as a security boundary. Any new entity or field stays excluded until a test proves it contains no private, secret, or holdout data.

## Rollback

Set `FEATURE_AUTHORING_CONTEXT_V1=0`. Revoke access to generated test artifacts by exact object key. Keep the audit record and checksum evidence.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-007-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- Zyx can emit a reproducible, safe authoring package based on approved Ideas.
- Holdout benchmarks are technically separated from authoring inputs.
- No learner data or secrets leave the operational boundary.
