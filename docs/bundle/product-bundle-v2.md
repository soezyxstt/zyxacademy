# Product Bundle V2

## Scope

Plan 004 provides the normalized storage boundary for product, assessment, evidence, mastery, bundle, and mutation-audit records. The import and publication workflow itself is a later plan; no current runtime caller switches to these tables yet.

## Bundle contents

An import is identified by `bundleId` plus a content `checksum` and records its source, version, requester, and lifecycle status in `impor_bundle`. `item_impor_bundle` inventories each entity, entity version, and entity hash. Supported entity families include articles, diktat materials, questions, solutions, and flashcards.

## Review and publication

`review_bundle` records reviewer decisions. `publikasi_bundle` references the import and the approved review, stores a publication hash and version, and is the atomic publication boundary. A publication must not expose only a subset of approved entities. `audit_mutasi` records the actor, entity, action, snapshots, correlation ID, and timestamp for each mutation.

## Dependency and freshness

Product records carry generation metadata. Cross-entity freshness is tracked through `ketergantungan_produk`, which stores upstream and downstream IDs, versions, hashes, freshness state, and a reason. A changed upstream hash moves dependent work to review before publication.

## Compatibility boundary

The current English tables remain queryable and are not rewritten by Plan 004. Future mapping is explicit:

* `website_materials` and `diktats` map to `artikel` and `diktat_materi`.
* `ai_question_bank`, `assessment_objects`, and `quiz_templates` map to `soal`, `blueprint_asesmen`, and `asesmen`.
* `student_quiz_attempts` maps to `percobaan_asesmen` and `jawaban_murid`.
* `learning_events` and `student_concept_mastery` map to `bukti_pembelajaran` and `pemahaman_ide`.
* `flashcard_sets`, `flashcards`, `student_flashcard_progress`, and `flashcard_reviews` map to the normalized flashcard tables.

These mappings are documentation only until Plan 005 completes deterministic backfill and reconciliation. `FEATURE_PRODUK_IDE_V1`, `FEATURE_ASESMEN_IDE_V1`, and `FEATURE_PEMAHAMAN_IDE_V1` remain absent or `0` in staging.
