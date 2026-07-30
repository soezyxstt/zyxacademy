# Plan 014: Diktat Audit, Formula Registry, and PDF QA

Snapshot: `6098211`

Branch: `codex/014-diktat-audit-pdf`

Commit: `fix(diktat): separate review and fail closed on qa`

Priority: P1

Depends on: Plans 003, 007, and 009

Effort: L

Risk: High

Confidence: High

## Objective

Separate diktat authoring from review, make audits structured and source-grounded, preserve formulas in exam intelligence, and make rendered PDF QA an awaited fail-closed publication gate.

## Current state and evidence

- `lib/diktat-auditor.ts:152` samples only the first three chapters and first three concepts.
- The AI reviewer can propose content revisions; uncited review output can influence the same authoring workflow.
- `lib/diktat-pdf-auditor.ts:41` inspects a small text sample rather than rendered pages.
- Parse failure and exceptions return PASS in `lib/diktat-pdf-auditor.ts`.
- The PDF audit is started without blocking the upload path.
- Exam intelligence structures emphasize procedural summaries but lack a first-class formula registry with symbols, units, assumptions, and source spans.

## Scope

Create or update:

- `lib/diktat/audit-contracts.ts`
- `lib/diktat/structural-auditor.ts`
- `lib/diktat/content-reviewer.ts`
- `lib/diktat/repair-author.ts`
- `lib/diktat/formula-registry.ts`
- `lib/diktat/rendered-page-auditor.ts`
- `lib/diktat-auditor.ts`
- `lib/diktat-pdf-auditor.ts`
- `lib/diktat-actions.ts`
- `lib/diktat-exam-intelligence.ts`
- PDF generation and upload integration points found by call-site search
- `db/schema.ts` only if audit run and formula provenance cannot use existing versioned metadata safely
- generated migrations if required
- `lib/env.ts` for `FEATURE_DIKTAT_QA_V2`
- `tests/contracts/diktat.test.ts`
- fixtures under `tests/fixtures/ai/diktat/`
- `docs/features.md`
- `docs/ARCHITECTURE.md`
- `docs/DB_SCHEMA.md` if schema changes
- `docs/DEVELOPMENT.md`
- `docs/operations/production-readiness-checklist.md`
- `AGENTS.md` Current State section

Do not replace the existing PDF library or visual design system unless a verified blocker is documented.

## Required audit states

- `pass`: every required check executed and passed
- `warn`: non-blocking issue with a stable code
- `fail`: blocking content or rendering issue
- `unavailable`: required checker could not run or parse its result
- `needs_review`: evidence conflict or repair decision needs a human

Provider or parser failure is never PASS.

## Implementation steps

1. Inventory the full diktat generation, audit, render, upload, and publish call graph. Identify exactly where publication becomes externally visible.
2. Split deterministic structural checks from AI review. Structural checks cover all chapters and blocks, not a first-three sample: required sections, KO/objective coverage, citations, formulas, references, renderer diagnostics, and stable IDs.
3. Define a content-review finding schema with finding ID, severity, location, claim, source span IDs, rule code, and suggested intent. The reviewer cannot directly rewrite the artifact.
4. Run the content reviewer only on approved semantic blocks and source spans from Plan 009. Require evidence for factual criticism. Unsupported proposed changes become needs-review.
5. Create a separate repair-author stage that receives accepted finding IDs and allowed block fields. Rerun structural and content checks after repair. Limit repair attempts.
6. Build a formula registry from sourced semantic blocks: canonical formula, symbol definitions, units, assumptions, domain, equivalent forms, procedural steps, and source spans.
7. Update exam intelligence to reference formula registry IDs. Do not strip formulas to avoid JSON escaping. Use the typed response schema and deterministic math serialization.
8. After PDF generation, render pages to images in a controlled worker or build environment. Run deterministic checks across all pages for page count, blank pages, clipping indicators where available, missing glyphs, broken references, and text extraction anomalies.
9. Define visual inspection coverage: always cover, contents, first and last content pages, every formula-dense page, every page with a figure/table, and any page flagged by deterministic checks. For small PDFs, inspect every page. Persist the selected page numbers and reason.
10. Use multimodal review only for layout judgments such as overlap, clipping, unreadable formula, table overflow, and visual hierarchy. It may not rewrite academic content.
11. Await the complete audit before upload or publication. `fail`, `unavailable`, and `needs_review` block publication. `warn` passes only when every warning code is on an explicit allowlist.
12. Store audit contract version, source hash, PDF hash, page selection, checker outcomes, and model route. Never reuse an audit for a different PDF hash.
13. Add fixtures for malformed JSON, provider error, blank page, clipped formula, broken glyph, uncited reviewer change, formula alias, and upload attempted before audit completion.
14. Update docs with author/reviewer separation, formula provenance, page-selection rules, and fail-closed publication.

## Test plan

```powershell
bun test tests/contracts/diktat.test.ts
bun run lint
bun run typecheck
```

Run a local fixture PDF through render and audit. Assert the uploaded/published stub is not called for fail, unavailable, or needs-review.

If schema changed:

```powershell
bun run db:generate
bun run db:migrate
```

## Done criteria

- Structural audit covers the whole artifact.
- Reviewer findings are data; only a separate bounded author stage can change content.
- Every registered formula has symbols, assumptions, and source spans where applicable.
- Required PDF QA examines rendered pages and is awaited before publication.
- Parser and provider failures are unavailable, never PASS.
- Tests, lint, and typecheck pass.

## STOP conditions

- Stop if the runtime cannot render PDFs safely. Return unavailable and block publication.
- Stop if a reviewer recommendation lacks source support.
- Stop if formula normalization changes mathematical meaning.
- Stop if upload or publish cannot be made conditional on audit completion.
