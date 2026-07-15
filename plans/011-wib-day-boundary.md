# Plan 011: Compute streak/quota/KV "day" in Asia/Jakarta (WIB) instead of UTC

> **Executor instructions**: Follow step by step. Run every verification command. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- lib/streak-service.ts lib/usage-budget-service.ts lib/kv-cache.ts`
> If any changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (changes the day boundary; shifts existing streak/quota accounting)
- **Depends on**: plans/001-verification-baseline.md (for `bun test`)
- **Category**: bug
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

Streak, daily AI quota, and the KV write-day key all compute "today" in UTC. For WIB (UTC+7) users the day resets at 07:00 local time. Study done between 00:00 and 07:00 WIB counts toward the previous calendar day, so streaks and daily quotas can be off by up to 7 hours from what students see; late-night study (a common student pattern) is mis-attributed. There is no ADR recording UTC as an intentional choice, so this is a bug, not a settled tradeoff.

## Current state

`lib/streak-service.ts:5-22`:
```ts
function todayUtc(): string { return new Date().toISOString().slice(0, 10); }
function yesterdayUtc(): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10);
}
async function hasActivityOn(studentId: string, dateStr: string): Promise<boolean> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(learningEvents)
    .where(sql`${learningEvents.studentId} = ${studentId} AND strftime('%Y-%m-%d', datetime(${learningEvents.createdAt}, 'unixepoch')) = ${dateStr}`);
  return (row?.count ?? 0) > 0;
}
```
- `learningEvents.createdAt` is `mode:"timestamp"` = seconds, so `unixepoch` units are correct — the issue is the zone, not the unit.
- `lib/usage-budget-service.ts:18-19` (`getDailyUsageCount`) and `:67-68` (`getPremiumCount`) — IMPORTANT, different mechanism than the streak service: these do NOT use SQL `datetime()` bucketing. They compute a JS boundary and compare with Drizzle `gte`:
  ```ts
  const todayUtc = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(`${todayUtc}T00:00:00.000Z`);
  // ... gte(aiUsageEvents.createdAt, startOfDay)
  ```
  The fix here is a Date-valued helper (WIB midnight as a UTC instant), NOT a `'+7 hours'` SQL modifier — there is no `datetime(...)` call in this file to modify.
- `lib/kv-cache.ts:50-52` — `todayKey()` uses `new Date().toISOString().slice(0,10)` for the write-day counter.

## Commands you will need

| Purpose   | Command             | Expected  |
|-----------|---------------------|-----------|
| Typecheck | `bun run typecheck` | exit 0    |
| Test      | `bun test`          | all pass  |
| Lint      | `bun run lint`      | exit 0    |

## Scope

**In scope**:
- `lib/learning-day.ts` (create — single source of truth for the WIB learning day)
- `lib/learning-day.test.ts` (create)
- `lib/streak-service.ts`
- `lib/usage-budget-service.ts`
- `lib/kv-cache.ts` (only `todayKey`)

**Out of scope**:
- Changing `learningEvents.createdAt` storage (stays unix seconds UTC — correct).
- Any historical backfill/migration of existing streak rows (call it out as follow-up; do not attempt data migration here).

## Git workflow

- Branch: `advisor/011-wib-day-boundary`
- Commit: `fix(streak): compute learning day in Asia/Jakarta across streak, quota, and kv counter`
- No push/PR unless instructed.

## Steps

### Step 1: Create one WIB day helper

Create `lib/learning-day.ts`. WIB is a fixed UTC+7 (Indonesia does not observe DST), so a fixed offset is correct and avoids Intl timezone dependencies:
```ts
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** YYYY-MM-DD for the given instant in WIB (UTC+7). Defaults to now. */
export function wibDay(at: Date = new Date()): string {
  return new Date(at.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}
export function wibYesterday(at: Date = new Date()): string {
  return wibDay(new Date(at.getTime() - DAY_MS));
}
/** The UTC instant at which the given instant's WIB day began (WIB midnight = previous day 17:00 UTC). For Drizzle gte() comparisons. */
export function wibDayStartUtc(at: Date = new Date()): Date {
  const shifted = at.getTime() + WIB_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - WIB_OFFSET_MS);
}
```

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Unit-test the helper

Create `lib/learning-day.test.ts`: an instant at `2026-07-15T20:00:00Z` (03:00 WIB next day) → `wibDay` returns `2026-07-16`; `2026-07-15T16:59:00Z` (23:59 WIB) → `2026-07-15`; `wibYesterday` one day back. For `wibDayStartUtc`: input `2026-07-15T20:00:00Z` → `2026-07-15T17:00:00.000Z` (WIB midnight of Jul 16); input `2026-07-15T16:59:00Z` → `2026-07-14T17:00:00.000Z`. These pin the 17:00-UTC boundary behavior.

**Verify**: `bun test` → all pass.

### Step 3: Replace UTC day computation in all three modules

- `lib/streak-service.ts`: replace `todayUtc`/`yesterdayUtc` with `wibDay()`/`wibYesterday()`. In `hasActivityOn`, shift the SQL day extraction by +7h: change `datetime(${createdAt}, 'unixepoch')` to `datetime(${createdAt}, 'unixepoch', '+7 hours')` so the SQL day matches the JS `wibDay`. (SQLite `strftime`/`datetime` accept modifiers.)
- `lib/usage-budget-service.ts`: in BOTH `getDailyUsageCount` (`:17-32`) and `getPremiumCount` (`:66-79`), replace the two-line `todayUtc`/`startOfDay` computation with `const startOfDay = wibDayStartUtc();` and keep the existing `gte(aiUsageEvents.createdAt, startOfDay)` comparison unchanged. Do NOT add any SQL `datetime` modifier here — this file has none.
- `lib/kv-cache.ts:50-52`: `todayKey()` returns `` `meta:writes:${wibDay()}` ``.

**Verify**: `bun run typecheck` → exit 0; `bun run lint` → exit 0; `bun test` → all pass.

## Test plan

- `lib/learning-day.test.ts` pins the boundary (Step 2).
- The SQL `+7 hours` change cannot be unit-tested without a DB; verify by reasoning that the JS `wibDay` and the SQL `datetime(...,'+7 hours')` day string agree for the same instant, and note a manual dev check in the PR (study just after 00:00 WIB counts toward the correct day).

## Done criteria

ALL must hold:
- [ ] `lib/learning-day.ts` is the only place computing the day string; streak/quota/kv all call it
- [ ] Every `datetime(..., 'unixepoch')` used for day-bucketing has the `'+7 hours'` modifier to match
- [ ] `grep -rn "toISOString().slice(0, 10)" lib/streak-service.ts lib/usage-budget-service.ts lib/kv-cache.ts` → no remaining ad hoc UTC day strings
- [ ] `bun test` / `bun run typecheck` / `bun run lint` exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` row updated

