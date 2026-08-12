# Plan 007: Build the pedagogical Zyra harness

> **Executor instructions**: Execute only after Idea-centered Overhaul Plan 013 has established canonical retrieval, DB hydration, citations, and assessment policy. Preserve those controls. This plan changes how Zyra teaches, not what content is canonical.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- lib/tutor-rag.ts lib/tutor lib/zyra lib/prompt-executor.ts prompts app/actions/tutor.ts tests scripts docs lib/env.ts`.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 005, 006, and Idea-centered Overhaul Plan 013
- **Category**: product, correctness
- **Planned at**: commit `03b68ba0`, 2026-08-02
- **Status**: IN PROGRESS

## Why this matters

Zyra currently relies on long prompt instructions to sound friendly, cite sources, enforce assessment rules, choose visuals, and teach Socratically. That creates fragile behavior that still feels like a general Gemini chat. The target is an application-owned tutoring harness: deterministic policy and teaching-stage selection, a typed model task, strict validation, and a learner checkpoint after each explanation.

## Current state

- `lib/tutor-rag.ts:184` and `lib/tutor-rag.ts:214` contain large system strings combining persona, RAG, assessment safety, math formatting, and visual syntax.
- `lib/tutor/pedagogy-contracts.ts` already defines analogy, misconception, concept explanation, and mistake-analysis schemas.
- `lib/tutor/visual-contracts.ts` already validates a basic visual intent.
- `lib/prompt-executor.ts` provides typed prompt execution, validation, trace metadata, and bounded repair.
- Overhaul Plan 013 owns canonical evidence and active-attempt fail-closed behavior. Do not bypass it.

## Pedagogical state machine

The server chooses one state before calling the model:

1. `orient`: establish the learner's goal and prior understanding.
2. `diagnose`: ask one discriminating question when the misconception is uncertain.
3. `explain`: explain one concept using a selected representation.
4. `hint_1_concept`: identify the governing principle.
5. `hint_2_representation`: provide a diagram, equation, table, or analogy.
6. `hint_3_analogous_example`: work a different but structurally similar example.
7. `hint_4_partial_step`: reveal only the next allowed step.
8. `teach_back`: ask the learner to explain or predict.
9. `check`: evaluate the learner's response without exposing protected answers.
10. `clarify`: request missing information or state evidence limits.

The model may fill the selected state but may not silently select a later hint. Active assessments cap the state at the policy-approved level.

## Typed response contract

Add a versioned `ZyraTeachingResponse` containing:

- learning goal;
- observed facts and diagnosis hypothesis kept separate;
- image observations, uncertainty, and unreadable regions kept separate from inferred meaning when an approved attachment is present;
- selected teaching move and hint level;
- ordered explanation blocks;
- canonical claim citations;
- optional Learning Canvas spec;
- one check-for-understanding;
- expected response shape, not the hidden answer;
- next allowed action;
- assessment-safety decision and reason code;
- learner-facing text with no pipeline terminology.

An ordinary turn performs at most one generative call. Shape or semantic failure uses deterministic safe composition or returns a typed clarification. Do not perform an invisible second model repair on the standard path.

## Scope

**In scope**:

- New `lib/zyra/pedagogy/**` modules for context, deterministic planner, prompt input, response schema, semantic validation, hint state, and composition.
- Refactor `lib/tutor-rag.ts` to delegate teaching behavior while preserving Overhaul Plan 013 retrieval and policy.
- Versioned prompt files under `prompts/zyra/**`.
- Extend `lib/tutor/pedagogy-contracts.ts` without deleting compatible exports.
- Golden fixtures, scoring scripts, staging smoke, trace metadata, and feature flag `FEATURE_ZYRA_PEDAGOGY_V3`.
- Required feature, architecture, development, and readiness docs.

**Out of scope**:

- Canonical retrieval, mastery calculation, assessment grading, visual renderer implementation, UI mascot, admin mutations, and production.

## Git workflow

- Branch: `codex/zyra-ai-007-pedagogy-harness` from Overhaul Plan 013 plus accepted AI predecessors.
- Commit example: `feat(zyra): add pedagogical tutoring state machine`.

## Steps

### Step 1: Extract policy from persona

Separate application-owned rules from learner-facing style. Assessment assistance, citation validity, evidence coverage, math delimiters, privacy, and state transitions become typed code contracts. Persona text only controls tone and concise Indonesian wording.

**Verify**: policy tests pass even when the fake model explicitly asks to ignore them.

### Step 2: Implement deterministic state selection

Select teaching state from server-owned request type, active assessment, previous hint state, learner response form, evidence sufficiency, and explicit action. Use no model call for routing. A learner may ask for another explanation, but cannot jump directly to protected solution output.

**Verify**: table-driven tests cover all states, transitions, invalid jumps, repeated hints, and active-assessment caps.

### Step 3: Define the response schema and semantic validators

Require one learning goal, one teaching move, bounded explanation blocks, canonical citations for substantive course claims, at most one primary check question, and an optional visual spec. Separate observed evidence from diagnosis hypothesis. Reject direct answer values or protected solution steps during active attempts.

**Verify**: fixtures cover valid response, unsupported claim, stale citation, answer leak, missing checkpoint, multiple competing goals, and pipeline-language leak.

### Step 4: Compose one-call prompts

Build the prompt from versioned policy fragments, canonical evidence, chosen state, safe learner context, approved sanitized attachments when present, and explicit output schema. The model fills the chosen teaching move. Keep prompts bounded and exclude unrelated chat history.

Use 3.1 Flash-Lite normally, 3.5 Flash only for difficult diagnosis, and 3.6 Flash only when a complex visual or multimodal task is justified. Model selection remains Plan 005 policy. Plan 010 owns upload validation, private storage, authorization, and request assembly; this plan only defines the teaching contract consumed by that integration.

**Verify**: prompt snapshots contain no hidden answers, unrelated learner profile fields, or duplicate policy paragraphs.

### Step 5: Add deterministic failure composition

If parsing or semantic validation fails, return a short clarification or safe concept-level scaffold from approved evidence. Do not label a malformed response as success and do not spend a second ordinary provider call.

**Verify**: all provider, parse, citation, and safety failures map to stable learner-safe states and correct lease outcomes.

### Step 6: Add pedagogical traces

Record state, teaching move, hint level, evidence version, model, policy version, validation results, and learner outcome pointer. Store no hidden answer or raw full prompt. Connect to existing `ai_generation_traces` without rewriting old rows.

**Verify**: trace privacy tests and backward-compatible reads pass.

### Step 7: Build golden tutoring evaluations

Create at least 40 versioned dialogues across Tutorial PKA, mathematics, physics, and chemistry. Include prior-knowledge probes, misconceptions, analogous examples, teach-back, insufficient evidence, and active assessments.

Machine gates:

- active-assessment direct-answer leaks: 0;
- invalid citations: 0;
- unsupported course claims: 0;
- selected state and hint-level compliance: at least 95 percent;
- check-for-understanding present when required: at least 95 percent;
- pipeline terminology in learner text: 0.

Human review uses a fixed rubric for clarity, scaffolding, helpfulness, cognitive load, and whether Zyra helped understanding instead of merely revealing an answer. Do not let the implementation model grade its own free-form output as release evidence.

### Step 8: Run staging shadow mode

For dedicated staging users, run the new harness in shadow beside the existing response. Show only the old response, persist privacy-safe comparison metadata, then review the golden subset before enabling the flag.

**Verify**: bounded shadow calls stay within the declared quota and do not create duplicate learner-visible messages.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/zyra-pedagogy-state.test.ts tests/contracts/zyra-teaching-response.test.ts tests/contracts/zyra-assessment-safety.test.ts tests/contracts/tutor-rag.test.ts
bun scripts/eval-zyra-pedagogy.ts
bun run typecheck
bun --env-file=.env.staging scripts/staging/smoke-zyra-pedagogy.ts --run-id <runId> --course tutorial-pka --max-provider-requests 40
bun --env-file=.env.staging scripts/staging/smoke-zyra-pedagogy.ts --run-id <runId> --course tutorial-pka --max-provider-requests 40 --startup-diagnostics-only
bun --env-file=.env.staging scripts/staging/smoke-zyra-pedagogy.ts --run-id <runId> --course tutorial-pka --max-provider-requests 40 --remote-shadow
bun scripts/staging/validate-zyra-pedagogy-review.ts --run-id <runId> --submission-file <downloaded-review.json>
git diff --check
```

## Done criteria

- [ ] Teaching state is application-owned and deterministic.
- [ ] Ordinary turns use at most one generative call.
- [ ] Active-assessment leaks, invalid citations, unsupported claims, and pipeline terminology are zero.
- [ ] State compliance and required checkpoints reach at least 95 percent.
- [ ] Human rubric evidence exists for the approved golden subset.
- [ ] Existing canonical retrieval and chat history remain operational.
- [ ] Targeted tests, eval, lint, typecheck, staging smoke, and diff check pass.

## Current execution result

Local implementation and machine gates are green. The focused suite passes 50 tests with 174 assertions, and the 40-case evaluation passes with zero active-assessment leaks, unsupported claims, invalid citations, and pipeline-language leaks. The staging fixture smoke validates 40 of 40 cases without provider calls. A bounded remote runner enforces an exact staging murid identity, current legacy and canonical enrollment, one-attempt legacy and candidate generation, legacy-only visibility, suppressed learner side effects, masked comparison traces, and a maximum of five cases under a provider cap of 40. It also generates a self-contained maintainer review page and a strict validator that rejects case-set drift, insufficient scores, missing low-score notes, raw answer retention, and non-human reviewer metadata. Canonical and tutor runtime flags now use a scoped Zyra env contract, so importing those runtimes does not validate unrelated UploadThing or Resend credentials. The latest zero-provider startup diagnostic reaches the database but stops at `session_context` with `PEDAGOGY_STARTUP_ACTIVE_SESSION_MISSING`; it makes zero provider calls, database writes, trace writes, and learner side effects. One controlled remote shadow retry and maintainer human review remain pending. Evidence: `artifacts/zyra-ai/20260807-plan007-pedagogy-eval/plan-007-pedagogy-eval.json`, `artifacts/staging-overhaul/20260808-plan007-local-shadow-v2/plan-007-pedagogy-shadow.json`, `artifacts/staging-overhaul/20260808-plan007-startup-diagnostics-v3/plan-007-pedagogy-startup-diagnostics.json`, and the latest masked diagnostic artifact from 2026-08-12.

## STOP conditions

- Overhaul Plan 013 citation or assessment contract is missing or failing.
- The design requires a second hidden model call on every ordinary turn.
- One golden active-assessment case reveals a direct answer.
- A diagnosis is stored as fact without supporting learner evidence.
- An executor tries to replace canonical retrieval or mastery logic.
- Real shadow mode would exceed its provider budget.

## Rollback and maintenance

Set `FEATURE_ZYRA_PEDAGOGY_V3=0` and return to the accepted Overhaul Plan 013 response path. Preserve traces and messages. New teaching moves require a state transition, schema update, validator, golden fixture, prompt version, and cache-version change.
