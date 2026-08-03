# Plan 013: Zyra Canonical Runtime

Status: blocked until Plan 012 passes.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- lib app components prompts scripts tests docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/012-vectorize-only-indexing-and-retrieval.md
- **Category**: security, correctness
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Make Zyra an interactive layer over approved canonical content and direct murid state. Zyra may explain and tutor, but it may not become the source of truth or expose assessment answers.

## Current state to reverify

- `lib/tutor-rag.ts` queries multiple legacy namespaces, retrieves vector hits, and hydrates content.
- Existing V2 contracts cover cache isolation, query-action routing, evidence coverage, citations, pedagogy, visual specifications, and assessment assistance policy.
- Tutor session summaries, chat sessions, messages, and sources store learner interaction history.
- Current code can answer a general question without retrieved course evidence in some paths. The new course-knowledge mode must fail closed or clarify when canonical evidence is absent.

Anchor excerpt from `lib/tutor-rag.ts:1-12`: Tier 1 is shared and cacheable, Tier 2 adds deterministic weak-concept context, Tier 3 is personalized and uncached, and citations outside retrieved IDs are dropped. Preserve these privacy and citation properties while changing the canonical source model.

## Git workflow

- Create branch `codex/013-zyra-runtime` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- `lib/tutor-rag.ts`
- `lib/tutor-actions.ts`
- `lib/tutor-capabilities.ts`
- `lib/tutor/**`
- `lib/zyra/**`
- `prompts/tutor.ts`
- `app/actions/tutor.ts`, `app/actions/tutor-extra.ts`
- tutor drawer and chat API components
- `lib/env.ts`
- contract and staging tests
- new `scripts/staging/smoke-zyra.ts`
- new `scripts/staging/scan-zyra-privacy.ts`
- `package.json`
- `docs/features.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `AGENTS.md`

Out of scope: content generation, changing mastery algorithm, admin workflow, production traffic.

## Runtime contract

1. Vectorize returns candidate IDs and versions. Zyra hydrates current rows from Turso and discards missing, stale, superseded, unauthorized, or version-mismatched candidates.
2. Course-knowledge answers use only published Ideas, articles, source material permitted for murid, published questions where policy permits, and published solutions only with a verified capability.
3. Murid profile, enrollment, mastery, attempt state, and conversation history come directly from Turso. Never embed or cache personalized profiles in shared Vectorize data.
4. Shared Tier 1 cache payloads remain student-free. Personalization occurs after cache retrieval.
5. Every substantive claim has a citation to hydrated canonical entity ID and version. Citation verification failures block the answer.
6. During an active attempt, the assistance policy denies correct answers, solution steps, hidden rubrics, option elimination that reveals the answer, and protected benchmark content.
7. If canonical evidence is insufficient, respond with a clarification or explicit coverage limitation. Do not invent a general course answer.
8. Provider or retrieval failure is fail-closed and does not write a fabricated chat source.
9. `FEATURE_ZYRA_IDEA_RUNTIME_V1` controls the new runtime.

## Query routing

Map existing actions into explicit capabilities: retrieve canonical evidence, reuse previously hydrated evidence, answer from allowed conversation context, clarify, read murid learning state, and request permitted practice. Namespace selection is server-owned. The client cannot request restricted sources.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Preserve and extend existing cache, action-routing, citation, pedagogy, visual, and assessment-policy contracts.
2. Add a typed retrieval gateway returning hydrated canonical entities and rejection reasons.
3. Add direct murid-context loader with strict field allowlist and no shared-cache serialization.
4. Version prompts to consume Idea relationships, mastery and confidence separately, and approved product blocks.
5. Enforce active-attempt policy before retrieval, before prompt composition, and before response serialization.
6. Add source trace records referencing canonical IDs and versions.
7. Run offline contract tests, then real staging smoke tests through Cloudflare AI Gateway and Vectorize using dedicated test accounts and bounded quota.
8. Rehearse flag on and off without losing chat history.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/tutor-rag.test.ts tests/contracts/assessment-redaction.test.ts tests/contracts/zyra-canonical-runtime.test.ts tests/contracts/zyra-cache-privacy.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:smoke-zyra -- --run-id <runId> --course tutorial-pka --suite canonical
bun --env-file=.env.staging run staging:smoke-zyra -- --run-id <runId> --course tutorial-pka --suite active-attempt
bun --env-file=.env.staging run staging:scan-zyra-privacy -- --run-id <runId>
git diff --check
```

Pass only when canonical citation validity is 100 percent on golden cases, unsupported claims equal zero, active-attempt leaks equal zero, holdout leaks equal zero, shared-cache personal fields equal zero, restricted namespaces are denied without capability, provider-failure fixtures fail closed, and old chat history remains readable with the flag on and off.

## Test plan

- Cover current and stale hydration, no-evidence clarification, citation mismatch, personal-context separation, shared-cache redaction, active-attempt denial, restricted solutions, provider failure, retry behavior, and old chat replay without regenerating messages.
- Extend the existing tutor RAG and assessment-redaction suites instead of replacing them.

## STOP conditions

- Zyra treats vector metadata or generated text as canonical without DB hydration.
- Murid profile data enters a shared cache or vector.
- Any active-attempt answer-bearing content is returned.
- A citation points to a stale or missing entity version.
- Real staging tests exceed the configured request or quota budget.

## Maintenance notes

Any new retrieval namespace needs a server capability, DB hydration rule, citation serializer, cache classification, and active-assessment policy before it can be queried.

## Rollback

Set `FEATURE_ZYRA_IDEA_RUNTIME_V1=0`. Preserve all chat and source rows. If Vectorize-only remains healthy, it may stay enabled; otherwise also follow Plan 012 rollback. Do not replay user messages.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-013-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- Zyra is grounded in approved database content and direct private learner state.
- Assessment integrity and cache privacy have zero-tolerance gates.
- Existing tutoring history remains operational.
