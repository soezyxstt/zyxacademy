# Plan 002: Enforce auth + ownership on the R2 file proxy

> **Executor instructions**: Follow step by step. Run every verification command and confirm the expected result before proceeding. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- "app/api/storage/file" lib/storage lib/auth.ts db/schema.ts`
> If any in-scope file changed, compare "Current state" excerpts to live code; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

`app/api/storage/file/[...key]/route.ts` streams back any object in the R2 bucket for any path the caller supplies, with no session check. `lib/storage/r2.ts` routes ALL stored objects (admin PDFs, tutor materials, course files, blog media) through this one path, and object keys are not secret — they are returned in API/list responses and embedded in pages. Any unauthenticated internet client who sees or guesses a key can download private course PDFs across tenants and roles. This is broken object-level access control on the primary file-delivery path.

## Current state

`app/api/storage/file/[...key]/route.ts` — the entire GET handler, no `auth` import anywhere in the file:
```ts
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const { key: keyParts } = await params;
    const key = Array.isArray(keyParts) ? keyParts.join("/") : keyParts;
    if (!key) return new Response("Missing file key", { status: 400 });
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const s3Res = await s3.send(command);
    // ... streams s3Res.Body straight back
```

- `proxy.ts` (repo root) matcher excludes `/api`, so this route is publicly reachable.
- Session pattern used everywhere else (e.g. `app/api/quiz/daily/route.ts:26`):
  ```ts
  import { auth } from '@/lib/auth';
  import { headers } from 'next/headers';
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  ```
- Role/ownership helpers exist: `verifyTutorAccess` (`app/actions/tutor-management.ts`), `assertAdmin` (`lib/uploadthing-admin.ts`), and enrollment checks via `enrollments` table (`db/schema.ts`).
- Key prefixes in the bucket (from `lib/storage/r2.ts` and upload routes): `materials/pdf/...` (admin PDFs), tutor materials, `blog/...` (public blog media), drive files.

**Key design question the executor must resolve, not guess**: which prefixes are legitimately public. Blog images are rendered on public marketing pages and must stay unauthenticated. Course/material PDFs must be gated.

## Commands you will need

| Purpose   | Command              | Expected            |
|-----------|----------------------|---------------------|
| Typecheck | `bun run typecheck`  | exit 0              |
| Lint      | `bun run lint`       | exit 0              |
| Dev serve | `bun run dev`        | boots on :3000      |

## Scope

**In scope**:
- `app/api/storage/file/[...key]/route.ts`

**Out of scope**:
- `lib/storage/*` — the URL builders; do not change how keys are generated.
- Upload routes (`app/api/storage/upload/route.ts`, `app/api/admin/upload-pdf/route.ts`) — already role-checked per the security audit.
- Do NOT rename or migrate any storage key prefixes here (that is plan 015-adjacent debt work).

## Git workflow

- Branch: `advisor/002-r2-file-proxy-auth`
- Conventional commit, e.g. `fix(security): gate R2 file proxy behind session and public-prefix allowlist`.
- No push/PR unless instructed.

## Steps

### Step 1: Define a public-prefix allowlist

At the top of the route file add an explicit allowlist constant of prefixes served without auth:
```ts
// Objects under these prefixes are intentionally public (rendered on marketing/blog pages).
const PUBLIC_PREFIXES = ["blog/"];
function isPublicKey(key: string): boolean {
  return PUBLIC_PREFIXES.some((p) => key.startsWith(p));
}
```
Before assuming `blog/` is the only public prefix, grep the codebase for where `getUrl`/the proxy path is used on public (unauthenticated) pages and confirm the set. If you find public rendering of any other prefix, add it and note it in the PR.

**Verify**: `grep -rn "storage/file" app components lib | grep -v node_modules` → review each call site; confirm which run on public routes.

### Step 2: Require a session for non-public keys

After computing `key` and before the `GetObjectCommand`, insert:
```ts
if (!isPublicKey(key)) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
}
```
Add the imports `import { auth } from "@/lib/auth";` and `import { headers } from "next/headers";`.

This is the minimum viable gate: authenticated users only for private objects. Full per-object ownership (enrollment check that this user may see THIS material) is Step 3.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Enforce ownership where the key maps to a known material

If a lookup table exists that maps a storage key to a course/material (search `db/schema.ts` for a column holding the storage key, e.g. `uploadthingKey`, `storageKey`, `fileKey`, and any `driveItem`/material row referencing it): resolve the key to its owning course and require that a non-admin/non-tutor session user has an active enrollment in that course before streaming. Model the enrollment check on the pattern in `app/api/quiz/daily/route.ts:40-49`.

If no such mapping exists for a key (e.g. ad hoc uploads), fall back to "authenticated session required" from Step 2 and note the gap in the PR — do NOT invent a mapping.

**Verify**: `bun run typecheck` → exit 0; `bun run dev` boots; manually confirm an unauthenticated request to a non-`blog/` key returns 401 and a `blog/` key still returns the file.

## Test plan

- No test runner assertion required for the streaming path (needs live R2). Add a pure unit test `app/api/storage/file/isPublicKey.test.ts` ONLY if `isPublicKey` is extracted to an importable module; otherwise verify by manual request as in Step 3.
- Manual verification matrix (record results in PR): unauthenticated + `materials/pdf/x` → 401; unauthenticated + `blog/x` → 200; authenticated non-enrolled + gated material → 403 (if Step 3 landed) or 200 (if only Step 2); admin → 200.

## Done criteria

ALL must hold:
- [ ] Unauthenticated request to a non-public key returns 401 (verified manually)
- [ ] `blog/` (public) keys still stream without auth
- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] Only `app/api/storage/file/[...key]/route.ts` modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- More than one prefix turns out to be rendered on public pages and the boundary is unclear — report the list; do not guess the allowlist.
- Gating breaks public blog image rendering in `bun run dev` — report; the allowlist is wrong.
- Step 3 requires schema changes or touching out-of-scope files — land Steps 1-2 (which already close the unauthenticated hole) and report Step 3 as follow-up.

## Maintenance notes

- Reviewer must scrutinize the `PUBLIC_PREFIXES` list — anything added there is world-readable.
- If storage keys are ever renamed to a provider-neutral scheme (uploadthing teardown / debt work), keep the public-prefix logic in sync.
- Caching: the route sets `Cache-Control: public, max-age=3600`; for gated objects consider changing to `private` so shared caches do not retain authorized content. Flag in PR.
