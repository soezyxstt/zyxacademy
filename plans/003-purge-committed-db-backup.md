# Plan 003: Remove the committed `dev.db.bak` database and rotate any exposed credentials

> **Executor instructions**: Follow step by step. This plan touches git history rewriting and credential rotation — read the STOP conditions and the "human action required" notes carefully; some steps CANNOT be done by an executor agent and must be handed to the repo owner. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git ls-files dev.db.bak` → if it returns nothing, the file is already untracked; verify with the owner whether history was already purged, then skip to Step 4.

## Status

- **Priority**: P1
- **Effort**: S (executor portion) + human action (history rewrite, rotation)
- **Risk**: MED (history rewrite is destructive to shared history)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

`dev.db.bak` (2.2 MB SQLite) is tracked in git (`git ls-files dev.db.bak` returns it). A SQLite snapshot of a development database near a production-adjacent schema almost certainly contains user rows: accounts, emails, OAuth identifiers, session tokens, and any seeded PII. Because it is committed, it is present in the repo history and on every clone and remote; deleting the file in a new commit does NOT remove it from history. Anything sensitive inside it must be treated as exposed and rotated.

## Current state

- `git ls-files dev.db.bak` → `dev.db.bak` (tracked).
- `.gitignore` (repo root) ALREADY contains `dev.db` and `*.db` (under the `# local databases and backup logs` section) — but a gitignore `*.db` pattern matches only names ending in `.db`, so `dev.db.bak` is NOT covered; it was committed despite the section existing. The missing patterns are the backup/journal variants: `*.db.bak`, `*.db-journal`, `*.sqlite`, `*.sqlite3`.
- The live dev DB is `dev.db` (referenced in AGENTS.md as local SQLite dev mode). `dev.db` itself is not currently tracked (confirm with `git ls-files | grep -E "dev\.db$"`).

## Commands you will need

| Purpose             | Command                                  | Expected              |
|---------------------|------------------------------------------|-----------------------|
| Confirm tracked     | `git ls-files dev.db.bak`                | prints the path       |
| Inspect tables      | `bunx tsx -e "..."` or the sqlite CLI    | list of tables        |
| Remove from index   | `git rm --cached dev.db.bak`             | staged deletion       |

## Scope

**In scope**:
- `dev.db.bak` (remove from tracking)
- `.gitignore` (add DB/backup patterns)

**Out of scope**:
- `dev.db` if present and untracked — leave it; it is a local working file.
- Any application code.

## Git workflow

- Branch: `advisor/003-purge-db-backup`
- Commit: `chore(security): stop tracking dev.db.bak and ignore db/backup files`
- Do NOT force-push or rewrite shared history yourself — see Step 3 (human action).

## Steps

### Step 1: Determine what sensitive data the backup holds (to scope rotation)

Open the backup read-only and list its tables and whether user/session/token tables have rows. Do NOT print row contents into any file, PR, or this plan — report only table names and row counts.
Example (adjust to available tooling): use a read-only SQLite reader against `dev.db.bak` to enumerate tables and `SELECT count(*)` per table. Look specifically for: `user`, `session`, `account` (OAuth), `verification`, and anything holding tokens or emails.

**Verify**: you have a list of table names + row counts, no values copied anywhere.

### Step 2: Stop tracking the file and ignore future ones

```
git rm --cached dev.db.bak
```
`.gitignore` already has `dev.db` and `*.db`; append ONLY the missing backup/journal patterns to its existing `# local databases and backup logs` section:
```
*.db-journal
*.db.bak
*.sqlite
*.sqlite3
```
Confirm `dev.db` (working file) remains ignored and not accidentally staged.

**Verify**: `git status` shows `dev.db.bak` staged for deletion and no `.db` files tracked; `git check-ignore dev.db.bak` → prints the path.

### Step 3: History purge and credential rotation (HUMAN ACTION — do not perform as an agent)

Write these as explicit hand-off instructions in the PR description; do NOT run history-rewriting commands autonomously:
1. The file remains in history after Step 2. The owner must purge it with `git filter-repo --path dev.db.bak --invert-paths` (or BFG), then force-push, and every collaborator must re-clone. This rewrites shared history and is the owner's decision.
2. Treat every credential reachable from the backup's contents as burned: rotate `BETTER_AUTH_SECRET` (invalidates sessions), any OAuth client secret if tokens were stored, and force-invalidate existing sessions. Rotate on the provider side, then update the deployment env. (Secret values are never to appear in code or this repo — env only.)

**Verify**: PR description contains the numbered hand-off list; the executor has NOT run `filter-repo`/`push --force`.

### Step 4: Add a lightweight guard so it does not recur

Confirm `.gitignore` covers the patterns (Step 2). Optionally note in the PR that a pre-commit hook rejecting `*.db`/`*.bak` is added by plan 016 (DX) — do not add hooks here.

**Verify**: `git check-ignore -v dev.db.bak` shows the matching `.gitignore` rule.

## Test plan

- No unit tests. Verification is `git` state: file untracked, ignored, and the hand-off list present.

## Done criteria

ALL must hold:
- [ ] `git ls-files dev.db.bak` returns nothing after commit
- [ ] `.gitignore` contains `*.db.bak` (and the pre-existing `*.db` is untouched)
- [ ] `git check-ignore dev.db.bak` matches
- [ ] Table-name + row-count summary produced (no values copied anywhere)
- [ ] PR description contains the history-purge + rotation hand-off list
- [ ] Only `dev.db.bak` (deletion) and `.gitignore` changed (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- The backup contains real production user data (not dummy seed data) — report immediately with row counts; the rotation is then urgent and the owner must be alerted before anything else.
- `git rm --cached` reports the file is not tracked — the state drifted; confirm with the owner whether history was already cleaned.
- You are tempted to run `git filter-repo` or `git push --force` — STOP; that is explicitly a human decision (rewrites shared history).

## Maintenance notes

- Until the owner completes the Step 3 history purge, the data is still exposed in history — Step 2 alone is not sufficient; make this prominent in the PR.
- After rotation, verify the app still boots with the new `BETTER_AUTH_SECRET` and that existing users are simply logged out (expected).
- Consider moving seed/dev data generation to `db/seed.ts` (already exists) so no binary DB ever needs committing.
