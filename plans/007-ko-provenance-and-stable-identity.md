# Plan 007: Knowledge Object Provenance and Stable Identity

Snapshot: `6098211`

Branch: `codex/007-ko-provenance-identity`

Commit: `feat(knowledge): add provenance and stable ko identity`

Priority: P0

Depends on: Plans 001 and 003

Effort: L

Risk: High

Confidence: High

## Objective

Introduce a source-grounded KO schema and stop replacing stable KO identities on every extraction. Separate knowledge kind, instructional role, and learning-objective cognition so downstream references remain meaningful.

## Current state and evidence

- `db/schema.ts` stores KO `type`, `difficulty`, `bloomLevel`, and free-form metadata but no normalized source spans.
- `lib/ko-extractor.ts:746` truncates preprocessed Markdown to 30,000 characters.
- `lib/ko-extractor.ts:1114-1125` deletes all KOs for a chapter and inserts new rows.
- Downstream tables reference KO IDs, so delete and reinsert can sever provenance and make analytics or generated assets stale even when semantic content is unchanged.
- The candidate `type` mixes domain content kinds with teaching roles. Bloom is assigned to isolated knowledge chunks rather than learning objectives.

## Scope

Create or update:

- `db/schema.ts`
- generated Drizzle migration files
- `lib/knowledge/contracts.ts`
- `lib/knowledge/identity.ts`
- `lib/ko-extractor.ts` persistence section only
- readers of KO `type` and `bloomLevel` identified by repository-wide search
- `lib/env.ts` for `FEATURE_KO_PIPELINE_V2`
- `tests/contracts/ko-pipeline.test.ts`
- `docs/ARCHITECTURE.md`
- `docs/DB_SCHEMA.md`
- `docs/DEVELOPMENT.md`
- `docs/operations/production-readiness-checklist.md`
- `AGENTS.md` Current State section

Do not redesign extraction prompts or canonicalization decisions here. Plan 008 owns those.

## Target data model

Add explicit structures equivalent to:

- KO `knowledgeKind`: definition, principle, formula, procedure, example, constraint, misconception, or other reviewed enum
- KO `instructionalRole`: core, prerequisite, enrichment, assessment_support, or reference
- `knowledge_object_sources`: KO ID, source document/version, chapter, start offset, end offset, source hash, excerpt hash, extraction run ID, and support role
- `learning_objectives`: objective text, Bloom level, evidence/source IDs, and KO relationships
- extraction run state: staged, accepted, needs_review, failed, superseded

Keep legacy columns during a compatibility window. New code must not populate a misleading Bloom value on a KO merely to satisfy a non-null field.

## Implementation steps

1. Search all reads and writes of `knowledgeObjects.type`, `knowledgeObjects.bloomLevel`, and KO IDs. Add the inventory to the PR description before editing schema.
2. Define enums and Zod contracts in `lib/knowledge/contracts.ts`. Unknown values must map to `other` plus a review reason, not an invented specific class.
3. Add normalized provenance and learning-objective structures in `db/schema.ts`. Add indexes for KO, source document/version, chapter, and extraction run.
4. Add a deterministic stable identity key based on source document identity, chapter identity, normalized concept identity, and a stable local key. Do not use generated title wording alone.
5. Implement an upsert/diff algorithm:
   - unchanged stable key and semantic hash: retain ID and timestamps that indicate original creation;
   - same stable key with changed content: update row, increment version, preserve ID;
   - missing in new accepted extraction: mark superseded or inactive after reconciliation;
   - new accepted key: insert a new ID;
   - ambiguous match: do not mutate existing rows and mark the run needs-review.
6. Replace unconditional chapter deletion with the upsert/diff transaction behind `FEATURE_KO_PIPELINE_V2`.
7. Backfill existing rows conservatively. Preserve current IDs. If provenance offsets cannot be reconstructed, mark provenance as legacy-unresolved rather than fabricating positions.
8. Migrate readers to prefer `knowledgeKind`, `instructionalRole`, and linked learning objectives. Keep compatibility mapping only at one adapter boundary.
9. Ensure downstream staleness is driven by semantic changes and explicit supersession, not by ID churn.
10. Add transaction rollback tests for invalid provenance, duplicate stable keys, ambiguous matches, and failure after partial writes.
11. Run and inspect the migration. Update schema and architecture docs with compatibility and rollback behavior.

## Test plan

```powershell
bun run db:generate
bun run db:migrate
bun test tests/contracts/ko-pipeline.test.ts
bun run lint
bun run typecheck
```

Required assertions: unchanged extraction retains every KO ID; changed content retains identity but changes semantic version; removed content becomes superseded; ambiguous mapping writes no accepted rows; transaction failure leaves prior active set untouched.

## Done criteria

- No v2 path deletes all chapter KOs before replacement.
- Every accepted v2 KO has at least one valid source span or an explicit reviewed legacy exception.
- Knowledge kind and instructional role are distinct.
- Bloom belongs to a learning objective contract, not inferred blindly for each KO.
- Existing IDs survive migration.
- Migration, tests, lint, and typecheck pass.

## STOP conditions

- Stop if a migration would regenerate or rewrite existing KO primary keys.
- Stop if source offsets cannot be defined against a versioned canonical source.
- Stop if an ambiguous identity match would update an accepted KO automatically.
- Stop if generated SQL includes unrelated schema changes.
