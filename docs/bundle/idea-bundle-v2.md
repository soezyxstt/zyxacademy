# Idea Bundle V2 Contract

Plan 003 establishes the canonical source and Idea domain without enabling a caller switch. This document is the bundle boundary for later authoring and import plans.

## Required entities

- `sumber_materi`: versioned source metadata, source type, canonical URI or R2 key, creator, status, and checksum.
- `potongan_sumber`: exact source content spans with source version, offsets, locator, checksum, and embedding eligibility.
- `ide`: course and chapter learning atom with optional global `concepts` identity, stable key, semantic hash, generation hash, source policy, and curator.
- `asal_ide`: one or more Idea provenance spans. A published source-grounded Idea requires at least one span. A published tutor-authored Idea requires an accountable curator.
- `relasi_ide`: typed Idea edges. Self-relations are invalid and active prerequisite edges must be acyclic.
- `ketergantungan_produk`: upstream and downstream entity identity, version, hash, freshness, and transition reason.
- `peta_id_legacy`: one-to-one legacy and target identity mappings with checksums and migration run identity.

## Import boundary

All bundle objects are validated with strict Zod contracts. Unknown fields, invalid statuses, non-positive versions, invalid offsets, duplicate stable keys, duplicate mappings, self-relations, and active prerequisite cycles are rejected before persistence.

Stable identity and hash helpers are deterministic across runs. Source checksums use normalized source text; Idea semantic hashes exclude timestamps and provider-specific vector IDs. Provenance includes exact JavaScript string offsets and the source checksum it cites.

## Rollout boundary

`FEATURE_ARSITEKTUR_IDE_V1` is absent or `0`. Plan 003 does not backfill existing KOs, write Vectorize or Pinecone IDs, change extraction callers, publish UI, or rewrite legacy tables. Later plans must preserve the additive migration and reconcile the dependency freshness state before enabling callers.
