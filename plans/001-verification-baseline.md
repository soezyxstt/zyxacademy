# Plan 001: Establish a one-command test baseline (`bun test`) covering SM-2, quiz scoring, and the KV write-cap

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in "STOP conditions" occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- lib/flashcard-scheduler.ts lib/kv-cache.ts scripts/run-evals.ts package.json`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

There is no automated verification in this repo: `package.json` has no `test` script, no test runner is installed, and there is no CI. Every change to quiz scoring, SM-2 flashcard scheduling, mastery, or the money/quota guards is verified by hand or not at all. This plan is the prerequisite for every risky fix in later plans (004, 007, 008, 009, 012 all touch logic that this suite will protect). It stands up `bun test` (Bun's built-in runner, zero new dependency) with characterization unit tests on the highest-value pure functions, and wires the existing `scripts/run-evals.ts` gate harness into a discoverable command.

## Current state

- `package.json:5-18` — scripts are `dev`/`build`/`lint`/`typecheck`/`db:*` only. No `test` script. No test framework in `devDependencies` (verified: no vitest/jest/playwright).
- `scripts/run-evals.ts` — a real pass/fail gate harness that already exists but is unwired. Its header:
  ```
  * P10 eval harness. One command, seeded DB, green/red summary.
  * Gates covered: 2.3 Streak math, 5.2/5.3 Study path, B.1 Usage budget
  * Usage: bunx tsx scripts/run-evals.ts
  ```
  It requires a seeded DB (imports `@/db`) — it is an integration harness, not a unit suite.
- `lib/flashcard-scheduler.ts:25-36` — pure SM-2 functions, ideal unit targets, zero coverage:
  ```ts
  export function difficultyFirstInterval(recallDifficulty: number): number {
    const d = Math.max(1, Math.min(5, Math.round(recallDifficulty)));
    return Math.max(1, Math.min(3, 4 - d));
  }
  export function calculateSM2(previous: SM2ProgressInput, grade: number): SM2ProgressOutput { ... }
  ```
  Exports also include `calculateNextReview`. Grades: `1=Again, 2=Hard, 3=Good, 4=Easy`.
- `lib/kv-cache.ts:14` — `WRITE_DAILY_LIMIT = 900` — the money guard AGENTS.md mandates; `claimWriteSlots(slots)` returns `false` when `count + slots > WRITE_DAILY_LIMIT` (`lib/kv-cache.ts:73`). Untested. NOTE: `lib/kv-cache.ts:11` imports `@/lib/env`; `lib/env.ts` (t3-oss `createEnv`, no `skipValidation` escape hatch) validates at import time and THROWS when required env vars are absent — so a test file must NOT import `lib/kv-cache.ts` directly (see Step 3's pure-module extraction).
- Quiz scoring: the daily route computes `Math.round((correct / questionsSnapshot.length) * 100)` at `app/api/quiz/daily/route.ts:164` (NaN when the snapshot is empty). The attempts submit handler uses the same comparison at `app/api/quiz/attempts/[id]/route.ts:117-126` but already guards empty input (`snapshot.length > 0 ? Math.round(...) : 0`). `scoreQuiz` must match the guarded semantics: score 0, never NaN.

Repo conventions: TypeScript strict, Bun runtime, path alias `@/` → repo root (see `tsconfig.json`). No em/en dashes anywhere (AGENTS.md hard rule) — use `;`, `,`, or `.` in comments and strings.

## Commands you will need

| Purpose   | Command              | Expected on success        |
|-----------|----------------------|----------------------------|
| Install   | `bun install`        | exit 0                     |
| Typecheck | `bun run typecheck`  | exit 0, no errors          |
| Lint      | `bun run lint`       | exit 0                     |
| Unit test | `bun test`           | all pass                   |

`bun test` needs no dependency; it is built into Bun. Test files are auto-discovered by the `*.test.ts` suffix.

## Scope

**In scope**:
- `lib/flashcard-scheduler.test.ts` (create)
- `lib/quiz-scoring.ts` (create — extract the score function; see Step 2)
- `lib/quiz-scoring.test.ts` (create)
- `lib/kv-write-cap.ts` (create — pure cap-boundary module; see Step 3)
- `lib/kv-write-cap.test.ts` (create)
- `lib/kv-cache.ts` (ONLY: move the `WRITE_DAILY_LIMIT` constant to the new module and call the helper; no behavior change)
- `package.json` (add `test` and `test:evals` scripts only)

**Out of scope** (do NOT touch):
- `scripts/run-evals.ts` internals — only reference it from a script; do not rewrite it.
- The route handlers themselves beyond the minimal pure-function extraction in Step 2. Behavior must be identical; plans 004 and 007 change scoring/attempts logic later and depend on this suite being green first.
- Any DB-connected test — keep this suite pure/in-memory. Integration gates stay in `run-evals.ts`.

## Git workflow

- Branch: `advisor/001-verification-baseline`
- Conventional commits (repo style, e.g. `feat: add bun test baseline for scheduler and scoring`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the `test` scripts to package.json

In `package.json` `scripts`, add:
```json
"test": "bun test",
"test:evals": "bunx tsx scripts/run-evals.ts"
```

**Verify**: `bun test` → runs, reports "0 tests" or discovers nothing yet, exit 0.

### Step 2: Extract quiz scoring into a pure, testable function

Create `lib/quiz-scoring.ts` with a single pure function that both quiz routes can reuse:
```ts
export interface ScorableQuestion { id: string; correctIndices: number[]; }
/** Returns { correct, total, score } where score is 0-100, and 0 when total is 0 (never NaN). */
export function scoreQuiz(
  questions: ScorableQuestion[],
  answers: Record<string, number[]>
): { correct: number; total: number; score: number } {
  let correct = 0;
  for (const q of questions) {
    const submitted = [...new Set(answers[q.id] ?? [])];
    if (submitted.length === q.correctIndices.length &&
        submitted.every((i) => q.correctIndices.includes(i))) correct++;
  }
  const total = questions.length;
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { correct, total, score };
}
```
The `new Set` dedupe is a deliberate hardening over the routes' current logic: today `submitted.length === correctIndices.length && submitted.every(...)` lets `[1,1]` pass against a 2-answer key `[1,2]` (duplicate indices satisfy both checks). `scoreQuiz` closes that. Since nothing calls `scoreQuiz` until plan 004 wires it, no live behavior changes in this plan.

Do NOT yet wire this into the routes — plan 004 does that. This step only creates the unit under test.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Write the unit tests

Create `lib/flashcard-scheduler.test.ts` using Bun's test API (`import { test, expect } from "bun:test"`). Cover:
- `difficultyFirstInterval`: input 1 → 3, input 5 → 1, input 3 → 1, out-of-range (0, 6) clamps.
- `calculateSM2`: grade 1 (Again) resets `repetitions` to 0, `intervalDays` to 1, increments `lapses`, floors `easeFactor` at 1.3; grade 3/4 increments `repetitions`.
- Table of (previous state, grade) → expected `intervalDays`/`easeFactor` (read the full function body first to derive exact expected values — do not guess; assert what the code currently produces, this is a characterization test).

Create `lib/quiz-scoring.test.ts`: all-correct → score 100; none-correct → 0; empty questions array → `{ correct: 0, total: 0, score: 0 }` (the NaN regression guard); partial-credit rounding (e.g. 1/3 → 33); duplicate submitted indices `[1,1]` vs key `[1,2]` → not correct (the dedupe guard).

Create `lib/kv-write-cap.ts` — do NOT import `lib/kv-cache.ts` from any test (it imports `@/lib/env`, which throws at import when required env vars are absent). Instead:
```ts
export const WRITE_DAILY_LIMIT = 900;
export function wouldExceedWriteCap(count: number, slots: number): boolean {
  return count + slots > WRITE_DAILY_LIMIT;
}
```
Then in `lib/kv-cache.ts`: delete the local `WRITE_DAILY_LIMIT` (line 14), import both symbols from `@/lib/kv-write-cap`, and replace the line-73 check with `if (wouldExceedWriteCap(count, slots)) return false;`. No other change to `kv-cache.ts`.

Create `lib/kv-write-cap.test.ts` asserting: `(898, 2)` → allowed; `(899, 2)` → denied; `(900, 1)` → denied; `(0, 2)` → allowed.

**Verify**: `bun test` → all tests pass; at least 10 test cases across the 3 files.

### Step 4: Confirm run-evals is reachable

Do NOT run `bun run test:evals` (it needs a seeded DB and env). Just confirm the script exists and the package.json entry resolves: `bun run test:evals --help` may error on env — that is acceptable; the goal is only that the script is wired and documented.

**Verify**: `cat package.json | grep test:evals` → shows the entry.

## Test plan

- New tests: `lib/flashcard-scheduler.test.ts`, `lib/quiz-scoring.test.ts`, `lib/kv-write-cap.test.ts` (structure: `import { test, expect } from "bun:test"`).
- No existing test file to model after (this is the first). Use Bun's documented `test`/`expect` API.
- Verification: `bun test` → all pass, ≥10 cases.

## Done criteria

ALL must hold:
- [ ] `bun test` exits 0 with ≥10 passing tests across the 3 new `*.test.ts` files
- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `package.json` has `test` and `test:evals` scripts
- [ ] `lib/quiz-scoring.ts` exports `scoreQuiz` returning `score: 0` (not NaN) for empty input and deduping submitted indices
- [ ] `lib/kv-cache.ts` behavior unchanged apart from importing the cap check from `lib/kv-write-cap.ts`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:
- `bun test` is not available (Bun version too old) — report the version; do not add jest/vitest without confirmation.
- `calculateSM2`'s actual output cannot be determined by reading the function (it depends on unread helpers) — report before asserting guessed values.
- Extracting `scoreQuiz` reveals the two routes already score differently in a way that can't be unified — report; do not force a shared function that changes behavior.

## Maintenance notes

- Plans 004 and 007 will import `scoreQuiz` and change attempt logic; they must keep `bun test` green.
- The KV boundary test hard-codes 900; if `WRITE_DAILY_LIMIT` changes, update the test.
- Deferred: DB-connected integration tests (scoring end-to-end, mastery recompute) stay in `run-evals.ts`; growing those gates is follow-up, not this plan.
