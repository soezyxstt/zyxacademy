# Plan 013: Constant-time secret comparison and fail-closed cron auth

> **Executor instructions**: Follow step by step. Run every verification command. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- app/api/cron/analytics/route.ts workers/vector-api/index.ts workers/diktat-renderer/index.js workers/realtime/src/room.ts app/api/live/callback/route.ts`
> If any changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

Two related shared-secret weaknesses: (1) the analytics cron route compares against `` `Bearer ${process.env.CRON_SECRET}` `` — if `CRON_SECRET` is ever unset, the expected header collapses to the literal `"Bearer undefined"`, which an attacker can send verbatim, making the analytics-sync job callable by anyone; (2) several worker/route secret checks use plain `!==` string comparison, which leaks timing proportional to the matching-prefix length. The secrets gate vector upsert/delete, PDF rendering, live-quiz result callbacks, and host control commands. The HMAC token path (`room.ts:533-564`) already uses `crypto.subtle.verify` correctly and is out of scope.

## Current state

`app/api/cron/analytics/route.ts` (entire file):
```ts
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const result = await syncPopularPages();
  return NextResponse.json(result);
}
```
`workers/vector-api/index.ts:71-74`:
```ts
const auth = request.headers.get('Authorization');
if (!auth || auth !== `Bearer ${env.SHARED_SECRET}`) {
  return new Response('Unauthorized', { status: 401 });
}
```
Same `!==` pattern per the security audit at `workers/diktat-renderer/index.js:12`, `app/api/live/callback/route.ts:43`, and the DO control check `workers/realtime/src/room.ts:117`.

Constant-time primitives: Node routes can use `crypto.timingSafeEqual`; Cloudflare Workers expose `crypto.subtle` (use a length check + a constant-time compare over encoded bytes, since `timingSafeEqual` is not in the Workers runtime).

## Commands you will need

| Purpose        | Command                                    | Expected  |
|----------------|--------------------------------------------|-----------|
| Typecheck app  | `bun run typecheck`                        | exit 0    |
| Lint           | `bun run lint`                             | exit 0    |
| Worker types   | `cd workers/vector-api && bunx tsc --noEmit` (if tsconfig present) | exit 0 |

## Scope

**In scope**:
- `app/api/cron/analytics/route.ts`
- `app/api/live/callback/route.ts` (the secret compare only)
- `workers/vector-api/index.ts`
- `workers/diktat-renderer/index.js`
- `workers/realtime/src/room.ts` (the control-secret compare at ~line 117 only)
- `lib/constant-time.ts` (create — shared helper for the Node-side routes)

**Out of scope**:
- The HMAC token verification in `room.ts` (already correct).
- `lib/env.ts` schema for `CRON_SECRET` — note: `CRON_SECRET` is currently read via `process.env`, not the validated env; adding it to `lib/env.ts` is optional follow-up, not required here.

## Git workflow

- Branch: `advisor/013-constant-time-secrets-cron`
- Commit: `fix(security): constant-time secret checks and fail-closed cron auth`
- No push/PR unless instructed.

## Steps

### Step 1: Fail closed when `CRON_SECRET` is missing

In `app/api/cron/analytics/route.ts`, reject before comparing if the secret is unset/empty:
```ts
const secret = process.env.CRON_SECRET;
if (!secret) return new NextResponse("Server misconfigured", { status: 500 });
const authHeader = request.headers.get("authorization") ?? "";
if (!timingSafeEqualStr(authHeader, `Bearer ${secret}`)) {
  return new NextResponse("Unauthorized", { status: 401 });
}
```

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Add a constant-time string compare helper for Node routes

Create `lib/constant-time.ts`:
```ts
import { timingSafeEqual } from "node:crypto";
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;   // length is not secret here
  return timingSafeEqual(ab, bb);
}
```
Use it in the cron route (Step 1) and in `app/api/live/callback/route.ts:43`.

**Verify**: `bun run typecheck` → exit 0; `bun run lint` → exit 0.

### Step 3: Constant-time compare in the Workers (no node:crypto)

In `workers/vector-api/index.ts`, `workers/diktat-renderer/index.js`, and `workers/realtime/src/room.ts` (~line 117), replace the `!==` secret compare with a small constant-time compare that works in the Workers runtime:
```js
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ae = new TextEncoder().encode(a), be = new TextEncoder().encode(b);
  if (ae.length !== be.length) return false;
  let diff = 0;
  for (let i = 0; i < ae.length; i++) diff |= ae[i] ^ be[i];
  return diff === 0;
}
```
Keep the `Bearer ` prefix handling. Also fail closed if `env.SHARED_SECRET` (or the diktat/live secret) is falsy.

**Verify**: worker typecheck (where a tsconfig exists) → exit 0; otherwise confirm the JS parses (no build error in `bun run dev` for app-side files).

## Test plan

- Add `lib/constant-time.test.ts` (Bun): equal strings → true; different-length → false; same-length-different → false.
- The Workers `safeEqual` is duplicated per worker (workers do not share app modules); a quick inline reasoning check suffices, or copy the same 3 cases into a worker test if a worker test setup exists.
- Manual: unset `CRON_SECRET` locally and confirm the cron route returns 500, not 200.

## Done criteria

ALL must hold:
- [ ] Cron route returns 500 when `CRON_SECRET` is unset and never accepts `"Bearer undefined"`
- [ ] All in-scope secret compares use a constant-time function (no bare `!==` on the secret)
- [ ] `lib/constant-time.ts` unit-tested
- [ ] `bun test` / `bun run typecheck` / `bun run lint` exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- A worker has no build/typecheck path and editing `index.js` risks breaking its deploy — make the minimal change and note that the worker must be redeployed; do not restructure the worker.
- `app/api/live/callback/route.ts` secret comes from a validated env with a guaranteed non-empty value — still switch to constant-time compare, but you may skip the fail-closed guard there and note why.

## Maintenance notes

- Reviewer: confirm each worker fails closed on a missing secret (empty env should never authorize).
- The `safeEqual` helper is duplicated across workers by necessity (separate bundles); if a shared worker util package is introduced later, centralize it.
- Consider adding `CRON_SECRET` to `lib/env.ts` so boot-time validation catches a missing value (optional follow-up).
