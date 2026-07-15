# Plan 007: Enforce quiz `maxAttempts` atomically at submit time

> **Executor instructions**: Follow step by step. Run every verification command. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- app/api/quiz/attempts/route.ts "app/api/quiz/attempts/[id]/route.ts"`
> If either changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-verification-baseline.md (for `bun test`)
- **Category**: bug (integrity)
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

`maxAttempts` is checked only when an attempt starts, and only against attempts with `status = 'completed'`. A student can start N attempts back-to-back (each start sees `completed = 0`, so each passes) and then submit all N; the submit handler never re-checks the cap. With `maxAttempts = 1`, unlimited attempts get recorded. The cap provides no real limit.

## Current state

Start handler `app/api/quiz/attempts/route.ts:65-80`:
```ts
// Enforce max attempts
if (template.maxAttempts !== null) {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(studentQuizAttempts)
    .where(and(
      eq(studentQuizAttempts.studentId, studentId),
      eq(studentQuizAttempts.templateId, templateId),
      eq(studentQuizAttempts.status, 'completed'),   // only completed counted
    ));
  if (total >= template.maxAttempts) {
    return NextResponse.json({ error: 'Max attempts reached' }, { status: 409 });
  }
}
```

Submit handler `app/api/quiz/attempts/[id]/route.ts:82-102` — only checks the attempt is `in_progress`, never re-checks `maxAttempts`:
```ts
const [attempt] = await db.select().from(studentQuizAttempts).where(and(
  eq(studentQuizAttempts.id, id),
  eq(studentQuizAttempts.studentId, session.user.id),
  eq(studentQuizAttempts.status, 'in_progress'),
)).limit(1);
if (!attempt) return NextResponse.json({ error: 'Attempt not found or already submitted' }, { status: 404 });
```

Drizzle transactions are already used in this repo (verified): `db.transaction(async (tx) => { ... })` at `app/(student)/dashboard/actions.ts:135`, `app/(admin)/admin/(academic)/tokens/actions.ts:97`, and others — match that style. The template table is `quizTemplates` with `maxAttempts: integer("max_attempts")` (nullable) at `db/schema.ts:662`.

## Commands you will need

| Purpose   | Command             | Expected  |
|-----------|---------------------|-----------|
| Typecheck | `bun run typecheck` | exit 0    |
| Lint      | `bun run lint`      | exit 0    |
| Test      | `bun test`          | all pass  |

## Scope

**In scope**:
- `app/api/quiz/attempts/route.ts` (start — also cap concurrent in-progress)
- `app/api/quiz/attempts/[id]/route.ts` (submit — re-check cap atomically)

**Out of scope**:
- Scoring logic in the submit handler (use `scoreQuiz` if refactoring scoring, but scoring correctness is plan 004/001 territory; do not change grading semantics here).
- The daily-quiz route (separate flow, plan 004).

## Git workflow

- Branch: `advisor/007-quiz-max-attempts`
- Commit: `fix(quiz): enforce maxAttempts atomically at submit and cap concurrent attempts`
- No push/PR unless instructed.

## Steps

### Step 1: Re-check the cap inside the submit transaction

In `app/api/quiz/attempts/[id]/route.ts`, wrap the "load in-progress attempt → grade → mark completed" sequence in `db.transaction`. Inside the transaction, before flipping status to `completed`, count prior `completed` attempts for `(studentId, templateId)` and reject with 409 if `count >= template.maxAttempts`. The attempt being submitted is still `in_progress`, so it is not double-counted. Fetch the template's `maxAttempts` (join or a second select on `quizTemplates` by the attempt's `templateId`).

Target shape:
```ts
await db.transaction(async (tx) => {
  const [attempt] = await tx.select()... status 'in_progress' ...;
  if (!attempt) throw ...404;
  const [{ total }] = await tx.select({ total: sql<number>`count(*)` }).from(studentQuizAttempts)
    .where(and(eq(...studentId), eq(...templateId), eq(...status,'completed')));
  if (template.maxAttempts !== null && total >= template.maxAttempts) throw ...409;
  // grade + update status='completed'
});
```
Use a thrown sentinel/typed error to map to the right HTTP status outside the transaction.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Cap concurrent in-progress attempts at start

In `app/api/quiz/attempts/route.ts`, extend the existing cap check to also count `in_progress` attempts, so a student cannot open more than `maxAttempts - completed` simultaneous attempts. Change the count to include both statuses, or add a second guard: reject start if `completed + in_progress >= maxAttempts`.

**Verify**: `bun run typecheck` → exit 0; `bun run lint` → exit 0.

### Step 3: Add a scoring regression guard (if scoring touched)

If Step 1's refactor moves the score computation, route it through `scoreQuiz` (plan 001) and confirm `bun test` still passes. If scoring is untouched, skip.

**Verify**: `bun test` → all pass.

## Test plan

- If the attempt-count logic is extractable to a pure helper (e.g. `canStartAttempt(completed, inProgress, maxAttempts)`), add `bun test` cases: at cap → false; below cap → true; null maxAttempts → always true. Prefer extracting the helper to make it testable.
- Manual: with `maxAttempts = 1`, start two attempts and submit both; the second submit must return 409 and not be recorded as completed.

## Done criteria

ALL must hold:
- [ ] Submit handler re-checks `maxAttempts` inside a transaction and returns 409 when exceeded
- [ ] Start handler counts `in_progress` toward the cap
- [ ] `bun test` exits 0; `bun run typecheck` exits 0; `bun run lint` exits 0
- [ ] Manual two-attempt test: second submit rejected (recorded in PR)
- [ ] Only the two attempt route files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- `db.transaction` fails at runtime against the libsql driver in this route (it works elsewhere in the repo, e.g. `app/(student)/dashboard/actions.ts:135`, so this would be surprising) — report; a conditional-update fallback (`UPDATE ... WHERE status='in_progress' AND (subquery count < max)`) may be needed instead.
- `quizTemplates.maxAttempts` semantics differ from "total completed allowed" (e.g. per-day) — STOP and confirm intent.

## Maintenance notes

- Reviewer: verify the attempt being submitted is not counted against itself (it must still be `in_progress` when counted).
- If retakes/resets are ever added, the completed-count cap must account for reset attempts.
