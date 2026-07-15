# Plan 008: Replace bidirectional substring matching in exam answer grading

> **Executor instructions**: Follow step by step. Run every verification command. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- lib/flashcard-actions.ts`
> If it changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (stricter matching may reject previously-accepted answers — needs product sign-off on tolerance)
- **Depends on**: plans/001-verification-baseline.md (for `bun test`)
- **Category**: bug
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

`evaluateExamAnswer` returns true if either the user answer contains the key or the key contains the user answer. Any short user input that is a substring of the key passes: correct answer `"banana"` is marked correct for a typed `"a"`; `"12"` is marked correct for `"2"`. Exam-mode grading (`examInputPassed`) is trivially satisfiable, corrupting mastery/correctness signals derived from it.

## Current state

`lib/flashcard-actions.ts:36-54`:
```ts
function normalizeAnswer(...) {
  return ...
    .trim()
    .replace(/[^\w\s]/g, " ")   // punctuation -> space
    .replace(/\s+/g, " ")
    .trim();
}

export function evaluateExamAnswer(userAnswer: string, correctAnswer: string): boolean {
  const normUser = normalizeAnswer(userAnswer);
  const normCorrect = normalizeAnswer(correctAnswer);
  if (!normUser || !normCorrect) return false;
  return normCorrect.includes(normUser) || normUser.includes(normCorrect);   // the bug
}
```

`normalizeAnswer` already lowercases/strips punctuation/collapses whitespace (confirm by reading lines 36-44). `evaluateExamAnswer` is exported and pure — an ideal unit-test target.

## Commands you will need

| Purpose   | Command             | Expected  |
|-----------|---------------------|-----------|
| Typecheck | `bun run typecheck` | exit 0    |
| Test      | `bun test`          | all pass  |
| Lint      | `bun run lint`      | exit 0    |

## Scope

**In scope**:
- `lib/flashcard-actions.ts` (only `evaluateExamAnswer`, and a helper if you add one)
- `lib/flashcard-actions.test.ts` (create — but see STOP note about importing this file)

**Out of scope**:
- `normalizeAnswer` behavior — keep it; only change the comparison.
- The SM-2/review-write logic in the same file.

## Git workflow

- Branch: `advisor/008-exam-answer-grading`
- Commit: `fix(flashcard): use normalized equality with bounded typo tolerance for exam answers`
- No push/PR unless instructed.

## Steps

### Step 1: Replace the comparison with normalized equality + bounded tolerance

Change the return to normalized exact match, with a small typo tolerance that does NOT admit arbitrary substrings. Recommended: exact normalized equality OR a Levenshtein distance ≤ 1 for answers of length ≥ 4 (so `"banan"` still passes `"banana"` but `"a"` never passes). Implement a tiny local `levenshtein(a, b)` (no new dependency) or use exact equality only if product prefers strictness.
```ts
export function evaluateExamAnswer(userAnswer: string, correctAnswer: string): boolean {
  const u = normalizeAnswer(userAnswer);
  const c = normalizeAnswer(correctAnswer);
  if (!u || !c) return false;
  if (u === c) return true;
  if (c.length >= 4 && levenshtein(u, c) <= 1) return true;
  return false;
}
```
Drop the `includes` directions entirely.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Unit-test the grader

Create `lib/flashcard-actions.test.ts` (Bun `import { test, expect } from "bun:test"`). Cases:
- exact match (case/whitespace-insensitive) → true
- `"2"` vs `"12"` → false (the regression)
- `"a"` vs `"banana"` → false (the regression)
- one-char typo on a ≥4-char answer → true (`"banan"` vs `"banana"`)
- empty user answer → false

Import-chain note (verified): `lib/flashcard-actions.ts` imports `@/db`, which resolves to `lib/db/index.ts` — that module reads raw `process.env` with a `file:dev.db` fallback and does NOT import the throwing `@/lib/env` validator, and `createClient` does not connect eagerly. So importing `flashcard-actions.ts` from a bun test should work. If it nevertheless fails at import in your environment, extract `evaluateExamAnswer` + `normalizeAnswer` + `levenshtein` into a new pure module `lib/exam-answer.ts` and re-export from `flashcard-actions.ts`; test the pure module.

**Verify**: `bun test` → all pass including the new cases.

## Test plan

- Covered in Step 2. Structure after the plan-001 test files.
- The tolerance threshold (`>= 4`, distance `<= 1`) is a product-visible choice; note it in the PR so the owner can tighten/loosen.

## Done criteria

ALL must hold:
- [ ] `evaluateExamAnswer` no longer uses `.includes(` (`grep -n "includes(" lib/flashcard-actions.ts` shows none in this function)
- [ ] New tests exist and pass, including the `"2"`/`"12"` and `"a"`/`"banana"` regressions
- [ ] `bun test` / `bun run typecheck` / `bun run lint` all exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- Product requires accepting partial answers (e.g. multi-word answers where any word counts) — STOP and confirm; the tolerance model would differ.
- Extracting the function to make it testable would ripple into many imports — keep it in place and test via a pure re-export instead.

## Maintenance notes

- Reviewer: confirm the tolerance does not admit trivially-short answers (guarded by `c.length >= 4`).
- Existing exam attempts graded under the old lenient rule are not retroactively changed; note this as accepted.
