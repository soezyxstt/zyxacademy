# Zyra AI Plans 001 through 007 handoff

Date: 2026-08-11

Branch: `codex/zyra-ai-system-plan`

Baseline before this checkpoint: `2b6f0a90eae7ed040ce50835117c091de5de757d`

This handoff covers only Zyra AI System plans under `plans/zyra-ai-system/`. Production, Pinecone, preserved 1024-dimensional Vectorize indexes, and Plan 008 or later were not changed by this checkpoint.

## Status summary

| Plan | Status | Summary |
| --- | --- | --- |
| 001 | Completed | Staging control-plane foundation, guarded preflight, private resources, bindings, secret handling, Worker tests, lint, typecheck, and authenticated Wrangler dry-run passed. |
| 002 | Partial | Registry, provider adapters, routing contracts, four project slots, lint, typecheck, and local tests passed. Real staging probe passed 39 of 40 requests. One quarantined preview model returned HTTP 504 on the bounded initial request and one-request retry, so its release gate remains insufficient-sample. This does not block the accepted default route used by Plans 005 through 007. |
| 003 | Completed | SQLite Durable Object quota coordinator, atomic lease transitions, privacy checks, local synthetic concurrency, staging deployment, diagnostics, and remote synthetic smoke passed. |
| 004 | Completed | Additive allowance ledger migration, compatibility accounting, staging application canary, legacy preservation, and strict reconciliation passed. |
| 005 | Completed | Health-aware routing, control-plane lifecycle, AI Gateway metadata, quarantine protection, and a 40-request staging provider smoke passed across four project slots. |
| 006 | Completed | Exact and semantic cache contracts, isolated 768-dimensional semantic profile, Durable Object single-flight, write budget, calibration, staging deployment verification, and staging smoke passed. |
| 007 | Partial | Local implementation and all startup gates are green. The controlled staging remote shadow retry and maintainer human review are still pending. Plan 008 must not start until both gates pass. |

## Important evidence

Artifact directories are intentionally ignored by Git. The paths below identify the local evidence used for status claims. Transfer them only through an approved private channel, or rerun the documented staging scripts to regenerate masked evidence.

| Plan | Evidence |
| --- | --- |
| 001 | `artifacts/zyra-ai/20260805-plan001-preflight/plan-001-preflight.json`. `AGENTS.md` also records the earlier staging ledger evidence path, but that artifact is not present in this local worktree and must be obtained from the original operator if required. |
| 002 | `artifacts/zyra-ai/20260805-plan002-real/plan-002-model-probe.json`; `artifacts/zyra-ai/20260805-plan002-retry-preview/plan-002-model-probe.json` |
| 003 | `artifacts/zyra-ai/20260807-plan003-local-harness-fix/plan-003-result.json`; `artifacts/zyra-ai/20260807-plan003-final/plan-003-result.json` |
| 004 | `artifacts/staging-overhaul/20260807-plan004-allowance/plan-004-result.json`; `artifacts/staging-overhaul/20260807-plan004-app-canary-v3/plan-004-application-canary.json` |
| 005 | `artifacts/zyra-ai/20260807-plan005-provider-router-paced-v1/plan-005-provider-router.json` |
| 006 | `artifacts/zyra-ai/20260807-plan006-semantic-calibration/plan-006-semantic-calibration.json`; `artifacts/zyra-ai/20260807-plan006-cache-smoke-v10/plan-006-cache-smoke.json` |
| 007 | `artifacts/zyra-ai/20260807-plan007-pedagogy-eval/plan-007-pedagogy-eval.json`; `artifacts/staging-overhaul/20260808-plan007-local-shadow-v2/plan-007-pedagogy-shadow.json`; `artifacts/staging-overhaul/20260808-plan007-startup-diagnostics-v3/plan-007-pedagogy-startup-diagnostics.json` |

Plan 007 focused verification at handoff: 50 tests passed with 174 assertions, root typecheck passed, lint had zero errors, and `git diff --check` passed. Startup diagnostics passed all 11 stages with provider calls 0, database writes 0, trace writes 0, and learner side effects 0.

The full repository contract command currently reports 266 passing and 2 failing tests. Both failures are in the unchanged Overhaul Idea Bundle fixture suite at `tests/contracts/idea-bundle-v2.test.ts`, where the accepted fixture now reports a source checksum mismatch before the expected span validation. Zyra Plans 001 through 007 do not modify that test or its Idea Bundle implementation. Do not claim the entire repository contract suite is green until the maintainer resolves or re-baselines that separate fixture issue.

## Local configuration

Keep `.env`, `.env.local`, `.env.staging`, and all other `.env*` files ignored and outside Git. Do not paste values into issues, pull requests, logs, commands, artifacts, or documentation.

### Staging application configuration

The remote Plan 007 runner requires these names in the ignored `.env.staging` file:

Secrets:

- `TURSO_AUTH_TOKEN`
- `ZYRA_CONTROL_PLANE_TOKEN`
- `CF_AI_GATEWAY_TOKEN`
- `VECTORIZE_SHARED_SECRET`
- `GEMINI_API_KEY`
- `GEMINI_API_KEY_2`
- `GEMINI_API_KEY_3`
- `GEMINI_API_KEY_4`

