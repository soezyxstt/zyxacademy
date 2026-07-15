# Plan 016: Fix onboarding — add `.env.example`, repair the README link, add typecheck to the gate

> **Executor instructions**: Follow step by step. Run every verification command. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- README.md lib/env.ts AGENTS.md docs/DEVELOPMENT.md`
> If any changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

Onboarding is broken at step one. `README.md:19` and `docs/DEVELOPMENT.md:7` both instruct `cp .env.example .env.local`, but no `.env*` file exists in the repo. `lib/env.ts` validates ~50 env vars at boot (many required with `.min(1)`), so a fresh `bun run dev` crashes in env validation with no template to work from. Separately, `README.md:25` links to a non-existent `AGENT_CONTEXT.md` (the content lives in `AGENTS.md` "Current State"), and the AGENTS.md execution gate names only `bun run lint`, never `bun run typecheck` — so agents (which follow AGENTS.md literally) let type regressions land uncaught since ESLint does not catch type errors and `bun run build` is discouraged.

## Current state

- No `.env*` file exists (verified: `ls .env*` → none; `.env.example` absent).
- CRITICAL: the root `.gitignore` contains the pattern `.env*` (under `# env files`), which would silently ignore the new `.env.example` — it would never be committed. Step 1 must add a negation rule.
- Required-key nuance in `lib/env.ts`: most required keys use `.min(1)`, but `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (`lib/env.ts:21-22`) are plain `z.string()` — still required (no `.optional()`), just without the min-length. "Required" = no `.optional()`, no default, no transform-to-undefined. `BETTER_AUTH_URL` is auto-derived via `z.preprocess` — mark it optional-with-comment in the example.
- `README.md:16-20`:
  ```
  bun install
  cp .env.example .env.local   # fill in secrets
  bun run dev                   # http://localhost:3000
  ```
- `README.md:25`: `**[AGENT_CONTEXT.md](AGENT_CONTEXT.md)**; current development state, blockers, standing decisions` — file does not exist. `AGENTS.md` "Current State" section holds this content.
- `lib/env.ts` — `createEnv` with server vars (required: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `UPLOADTHING_TOKEN`, `RESEND_API_KEY`, `GEMINI_API_KEY`, `INNGEST_EVENT_KEY`) plus many optional (`TURSO_*`, `R2_*`, `CF_*`, `PINECONE_*`, `FEATURE_*`, etc.) and client vars (`NEXT_PUBLIC_*`).
- `package.json:11-12`: `"lint": "eslint"`, `"typecheck": "tsc --noEmit"`.
- AGENTS.md Execution Rule #3 gates `bun run lint` only.

## Commands you will need

| Purpose   | Command             | Expected  |
|-----------|---------------------|-----------|
| Typecheck | `bun run typecheck` | exit 0    |
| Lint      | `bun run lint`      | exit 0    |

## Scope

**In scope**:
- `.env.example` (create)
- `.gitignore` (add `!.env.example` negation only — one line)
- `README.md` (fix the `AGENT_CONTEXT.md` link)
- `AGENTS.md` (add typecheck to Execution Rule #3)
- `docs/DEVELOPMENT.md` (only if its env section should reference `.env.example` — light touch)

**Out of scope**:
- `lib/env.ts` — do not change validation; only mirror its keys into the example.
- Real secret values — the example uses empty placeholders and comments ONLY. Never put a real credential in `.env.example`.
- Pre-commit hooks — noted as optional follow-up, not built here (keeps this plan low-risk; can be a separate plan).

## Git workflow

- Branch: `advisor/016-onboarding-dx`
- Commit: `docs(dx): add .env.example, fix README link, add typecheck to the gate`
- No push/PR unless instructed.

## Steps

### Step 1: Generate `.env.example` from `lib/env.ts`

Enumerate every key in `lib/env.ts` (both `server` and `client` objects) and write a `.env.example` with an empty placeholder and a one-line comment per key, grouped by section. Mark required vs optional. Use the existing JSDoc comments in `lib/env.ts` as the source of the per-key descriptions. Example shape (no real values):
```
# ── Core (required) ──
DATABASE_URL=
BETTER_AUTH_SECRET=          # >=32 high-entropy chars; openssl rand -base64 32
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GEMINI_API_KEY=
# ── Storage (Cloudflare R2) ──
R2_ENDPOINT=
...
# ── Feature flags (optional; "1" enables) ──
FEATURE_PKA=
...
```
Do not invent keys not in `lib/env.ts`; do not omit required ones. No em/en dashes anywhere (AGENTS.md rule) — the `──` box-drawing chars above are fine (not dashes), but avoid `—`/`–`.

Then add to `.gitignore`, directly under the existing `.env*` line:
```
!.env.example
```
Without this the file is ignored (`.env*` matches it) and never committed.

**Verify**: every required server key (no `.optional()`, no default — includes the plain `z.string()` ones like `GOOGLE_CLIENT_ID`) appears in `.env.example`; `git check-ignore .env.example` exits 1 (NOT ignored); `git status` shows `.env.example` as a new file.

### Step 2: Fix the README link

In `README.md:25`, repoint `AGENT_CONTEXT.md` to `AGENTS.md` (the real home of current state), e.g. `**[AGENTS.md](AGENTS.md)**; coding rules, current development state, blockers`. Remove the dead `AGENT_CONTEXT.md` reference. (There is already a separate AGENTS.md bullet; merge or dedupe cleanly.)

**Verify**: `grep -n "AGENT_CONTEXT" README.md` → no matches.

### Step 3: Add typecheck to the AGENTS.md gate

In AGENTS.md Execution Rule #3, add `bun run typecheck` alongside `bun run lint` as a required gate after each edit batch. Keep the existing "do not run build unless requested" clause.

**Verify**: `grep -n "typecheck" AGENTS.md` → shows it in the execution rules.

## Test plan

- No code tests. Verification: `.env.example` covers all required keys; README has no dead link; AGENTS.md names typecheck.
- Optional manual: in a clean checkout, `cp .env.example .env.local`, fill required keys, `bun run dev` boots past env validation.

## Done criteria

ALL must hold:
- [ ] `.env.example` exists and contains every required key from `lib/env.ts` (no real secrets)
- [ ] `git check-ignore .env.example` exits 1 (the `!.env.example` negation is in `.gitignore`)
- [ ] `grep -n "AGENT_CONTEXT" README.md` → no matches
- [ ] `grep -n "typecheck" AGENTS.md` → present in Execution Rules
- [ ] `bun run lint` / `bun run typecheck` exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- `lib/env.ts` has drifted and now reads keys via a different mechanism — regenerate the example from the current file; do not use this plan's key list verbatim if it no longer matches.
- You are unsure whether a var is required vs optional — mirror the Zod schema exactly (no `.optional()`, no default, no transform-to-undefined = required, whether or not it has `.min(1)`); do not guess.

## Maintenance notes

- Keep `.env.example` in sync whenever `lib/env.ts` gains a key (AGENTS.md auto-update rule already covers env changes).
- Follow-up (separate plan): a pre-commit hook running `bun run lint` + `bun run typecheck` on staged files, since there is no CI.
