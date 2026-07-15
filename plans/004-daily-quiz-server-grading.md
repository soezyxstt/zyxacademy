# Plan 004: Grade the daily quiz server-side instead of trusting client answer keys

> **Executor instructions**: Follow step by step. Run every verification command. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- app/api/quiz/daily/route.ts lib/quiz-scoring.ts`
> If either file changed since this plan was written, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-verification-baseline.md (provides `lib/quiz-scoring.ts` + `bun test`)
- **Category**: bug (integrity/security)
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

The daily-quiz POST handler grades the student against a `questionsSnapshot` — including `correct_indices` — sent in the request body. A student can POST a snapshot whose correct answers match their own choices and record a 100% score, inflating leaderboards and mastery signals. Separately, `score = Math.round((correct / questionsSnapshot.length) * 100)` produces `NaN` when an empty snapshot is submitted (the schema allows an empty array). The GET side already strips correct answers; the POST side hands trust straight back to the client.

## Current state

`app/api/quiz/daily/route.ts:124-186` — the schema and grading:
```ts
const SubmitSchema = z.object({
  templateId: z.string().min(1),
  answers: z.record(z.string(), z.array(z.number())),
  durationSeconds: z.number().int().min(0).optional(),
  questionsSnapshot: z.array(z.object({
    id: z.string(), prompt: z.string(), options: z.array(z.string()),
    correct_indices: z.array(z.number()),   // <-- trusted from client
    explanation: z.string(),
  })),
});
// ...
let correct = 0;
for (const q of questionsSnapshot) {
  const submitted = answers[q.id] ?? [];
  const isCorrect = submitted.length === q.correct_indices.length &&
    submitted.every((i) => q.correct_indices.includes(i));
  if (isCorrect) correct++;
}
const score = Math.round((correct / questionsSnapshot.length) * 100);   // NaN if length 0
```

The canonical answers live in `aiQuestionBank`. GET already selects from it (`app/api/quiz/daily/route.ts:90-105`). The question id is the trustworthy field the client returns.

The correct-answer column is confirmed: `aiQuestionBank.correctIndices` = `text("correct_indices", { mode: "json" })` at `db/schema.ts:595` — a JSON column; the row value needs a `as number[]` cast (match how GET's sibling code treats JSON columns).

The enrollment filter to reuse is at `app/api/quiz/daily/route.ts:33-50`: admins get all course ids; students get `enrollments` rows where `expiresAt > now`. The POST fix must restrict graded question ids to `aiQuestionBank` rows whose `courseId` is in that same set.

`lib/quiz-scoring.ts` (created by plan 001) exports:
```ts
export function scoreQuiz(questions: {id:string; correctIndices:number[]}[], answers: Record<string, number[]>): { correct:number; total:number; score:number }
```
It returns `score: 0` (never NaN) for empty input, and dedupes submitted indices (so `[1,1]` cannot satisfy a 2-answer key — a deliberate hardening over the current route logic; this plan is where that change goes live).

## Commands you will need

| Purpose   | Command             | Expected        |
|-----------|---------------------|-----------------|
| Typecheck | `bun run typecheck` | exit 0          |
| Lint      | `bun run lint`      | exit 0          |
| Test      | `bun test`          | all pass        |

## Scope

**In scope**:
- `app/api/quiz/daily/route.ts`
- `lib/quiz-scoring.test.ts` (extend if needed)

**Out of scope**:
- `app/api/quiz/attempts/**` — separate flow, handled by plan 007.
- The GET handler's question selection logic — leave as is.
- `questionsSnapshot` persistence: you may keep storing the snapshot for history, but grading must not read `correct_indices` from it.

## Git workflow

- Branch: `advisor/004-daily-quiz-server-grading`
- Commit: `fix(quiz): grade daily quiz against server-side answer bank`
- No push/PR unless instructed.

## Steps

### Step 1: Drop `correct_indices` from the trusted input

Change `SubmitSchema.questionsSnapshot` so grading no longer depends on client correct answers. Keep only what you need to persist for history; the grading input is `answers` (map of questionId → chosen indices) plus the list of question ids. Add a guard: reject when there are zero answered questions with a 400.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Re-fetch canonical answers and grade with `scoreQuiz`

In POST, after auth, collect the submitted question ids (`Object.keys(answers)`), fetch those rows from `aiQuestionBank` by id (`inArray(aiQuestionBank.id, ids)`), map to `{ id, correctIndices: row.correctIndices as number[] }`, then:
```ts
import { scoreQuiz } from "@/lib/quiz-scoring";
const { correct, total, score } = scoreQuiz(canonicalQuestions, answers);
```
Only questions that exist in the bank and belong to the student's enrolled courses should count — reuse the enrollment/course filter already present in GET so a student cannot submit ids from courses they are not in.

**Verify**: `bun run typecheck` → exit 0; `bun test` → all pass.

### Step 3: Persist the real score

Insert into `studentQuizAttempts` using the server-computed `score`, `correct`, `total`. You may still store the client `questionsSnapshot` in `questionsSnapshot` for display, but it is no longer authoritative. Keep the `useCount` increment on the graded question ids.

**Verify**: `bun run typecheck` → exit 0; `bun run lint` → exit 0.

## Test plan

- Extend `lib/quiz-scoring.test.ts` (plan 001) if any new branch is added; the empty-input → score 0 case must be present.
- Manual: submit a daily quiz with deliberately wrong client `correct_indices` and confirm the stored score reflects the real bank answers, not the forged ones. Submit an empty answers map and confirm a 400 (not a NaN score).

## Done criteria

ALL must hold:
- [ ] POST no longer reads `correct_indices` from the request body (`grep -n "correct_indices" app/api/quiz/daily/route.ts` → no grading use; only, at most, display persistence)
- [ ] Grading uses `scoreQuiz` from `lib/quiz-scoring.ts` against `aiQuestionBank`
- [ ] Empty answers submission returns 400 (no NaN)
- [ ] `bun test` exits 0; `bun run typecheck` exits 0; `bun run lint` exits 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- Plan 001 has not landed (`lib/quiz-scoring.ts` missing) — STOP; this plan depends on it.
- `db/schema.ts:595` no longer shows `correctIndices` as the correct-answer column on `aiQuestionBank` — the schema drifted; report the actual column before mapping.
- Some daily questions legitimately have no entry in `aiQuestionBank` (e.g. ephemeral generated questions) — STOP and report; the grading source assumption is wrong.

## Maintenance notes

- Reviewer: confirm no code path still trusts client-provided correctness anywhere in the daily flow.
- If daily quizzes ever include AI-generated ephemeral questions not stored in the bank, this grading source must be revisited.
- Keep `scoreQuiz` the single grading function shared with plan 007's attempts flow.
