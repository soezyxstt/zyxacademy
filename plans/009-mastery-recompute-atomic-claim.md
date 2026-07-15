# Plan 009: Make mastery-recompute queue claims atomic and upserts conflict-safe

> **Executor instructions**: Follow step by step. Run every verification command. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- lib/mastery-recompute.ts lib/mastery-engine.ts db/schema.ts`
> If any changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the mastery write path)
- **Depends on**: none
- **Category**: bug (concurrency)
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

`processQueueBatch` selects pending rows and then, in a separate statement, marks them `processing` — with no locking. This runs on a hot path (every quiz submit and flashcard review fires `mastery/recompute.requested`, plus a 5-minute cron). Two overlapping runs select the same pending rows and call `recomputeAll` for the same student concurrently; the engine does check-then-insert against `studentConceptMastery`, which has a unique constraint, so the second insert throws. The job's `retries` climbs and after 3 failures it is marked `failed` — the student's mastery silently stops updating.

## Current state

`lib/mastery-recompute.ts:47-62` — the non-atomic claim:
```ts
export async function processQueueBatch(limit: number = 10): Promise<void> {
  const batch = await db.select().from(masteryRecomputeQueue)
    .where(eq(masteryRecomputeQueue.status, "pending")).limit(limit);
  if (batch.length === 0) return;
  const batchIds = batch.map((r) => r.id);
  // Mark all batch records as processing  (separate statement -> race window)
  await db.update(masteryRecomputeQueue)
    .set({ status: "processing", updatedAt: new Date() })
    .where(inArray(masteryRecomputeQueue.id, batchIds));
  for (const job of batch) {
    try {
      await MasteryEngine.recomputeAll(job.studentId, job.courseId);
      ...
```

`recomputeAll` does check-then-write against TWO uniquely-constrained tables (both verified):
- `lib/mastery-engine.ts:70-104` — read-then-insert into `studentConceptMastery`; unique constraint `uq_scm_student_course_concept` on `(studentId, courseId, conceptName)` at `db/schema.ts:1846`.
- `lib/mastery-engine.ts:191-196` onward — the same `findFirst`-then-write pattern into `studentChapterMastery`; unique constraint `uq_scm_student_chapter` on `(studentId, chapterId)` at `db/schema.ts:2392`.

Drizzle API availability (verified): `onConflictDoUpdate` is already used in this repo at `lib/analytics-sync.ts:102` — match that style. `.returning(` has ZERO usages in the repo today, but drizzle-orm `^0.45.2` on the libsql driver supports `.returning()` for SQLite — proceed with it; the fallback in Step 1 exists only in case typecheck rejects it.

## Commands you will need

| Purpose   | Command             | Expected  |
|-----------|---------------------|-----------|
| Typecheck | `bun run typecheck` | exit 0    |
| Lint      | `bun run lint`      | exit 0    |
| Test      | `bun test`          | all pass  |

## Scope

**In scope**:
- `lib/mastery-recompute.ts` (atomic claim)
- `lib/mastery-engine.ts` (conflict-safe upsert in `recomputeAll`)

**Out of scope**:
- The mastery formula/algorithm — do not change how mastery values are computed, only how rows are written and jobs claimed.
- Schema changes to `masteryRecomputeQueue` unless Step 1 genuinely requires a `claimedBy`/`claimedAt` column (prefer avoiding).

## Git workflow

- Branch: `advisor/009-mastery-recompute-atomic-claim`
- Commit: `fix(mastery): atomic queue claim and conflict-safe concept upsert`
- No push/PR unless instructed.

## Steps

### Step 1: Claim rows atomically

Replace the select-then-update with a single conditional claim so two runners cannot grab the same rows. Option A (preferred, minimal schema): claim by conditional update that only transitions `pending -> processing`, then select the rows this call just claimed. Because libsql is single-writer, the safest portable form is:
```ts
// pick candidate ids
const candidates = await db.select({ id: masteryRecomputeQueue.id })
  .from(masteryRecomputeQueue).where(eq(masteryRecomputeQueue.status, "pending")).limit(limit);
if (candidates.length === 0) return;
const ids = candidates.map(c => c.id);
// atomically flip only those still pending; RETURNING tells us which we actually own
const claimed = await db.update(masteryRecomputeQueue)
  .set({ status: "processing", updatedAt: new Date() })
  .where(and(inArray(masteryRecomputeQueue.id, ids), eq(masteryRecomputeQueue.status, "pending")))
  .returning();
if (claimed.length === 0) return;
// process only `claimed`, not the original candidate select
```
Process `claimed` (the rows this call transitioned), not the pre-update snapshot. This closes the window where a concurrent run already moved a row out of `pending`.

**Verify**: `bun run typecheck` → exit 0. If typecheck rejects `.returning()` on this driver (not expected; see Current state), fall back to re-selecting `WHERE id IN (ids) AND status='processing' AND updatedAt = <thisRunTimestamp>`.

### Step 2: Make the concept/chapter writes conflict-safe

In `lib/mastery-engine.ts` `recomputeAll`, change BOTH read-then-insert blocks to `insert(...).onConflictDoUpdate({ target: [...], set: { ... } })` (style exemplar: `lib/analytics-sync.ts:102`):
- `studentConceptMastery` (block at `mastery-engine.ts:70-104`): target `[studentConceptMastery.studentId, studentConceptMastery.courseId, studentConceptMastery.conceptName]`.
- `studentChapterMastery` (block starting `mastery-engine.ts:191`): target `[studentChapterMastery.studentId, studentChapterMastery.chapterId]`.

Preserve every field the current code computes (e.g. `masteryScore`, `confidence`, `evidenceCount`, `trend`, `lastEvidenceAt`, `updatedAt`) — map them into the `set`. Note the concept block also builds an in-memory `conceptRow` used later for the chapter aggregation; keep that value flow intact.

**Verify**: `bun run typecheck` → exit 0; `bun run lint` → exit 0.

### Step 3: Guard the batch loop so one failure does not poison the claim

Confirm each job's try/catch still marks that single job `completed`/`failed` independently (existing behavior at `mastery-recompute.ts:64-84`). With Step 2 the unique-constraint throw no longer happens, so genuine failures now reflect real errors.

**Verify**: `bun test` → all pass (no mastery unit tests may exist; typecheck is the gate).

## Test plan

- If a pure helper emerges (e.g. the mapping of computed values to the upsert `set`), unit-test it. Otherwise verification is typecheck + reasoning.
- Manual/integration: run `scripts/run-evals.ts` if it exercises mastery (it does not per its header), or trigger two recompute requests for the same student rapidly in dev and confirm no job ends in `failed` and mastery rows update.

## Done criteria

ALL must hold:
- [ ] Claim uses a single atomic `pending -> processing` transition (conditional update), processing only owned rows
- [ ] Both `studentConceptMastery` and `studentChapterMastery` writes use `onConflictDoUpdate` on their real unique columns
- [ ] `bun run typecheck` / `bun run lint` / `bun test` exit 0
- [ ] Only the two lib files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- `.returning()` and `onConflictDoUpdate` are both unsupported by the installed Drizzle/libsql versions — STOP and report; a raw-SQL fallback is needed. (`onConflictDoUpdate` is proven working at `lib/analytics-sync.ts:102`, so this is unlikely.)
- The unique constraints at `db/schema.ts:1846` / `db/schema.ts:2392` no longer match the columns listed in Step 2 — the schema drifted; adjust the targets, do not guess.
- `recomputeAll` writes to a THIRD uniquely-constrained table beyond concept + chapter mastery — apply the same upsert pattern to it and note it in the PR.

## Maintenance notes

- Reviewer: verify the `set` clause in the upsert preserves every field the old insert set (no dropped columns).
- If the queue ever gets multiple worker processes (not just cron + inline), the atomic claim is what makes that safe.
