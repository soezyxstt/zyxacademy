# Plan 012: Fix the KV write-budget guard so the daily cap cannot be exceeded

> **Executor instructions**: Follow step by step. Run every verification command. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- lib/kv-cache.ts`
> If it changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (cache-only path; failures already degrade to silent miss)
- **Depends on**: plans/001-verification-baseline.md (for `bun test`); coordinate with plans/011 (both touch `todayKey`)
- **Category**: bug (cost guard)
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

The daily write-budget guard undercounts, so the 900/day cap it exists to enforce can be exceeded — risking Cloudflare KV's hard 1,000 writes/day free-tier ceiling (a real money/quota guard per AGENTS.md). Two causes: when the counter key does not yet exist, the create PUT is issued without a precondition, so two concurrent first-writers both create it and one increment is lost; and `kvDelete` performs a KV write that is never charged against the counter at all.

## Current state

`lib/kv-cache.ts:58-88` — `claimWriteSlots`:
```ts
async function claimWriteSlots(slots = 2, maxRetries = 5): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const todayKey_ = todayKey();
    const res = await kvFetch(`/values/${encodeURIComponent(todayKey_)}`);
    let count = 0; let etag: string | null = null;
    if (res && res.ok) {
      const text = await res.text().catch(() => '0');
      const n = parseInt(text, 10); count = Number.isNaN(n) ? 0 : n;
      etag = res.headers.get('ETag');
    }
    if (count + slots > WRITE_DAILY_LIMIT) return false;
    const headers: Record<string, string> = { 'Content-Type': 'text/plain' };
    if (etag) headers['If-Match'] = etag;               // <-- no precondition when etag is null
    const putRes = await kvFetch(`/values/${encodeURIComponent(todayKey_)}?expiration_ttl=172800`,
      { method: 'PUT', headers, body: String(count + slots) });
    if (!putRes) return false;
    if (putRes.status === 412) continue;
    return putRes.ok;
  }
  return false;
}
```
`lib/kv-cache.ts:109-111` — delete is uncharged:
```ts
export async function kvDelete(key: string): Promise<void> {
  await kvFetch(`/values/${encodeURIComponent(key)}`, { method: 'DELETE' });
}
```
`WRITE_DAILY_LIMIT = 900` (`lib/kv-cache.ts:14`). Cloudflare KV supports `If-None-Match: *` for create-only writes.

## Commands you will need

| Purpose   | Command             | Expected  |
|-----------|---------------------|-----------|
| Typecheck | `bun run typecheck` | exit 0    |
| Test      | `bun test`          | all pass  |
| Lint      | `bun run lint`      | exit 0    |

## Scope

**In scope**:
- `lib/kv-cache.ts`
- `lib/kv-write-cap.ts` + `lib/kv-write-cap.test.ts` (reuse from plan 001; create only if 001 has not landed — see Step 3)

**Out of scope**:
- The `todayKey` day-boundary change (plan 011 owns it) — if plan 011 landed, keep using its `wibDay`-based key; do not revert.
- The read/`kvGet` path.

## Git workflow

- Branch: `advisor/012-kv-write-guard`
- Commit: `fix(kv): create-only precondition on counter and charge deletes against the write cap`
- No push/PR unless instructed.

## Steps

### Step 1: Use a create-only precondition when the counter key is absent

When `etag` is null (key does not exist yet), set `headers['If-None-Match'] = '*'` instead of no precondition, so only one concurrent creator wins; the loser gets 412 and retries (now seeing the key + etag). Keep `If-Match` for the update case.
```ts
if (etag) headers['If-Match'] = etag;
else headers['If-None-Match'] = '*';
```

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Charge deletes against the counter

Make `kvDelete` claim a slot before writing:
```ts
export async function kvDelete(key: string): Promise<void> {
  const claimed = await claimWriteSlots(1);
  if (!claimed) return;
  await kvFetch(`/values/${encodeURIComponent(key)}`, { method: 'DELETE' });
}
```
Note `kvPut` claims 2 slots (the value write + the counter write); a delete is one KV write plus the counter write. Decide the slot cost consistently — the counter PUT itself is also a KV write. If the intent of `slots=2` in `kvPut` is "value write + counter write," then delete should also claim 2. Read the surrounding comments to confirm the accounting intent and match it; document the chosen cost in a comment.

**Verify**: `bun run typecheck` → exit 0; `bun run lint` → exit 0.

### Step 3: Extract and test the pure cap check

Plan 001 creates `lib/kv-write-cap.ts` exporting `WRITE_DAILY_LIMIT` and `wouldExceedWriteCap(count, slots)`, plus `lib/kv-write-cap.test.ts` — if it landed, reuse both and skip this step. If plan 001 has NOT landed, create that module yourself the same way (constant moved out of `kv-cache.ts`, helper used at the line-73 check, tests at `(898,2)` allowed / `(899,2)` denied / `(900,1)` denied / `(0,2)` allowed). Do NOT import `lib/kv-cache.ts` from a test file: it imports `@/lib/env`, which throws at import when required env vars are absent.

**Verify**: `bun test` → all pass.

## Test plan

- `lib/kv-write-cap.test.ts` on the boundary helper (Step 3).
- The CAS/precondition behavior needs live KV to test end-to-end; verify by reasoning and note a dev check in the PR. Do not add a network-mocked integration test unless a mocking setup already exists.

## Done criteria

ALL must hold:
- [ ] Counter creation uses `If-None-Match: *`; updates use `If-Match`
- [ ] `kvDelete` claims write slots before deleting
- [ ] `wouldExceedWriteCap` is unit-tested at the 900 boundary
- [ ] `bun test` / `bun run typecheck` / `bun run lint` exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- The Cloudflare KV REST API in use does not honor `If-None-Match: *` (check the `kvFetch` base and CF docs behavior) — report; an alternative create path is needed.
- The slot accounting intent (why `kvPut` uses 2) cannot be determined from the code/comments — STOP and confirm before changing delete's cost.

## Maintenance notes

- Reviewer: confirm the slot cost per operation is consistent and documented.
- If write volume grows, consider a coarser guard (stop at a lower threshold) since the counter's own writes also consume the budget.
- Coordinate merge order with plan 011 (both edit `todayKey`/its usage).