## Known other UTC-day users (verified at plan time — explicitly OUT of scope)

These files also compute a UTC day string via `toISOString().slice(0, 10)` but serve different accounting (admin analytics, ops metrics, Gemini key-rotation windows), where a UTC day is acceptable or even intended (Gemini quota resets are provider-side, not WIB):
`lib/cohort-analytics.ts`, `lib/gemini-keys.ts`, `lib/ops-metrics.ts`, `lib/recommendation-service.ts`, `lib/learning-analytics.service.ts`, `lib/zyra/learning-memory.service.ts`, `app/api/admin/key-diagnostics/route.ts`, `app/(admin)/admin/(academic)/tutorial-pka/_components/registrations-tab.tsx`.

Leave them alone. Note in the PR that student-facing analytics (`recommendation-service`, `learning-analytics.service`) still bucket by UTC day and may deserve the same treatment as follow-up.

## STOP conditions

- A module NOT in the list above turns out to feed the SAME streak/quota/KV accounting as the three in-scope files (grep `unixepoch` and `toISOString().slice(0, 10)` across `lib/` to check) — report; consistency within one accounting domain matters.
- Changing the boundary would corrupt in-flight streaks in a way the owner must decide on (e.g. today's streak resets for some users) — land the code but flag the one-time accounting shift prominently; do not attempt a data migration.

## Maintenance notes

- Reviewer: confirm JS `wibDay` and SQL `+7 hours` produce identical day strings for boundary instants.
- If the product ever serves non-WIB users, replace the fixed offset with a per-user timezone; this helper is the single seam to change.
- Deferred: historical streak recomputation is out of scope.
