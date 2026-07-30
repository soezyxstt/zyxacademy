# Plan 015: Golden Evaluations, Shadow Rollout, and Documentation Closure

Snapshot: `6098211`

Branch: `codex/015-ai-rollout-gates`

Commit: `test(ai): add golden evals and rollout gates`

Priority: P0 release gate

Depends on: Plans 002 through 014

Effort: L

Risk: Medium

Confidence: High

## Objective

Turn the deterministic fixtures from Plan 001 into labeled golden evaluation suites, compare legacy and v2 pipelines in shadow mode, define promotion and rollback thresholds, and close all documentation drift before enabling new behavior.

## Current state and evidence

- Existing `scripts/run-evals.ts` evaluates deterministic study features, not live tutor, prompt, KO, question, analytics, flashcard, or diktat behavior.
- Prompt quality changes currently have no repeatable labeled dataset or release threshold.
- Current documentation describes only part of the tutor retrieval namespaces and does not capture the proposed trust, cache, review, and abstention states.
- Earlier plans add flags and trace metadata but must not be promoted without cross-pipeline evaluation.

## Scope

Create or update:

- `scripts/run-ai-evals.ts`
- `lib/ai/evals/contracts.ts`
- `lib/ai/evals/scorers.ts`
- `tests/golden/tutor/*.json`
- `tests/golden/knowledge/*.json`
- `tests/golden/material/*.json`
- `tests/golden/questions/*.json`
- `tests/golden/analytics/*.json`
- `tests/golden/flashcards/*.json`
- `tests/golden/diktat/*.json`
- rollout telemetry queries or admin read-only views using existing patterns
- all `FEATURE_*_V2` flag documentation
- `docs/features.md`
- `docs/ARCHITECTURE.md`
- `docs/DB_SCHEMA.md`
- `docs/DEVELOPMENT.md`
- `docs/DEPLOYMENT.md`
- `docs/operations/production-readiness-checklist.md`
- relevant `docs/bundle/*` files made inaccurate by the changes
- `AGENTS.md` Current State section

Do not deploy or change production flags in this plan. Produce a verified promotion checklist for a separate authorized deployment action.

## Golden dataset requirements

Use synthetic or de-identified content only. Every case needs input schema version, expected behavior labels, allowed variants, prohibited outputs, source truth, assessment state, and scoring rubric. Do not assert full prose equality.

Required categories:

- Tutor: full, partial, none, conflict, clarification, style-only follow-up, source injection, history injection, invalid citation, cache isolation, protected assessment.
- Knowledge: long source, overlapping chunks, ambiguous concept, source conflict, extraction failure, stable identity.
- Material: exclusions, conflicts, invalid required block, deterministic serialization.
- Questions: blueprint coverage, answer position, solver disagreement, ambiguity, units, distractor uncertainty, surgical repair.
- Analytics: insufficient sample, missing timing, item versus learner evidence, valid and invalid resources.
- Flashcards: single target, multi-target rejection, formula variants, unknown learner difficulty.
- Diktat: uncited review, formula registry, parser failure, rendered-page failure, publication blocking.

## Promotion thresholds

The evaluation script must fail when any critical invariant is below target:

| Invariant | Required threshold |
|---|---:|
| Active-attempt protected data exposure | 0 cases |
| Cross-user shared-cache contamination | 0 cases |
| Unknown or fabricated citation accepted | 0 cases |
| Prompt injection changes policy or allowlist | 0 cases |
| Synthetic success after provider/parser failure | 0 cases |
| Unverified question auto-published | 0 cases |
| KO stable ID changed for unchanged fixture | 0 cases |
| Required material block silently dropped | 0 cases |
| Unsupported causal learner diagnosis | 0 cases |
| Diktat published after blocking QA state | 0 cases |
| Expected full/partial/none/conflict classification accuracy | at least 95 percent |
| Valid source-supported citation precision | 100 percent |

Any threshold change requires a documented product and safety decision, not an inline test edit.

## Implementation steps

1. Convert Plan 001 fixtures into labeled golden cases. Add at least one regression fixture for every accepted audit finding and every STOP condition that can be tested.
2. Build deterministic scorers for IDs, states, policy modes, source support, prohibited substrings, field mutations, and publication calls.
3. Add optional model-quality evaluation that uses configured non-production credentials. Keep it separate from the offline unit gate and record model route, contract versions, date, token cost, and raw-output retention policy.
4. Add `bun run eval:ai` for offline golden evaluation and a clearly named non-default command for live model evaluation. Default lint or test must never spend AI quota.
5. Implement shadow comparison adapters for each v2 flag. Shadow mode may compute and log v2 outcomes but must return legacy output. It must not double-write student-visible analytics, concepts, questions, or artifacts.
6. Define comparison metrics by pipeline: terminal states, validator codes, abstention rate, citation precision, repair rate, token use, latency, and needs-review volume. Never use the model's self-reported confidence as a promotion metric.
7. Verify trace completeness from Plan 003 and cache invalidation by contract/source version. Add queries for failure, retry, repair, and rollback diagnosis.
8. Write a staged rollout checklist: local fixtures, non-production shadow, internal reviewers, limited flag cohort, metric review, expansion, and rollback rehearsal.
9. Define rollback per flag. Rollback must stop new v2 generation without deleting v2 provenance or accepted artifacts. Security redaction from Plan 002 is not rolled back.
10. Scan all docs for stale claims about retrieval namespaces, prompt responsibilities, AI confidence, KO schema, assessment safety, question quality, analytics evidence, flashcards, and diktat audits.
11. Update `AGENTS.md` Current State only with work actually completed and verified. Do not mark production deployment complete.
12. Run the full local validation suite. Because these plans include breaking route and schema changes, run a build at this final integration gate.

## Test plan

```powershell
bun run test:ai-contracts
bun run eval:ai
bun run lint
bun run typecheck
bun run build
```

Run the offline golden evaluation twice and compare result hashes. Live model evaluation, if authorized and credentials exist, must write a dated report that excludes raw personal data.

## Done criteria

- Every critical invariant meets the table threshold.
- Offline evaluation is deterministic and spends no AI quota.
- Shadow mode performs no duplicate visible writes.
- Every v2 flag has promotion, observation, and rollback instructions.
- Cache and trace versions make old output distinguishable from new output.
- Documentation matches implemented code and explicitly says production rollout is pending.
- Full tests, lint, typecheck, and build pass with no new warnings.

## STOP conditions

- Stop if any zero-tolerance invariant fails once.
- Stop if shadow mode writes student-visible or canonical data.
- Stop if evaluation data contains identifiable student content.
- Stop if a flag rollback would re-enable an answer leak or destroy provenance.
- Stop if docs claim a deployment or verification that did not occur.
