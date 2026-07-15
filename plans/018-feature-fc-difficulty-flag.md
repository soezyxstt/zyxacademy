# Plan 018: Resolve the unread `FEATURE_FC_DIFFICULTY` flag (gate it or remove it)

> **Executor instructions**: This plan has a decision fork in Step 1. Read it fully, make the determination from the evidence, and if the intent is genuinely ambiguous, STOP and report rather than guessing. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- lib/env.ts lib/flashcard-scheduler.ts lib/flashcard-generator.ts "app/(student)/courses/[id]/flashcard/flashcard-client.tsx" docs/DEVELOPMENT.md docs/ARCHITECTURE.md`
> If any changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug / tech-debt (violates a documented invariant)
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

AGENTS.md Execution Rule #4: "Every feature ships behind the `FEATURE_*` env flag named in `lib/env.ts`. Flag absent or `"0"` = invisible." `FEATURE_FC_DIFFICULTY` is declared in `lib/env.ts` and documented in two docs, but it is never read anywhere — the E4 recall-difficulty feature ships always-on and cannot be rolled back via env. This is dead config that misleads operators into thinking the feature is toggleable, and it violates the project's own flag invariant. Either wire the gate or remove the flag and its doc references.

## Current state

- `lib/env.ts:85` declares `FEATURE_FC_DIFFICULTY: z.string().optional()`; `lib/env.ts:180` maps it in `runtimeEnv`. JSDoc: "EIF E4 flashcard recall difficulty + SM-2 blend. \"1\" enables."
- Documented: `docs/DEVELOPMENT.md:69`, `docs/ARCHITECTURE.md:561`.
- Verified: `grep -rn "FEATURE_FC_DIFFICULTY" app lib components hooks | grep -v env.ts` → 0 reads.
- The underlying data/logic is used unconditionally:
  - `lib/flashcard-scheduler.ts:25` — `difficultyFirstInterval(recallDifficulty)`.
  - `lib/flashcard-generator.ts:282-294` — generates `recallDifficulty`.
  - `app/(student)/courses/[id]/flashcard/flashcard-client.tsx:301-313` — uses recall difficulty in the UI.
- Every OTHER flag (`FEATURE_STUDY_PATH`, `FEATURE_TUTOR_ANALYTICS`, `FEATURE_MATERIAL_LIVE`, etc.) IS read/gated somewhere — grep any of them to see the gating pattern, e.g. `env.FEATURE_X === "1"`.

## Commands you will need

| Purpose   | Command             | Expected  |
|-----------|---------------------|-----------|
| Grep flag | `grep -rn "FEATURE_FC_DIFFICULTY" app lib components hooks docs` | shows all references |
| Typecheck | `bun run typecheck` | exit 0    |
| Lint      | `bun run lint`      | exit 0    |

## Scope

Depends on the Step 1 decision. **In scope for either branch**:
- `lib/env.ts` (only if removing the flag)
- `docs/DEVELOPMENT.md`, `docs/ARCHITECTURE.md` (update either way)

**In scope only for "gate it"**:
- `lib/flashcard-scheduler.ts`, `lib/flashcard-generator.ts`, `app/(student)/courses/[id]/flashcard/flashcard-client.tsx`

**Out of scope**:
- The SM-2 algorithm itself; the recall-difficulty data model.
- Other feature flags.

## Git workflow

- Branch: `advisor/018-feature-fc-difficulty-flag`
- Commit (gate): `fix(flashcard): gate E4 recall-difficulty behind FEATURE_FC_DIFFICULTY`
- Commit (remove): `chore(flags): remove unused FEATURE_FC_DIFFICULTY and mark E4 as shipped`
- No push/PR unless instructed.

## Steps

### Step 1: Decide gate vs remove (from evidence)

The E4 feature is live and used in three places. Determine intent:
- If the recall-difficulty blend is intended to be operationally toggleable (consistent with every other flag) → **gate it** (Step 2A).
- If E4 is considered permanently shipped and the flag was left behind by mistake → **remove it** (Step 2B).

Default recommendation: **remove** (Step 2B) — the feature is deeply woven into the scheduler and UI and gating it now risks a partial/broken state (difficulty generated but not applied). Removing the flag + updating docs to "shipped" is the lower-risk truth. Only choose gating if the owner wants a kill-switch. If genuinely unsure which the owner wants, STOP and ask.

### Step 2A: Gate it (only if chosen)

Wire `env.FEATURE_FC_DIFFICULTY === "1"` at the point where recall difficulty influences behavior:
- In `lib/flashcard-scheduler.ts`, when blending difficulty into the interval, fall back to the plain SM-2 interval when the flag is off.
- In `flashcard-client.tsx:301-313`, hide the recall-difficulty UI when the flag is off. (Pass the flag value from a server component; do not read server env in a client component — mirror how other flags reach the client here.)
Ensure "flag off" yields a coherent plain-SM-2 experience, not a half-feature.

**Verify**: `bun run typecheck` → exit 0; with the flag unset, flashcards still schedule via plain SM-2 and the difficulty UI is hidden.

### Step 2B: Remove it (default)

- Delete `FEATURE_FC_DIFFICULTY` from `lib/env.ts` (both the `server` schema entry and the `runtimeEnv` mapping).
- Update `docs/DEVELOPMENT.md:69` and `docs/ARCHITECTURE.md:561` to state E4 is permanently shipped (remove the flag row/mention).
- AGENTS.md does not mention this flag (verified by grep at plan time) — re-grep to confirm, no edit expected there.

**Verify**: `grep -rn "FEATURE_FC_DIFFICULTY" .` (excluding node_modules) → 0 matches; `bun run typecheck` → exit 0; `bun run lint` → exit 0.

## Test plan

- No unit tests. Verification: grep shows the flag is either consistently gated (2A) or fully gone (2B), and typecheck/lint pass.
- If 2A: manual check that flag-off gives plain SM-2 with no orphaned UI.

## Done criteria

ALL must hold (for the chosen branch):
- [ ] Decision recorded in the PR description with its rationale
- [ ] 2A: every recall-difficulty behavior is gated on the flag AND flag-off is coherent; OR 2B: `grep -rn "FEATURE_FC_DIFFICULTY" .` (excl. node_modules) → 0 matches
- [ ] Docs updated to match reality
- [ ] `bun run typecheck` / `bun run lint` exit 0
- [ ] Only in-scope files for the chosen branch modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- The owner's intent (kill-switch vs shipped) cannot be inferred and no one is available to decide — STOP; this is the one genuinely product-level call in the plan set.
- Gating (2A) reveals recall difficulty is load-bearing in a way that cannot be cleanly switched off — abandon 2A, recommend 2B, and report.

## Maintenance notes

- Reviewer: whichever branch, confirm docs and `lib/env.ts` agree with the code (no half-references left).
- This is a good template for auditing the other flags for the same "declared but unread" drift; the audit found only this one, but re-check after big features land.
