# Plan 006: Reject late answers server-side in the live-quiz worker

> **Executor instructions**: Follow step by step. Run every verification command. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- workers/realtime/src/room.ts`
> If it changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (integrity)
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

The live-quiz Durable Object accepts an answer as long as the session is in the `question` state and the question index matches; it never checks the question's deadline. The 30s window is used only for the score time-bonus, and `Math.max(0, ...)` floors late answers to the base 1000 points instead of rejecting them. Between the client-side deadline and the host clicking "reveal," a modified client can submit and still earn full points, breaking leaderboard integrity.

## Current state

`workers/realtime/src/room.ts:224-247` — `handleAnswer`:
```ts
private async handleAnswer(userId: string, questionIndex: number, choice: number, _clientTs?: number): Promise<void> {
  if (this.roomState.sessionState !== "question") return;
  if (questionIndex !== this.roomState.currentQuestionIndex) return;

  if (!this.roomState.answersByQuestion[questionIndex]) {
    this.roomState.answersByQuestion[questionIndex] = {};
  }
  // Rate limit: 1 answer per question per user
  if (this.roomState.answersByQuestion[questionIndex][userId]) return;

  this.roomState.answersByQuestion[questionIndex][userId] = { choice, receivedTs: Date.now() };
  await this.persistState();
  this.sendAnswerCountsToHosts(questionIndex);
}
```

The room already tracks a deadline, all verified in the live code:
- `deadlineTs: number` is a non-optional field of the room state (`room.ts:32`), initialized to `0` (`room.ts:55`).
- It is set to `Date.now() + QUESTION_WINDOW_MS` every time a question opens: `startSession` (`room.ts:261`) and `nextQuestion` (`room.ts:289`).
- `QUESTION_WINDOW_MS = 30_000` (`room.ts:47`) — milliseconds, same unit as `Date.now()`.
- The time-bonus math reads it at `room.ts:316,325-326`.

Because `handleAnswer` already requires `sessionState === "question"`, and `deadlineTs` is always assigned on entry to that state, the initial `0` value can never be the live deadline when the guard runs.

## Commands you will need

| Purpose   | Command                                             | Expected           |
|-----------|-----------------------------------------------------|--------------------|
| Typecheck | `cd workers/realtime && bunx tsc --noEmit`          | exit 0 (see note)  |
| App types | `bun run typecheck` (from repo root)                | exit 0             |

Note: the worker has its own build (`workers/realtime/`); if it has a `tsconfig.json`, typecheck there. If not, ensure repo-root `bun run typecheck` still passes.

## Scope

**In scope**:
- `workers/realtime/src/room.ts` (only `handleAnswer`)

**Out of scope**:
- The scoring/time-bonus block — do not change how points are computed; this plan only rejects late submissions before they are recorded.
- The HMAC token path and control commands.

## Git workflow

- Branch: `advisor/006-live-quiz-deadline`
- Commit: `fix(live): reject answers submitted after the question deadline`
- No push/PR unless instructed.

## Steps

### Step 1: Add a deadline guard at the top of `handleAnswer`

Add, immediately after the `currentQuestionIndex` check (`room.ts:231`):
```ts
if (Date.now() > this.roomState.deadlineTs) return;
```
(`deadlineTs` is a non-optional `number` — no `typeof` dance needed.) Place it before the answer is recorded so late answers are dropped, consistent with the existing early-return style.

**Verify**: worker typecheck (or repo-root `bun run typecheck`) → exit 0.

### Step 2: Re-confirm the assignment sites still hold

Drift guard only: confirm `deadlineTs = Date.now() + QUESTION_WINDOW_MS` still appears in both `startSession` (`room.ts:261`) and `nextQuestion` (`room.ts:289`). If either assignment moved or vanished, treat as a STOP condition.

**Verify**: `grep -n "deadlineTs = Date.now()" workers/realtime/src/room.ts` → two matches.

## Test plan

- No worker test harness exists. Verification is by reasoning + typecheck: the guard returns before recording when `Date.now()` exceeds the deadline.
- If a worker test setup is added later (out of scope), add a unit test that calls `handleAnswer` with a mocked clock past `deadlineTs` and asserts no answer is recorded.

## Done criteria

ALL must hold:
- [ ] `handleAnswer` returns early when `Date.now() > deadlineTs`
- [ ] `deadlineTs` is confirmed set on question open (Step 2)
- [ ] Worker typecheck (or repo-root `bun run typecheck`) exits 0
- [ ] Only `workers/realtime/src/room.ts` modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- The `deadlineTs` assignments at `room.ts:261`/`room.ts:289` are gone or moved (Step 2 grep finds fewer than two matches) — STOP; the state machine drifted since this plan was written.
- Adding the guard breaks legitimate answers in normal timing — `QUESTION_WINDOW_MS = 30_000` is milliseconds (verified), but re-check if the constant changed.

## Maintenance notes

- Reviewer: confirm the deadline unit (ms vs s) matches `Date.now()`.
- If a grace period for network latency is desired, add a small constant (e.g. +1500 ms) rather than removing the guard — note the tradeoff in the PR.
