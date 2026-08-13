# Authoring Context Pack V1

Plan 007 defines a deterministic, redacted export for external authoring. The boundary is enabled by `FEATURE_AUTHORING_CONTEXT_V1=1` and is admin-only by default.

## Included content

The pack contains a versioned manifest, course and chapter metadata, published current Ideas, active source metadata, exact source excerpts, Idea provenance and relations, active learning objectives, safe content requirements, allowed benchmark summaries, and the authoring contract. An allowed benchmark projection includes its benchmark ID, dedicated ITB `referenceId`, exact `sourceLabel`, dataset key, version, checksum, and safe summary. The benchmark ID must never be used as the question source reference. The projection uses explicit fields and never serializes database rows directly.

Ideas must be published, current, and reviewed. Draft, stale, superseded, withdrawn, needs-review, or unreviewed Ideas are excluded. Source excerpts must belong to an active source version in the selected course.

## Excluded content

Holdout benchmark stems, options, answers, solutions, embeddings, and identifying paraphrases are excluded. The manifest records only the number of holdout records excluded. Murid profiles, emails, enrollments, attempts, answers, mastery, chats, credentials, provider secrets, signed URLs, internal URLs, and user identity fields are excluded.

The content scanner fails closed on forbidden fields, secret canaries, signed URLs, internal URLs, and protected fixture values. New fields stay excluded until the allowlist and adversarial tests are updated.

## Determinism and artifact lifecycle

The same snapshot ID, request policy, input content, creation timestamp, and retention timestamp produce identical entity checksums, pack checksum, and ZIP bytes. Files are sorted and JSON keys are serialized deterministically.

Private artifacts use the exact staging key `overhaul/<runId>/authoring-context/<packId>.zip`. The key is recorded in `audit_mutasi` with actor, policy version, source entity versions, holdout exclusion count, artifact checksum, correlation ID, and retention timestamp. The artifact is never exposed through a public URL. Rollback disables `FEATURE_AUTHORING_CONTEXT_V1` and removes only explicitly named test objects by exact key.

## Commands

```bash
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:test-authoring-context -- --run-id <runId> --course tutorial-pka
bun --env-file=.env.staging run staging:scan-context-pack -- --run-id <runId>
```
