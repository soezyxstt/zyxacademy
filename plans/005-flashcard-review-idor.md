# Plan 005: Derive `studentId` server-side in the flashcard review action (fix IDOR)

> **Executor instructions**: Follow step by step. Run every verification command. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- "app/(student)/courses/[id]/flashcard/actions.ts" lib/flashcard-actions.ts`
> If either changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

The `"use server"` action `submitReviewAction` takes `studentId` as its first argument from the caller and passes it straight to the DB write with no session check. Any caller who can reach the action can forge or overwrite spaced-repetition progress, review history, and mastery-driving learning events for any student id. The parallel API route already does this correctly (derives the id from the session), so this action is the drifted, unsafe copy.

## Current state

`app/(student)/courses/[id]/flashcard/actions.ts` — the whole file:
```ts
"use server";
import { submitReview as dbSubmitReview } from "@/lib/flashcard-actions";
import { revalidatePath } from "next/cache";

export async function submitReviewAction(
  studentId: string,          // <-- caller-supplied, unverified
  flashcardId: string,
  grade: number,
  manualAnswer?: string,
  isExamMode: boolean = false,
  courseId?: string
) {
  const result = await dbSubmitReview(studentId, flashcardId, grade, manualAnswer, isExamMode);
  if (courseId) revalidatePath(`/courses/${courseId}/flashcard`);
  return result;
}
```

The safe pattern (from `app/api/student/flashcards/route.ts:61`, per the security audit) derives `studentId` from the session. Session helper used across the codebase:
```ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
const session = await auth.api.getSession({ headers: await headers() });
if (!session?.user) throw new Error("Unauthorized");
const studentId = session.user.id;
```

`dbSubmitReview` (`lib/flashcard-actions.ts:146`) writes `studentFlashcardProgress`, `flashcardReviews`, and `learningEvents` for whatever `studentId` it receives.

## Commands you will need

| Purpose   | Command             | Expected  |
|-----------|---------------------|-----------|
| Typecheck | `bun run typecheck` | exit 0    |
| Lint      | `bun run lint`      | exit 0    |

## Scope

**In scope**:
- `app/(student)/courses/[id]/flashcard/actions.ts`
- The call sites of `submitReviewAction` (client components that pass `studentId`) — update them to stop passing it.

**Out of scope**:
- `lib/flashcard-actions.ts` `submitReview` signature — leave `studentId` as its param; the action supplies the trusted value. (Do not change the shared lib function; the API route also calls it.)

## Git workflow

- Branch: `advisor/005-flashcard-review-idor`
- Commit: `fix(security): derive studentId from session in flashcard review action`
- No push/PR unless instructed.

## Steps

### Step 1: Remove the `studentId` parameter and derive it from the session

Rewrite the action to:
```ts
"use server";
import { submitReview as dbSubmitReview } from "@/lib/flashcard-actions";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

export async function submitReviewAction(
  flashcardId: string,
  grade: number,
  manualAnswer?: string,
  isExamMode: boolean = false,
  courseId?: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  const result = await dbSubmitReview(session.user.id, flashcardId, grade, manualAnswer, isExamMode);
  if (courseId) revalidatePath(`/courses/${courseId}/flashcard`);
  return result;
}
```

**Verify**: `bun run typecheck` → the call sites now fail to typecheck (they still pass `studentId`). That is expected; Step 2 fixes them.

### Step 2: Update all callers to drop the `studentId` argument

Find every caller: `grep -rn "submitReviewAction" app components | grep -v node_modules`. In each, remove the leading `studentId` argument. The likely caller is `app/(student)/courses/[id]/flashcard/flashcard-client.tsx`.

**Verify**: `bun run typecheck` → exit 0 (all callers updated); `bun run lint` → exit 0.

## Test plan

- No unit test (server action needs session context). Verification is typecheck + manual: perform a flashcard review while logged in and confirm the review is recorded for the logged-in user.
- Negative check (manual/reasoned): the action can no longer be invoked with an arbitrary student id because the parameter no longer exists.

## Done criteria

ALL must hold:
- [ ] `submitReviewAction` no longer accepts `studentId`; it reads `session.user.id`
- [ ] `grep -rn "submitReviewAction(" app components` shows no caller passing a student id as the first arg
- [ ] `bun run typecheck` exits 0; `bun run lint` exits 0
- [ ] Only the action file and its callers modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- A caller passes a `studentId` that is NOT the current user (e.g. a tutor reviewing on behalf of a student) — STOP and report; the fix would break a legitimate flow and needs a role-gated variant instead.
- `auth.api.getSession` is not the session pattern used in this route group — check a neighboring server action first and match it.

## Maintenance notes

- Reviewer: audit sibling `"use server"` actions in `app/(student)/**/actions.ts` for the same "id passed by client" pattern; the security audit flagged this as drift and it may exist elsewhere.
- If a tutor-on-behalf-of-student review is ever needed, add a separate action gated by `verifyTutorAccess`, not a client-supplied id.