Non-secret configuration, although some values still identify private infrastructure and must not be printed:

- `DATABASE_URL` or the repository-supported staging Turso connection URL setting
- `ZYX_ENVIRONMENT=staging`
- `ZYRA_CONTROL_PLANE_URL`
- `CF_AI_GATEWAY_URL`
- `VECTORIZE_WORKER_URL`
- `GEMINI_PROJECT_ALIAS_1`
- `GEMINI_PROJECT_ALIAS_2`
- `GEMINI_PROJECT_ALIAS_3`
- `GEMINI_PROJECT_ALIAS_4`
- `STAGING_ZYRA_PEDAGOGY_USER_ID`
- The primary pedagogy path is always-on; use an explicit shadow request for comparison

The dedicated identity must remain an active murid with a current legacy enrollment, current canonical enrollment, active session, and access to published canonical Tutorial PKA evidence.

Plan 005 reruns additionally use `STAGING_ZYRA_PROVIDER_ROUTER_USER_ID`. Plan 006 cache reruns may require `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, and `CF_API_TOKEN` according to the smoke script. Do not add unrelated UploadThing or Resend credentials for Plan 007; the scoped Zyra runtime env contract intentionally does not require them.

### Wrangler authentication

Wrangler uses `CLOUDFLARE_API_TOKEN` from the ignored root `.env` only. Do not copy it into `.env.staging`, use `wrangler login`, or print authentication output containing credentials. Verify the masked staging account identity before any Cloudflare operation.

## Staging-only changes already performed

- Provisioned and updated only the Zyra control-plane staging Worker and its staging bindings.
- Added and verified the staging Durable Object quota coordinator.
- Used the separate staging semantic-cache Vectorize index and private staging R2 resource. Canonical and preserved rollback indexes were not modified.
- Deployed Worker versions only to staging for Plan 003 quota verification and Plan 006 cache verification.
- Applied only the additive staging `0059_tricky_tag.sql` allowance migration. It adds `ai_allowance_leases`; no legacy table or column was removed.
- Ran staging provider probes and smokes under declared caps. Plan 003 synthetic smoke made zero provider calls. Plan 005 made 40 controlled provider calls. Plan 006 cache smoke made zero real provider calls.
- Plan 007 startup diagnostics used read-only Turso queries and local imports. They made zero provider calls and zero writes.
- No production deploy, production migration, production resource mutation, push, or destructive action was performed.

## Remaining Plan 007 gates

1. Run one controlled remote shadow retry against staging.
2. Confirm the resulting artifact reports no assessment leak, invalid citation, unsupported claim, pipeline-language leak, duplicate learner-visible message, or learner side effect.
3. Complete the maintainer human review for the generated fixed golden subset.
4. Validate the downloaded human review JSON with the repository validator.
5. Mark Plan 007 completed only when remote shadow and human review both pass.

The remote runner uses at most five synthetic non-assessment cases. Its hard cap is 40 provider calls, with a current upper bound of seven provider calls per case. It may write only privacy-safe staging comparison traces. It must not send real learner conversations, active-assessment answers, secrets, or raw identity data.

## Safe continuation procedure

1. Pull this branch without rebasing over unreviewed local work.
2. Verify `.env*` is absent from `git status`, then confirm the required variable names exist without printing values.
3. Keep the public primary path on its canonical always-on implementation; shadow remains opt-in for the exact staging identity.
4. Run the zero-provider diagnostic first:

   ```powershell
   bun --env-file=.env.staging scripts/staging/smoke-zyra-pedagogy.ts --run-id <new-run-id> --course tutorial-pka --max-provider-requests 40 --startup-diagnostics-only
   ```

5. Inspect only masked artifact fields. Continue only if all 11 stages pass and provider calls, database writes, trace writes, and learner side effects are all zero.
6. Obtain explicit approval for the controlled provider run, then run exactly once:

   ```powershell
   bun --env-file=.env.staging scripts/staging/smoke-zyra-pedagogy.ts --run-id <new-run-id> --course tutorial-pka --max-provider-requests 40 --remote-shadow
   ```

7. If it fails, stop without a full retry. Preserve the masked artifact and diagnose the specific stage.
8. If it passes, open `plan-007-pedagogy-human-review.html` locally. A maintainer, not the implementation model, must score every case and download the review JSON.
9. Validate the review:

   ```powershell
   bun scripts/staging/validate-zyra-pedagogy-review.ts --run-id <new-run-id> --submission-file <private-review-json-path>
   ```

10. Rerun focused tests, lint, root typecheck, and `git diff --check`. Update the masked evidence summary and Plan 007 status. Do not start Plan 008 before Plan 007 is completed.

## Git and safety notes

- This branch tracks `origin/codex/zyra-ai-system-plan`.
- `.env*`, staging artifacts, generated Wrangler temporary files, and credentials must remain outside the commit.
- Review the full diff and secret scan results before pushing.
- Push only after the repository owner explicitly confirms the local commit or commits.
- Never push or merge directly to `staging`, `main`, or `master` from this handoff.
