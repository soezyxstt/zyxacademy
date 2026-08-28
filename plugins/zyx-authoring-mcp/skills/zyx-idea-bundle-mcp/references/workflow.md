# Idea Bundle MCP reference

## Canonical ZIP

Use exactly the repository Idea Bundle V2 contract:

```text
manifest.json
sources/*.md
entities/source-materials.json
entities/source-chunks.json
entities/ideas.json
entities/provenance.json
entities/relations.json
```

The manifest and every entity file use deterministic SHA-256 checksums. Stable IDs are opaque. Do not derive IDs from labels, slugs, filenames, or chapter titles.

## Quality gates

MCP checks schema, canonical checksum, source checksums, exact chunk offsets, course and chapter scope, published-ready status, source-grounded provenance, stable keys, relation endpoints, duplicate relations, and prerequisite cycles. The content gate also checks meaningful source chunk coverage, Idea provenance coverage, duplicate or near-duplicate canonical statements, and formula trace warnings.

`quality.valid` must be true before submission. A warning remains visible to the admin and must be reviewed, even if it is not blocking.

## MCP tool sequence

1. Use `$zyx-source-pack-mcp` to receive a validated `sourcePackToken`. For a course and chapter prompt without attachments, prefer stored PDFs and retain the same opaque course and chapter choices used by `storedOriginals`.
2. Start `idea_product` with that `sourcePackToken` and the same opaque course and chapter choices.
3. Build the Idea Bundle from the locked Source Pack and run contract.
4. Call `authoring.validate_idea_bundle` repeatedly during revision (`authoring:read`).
5. Call `authoring.submit_idea_bundle` only after validation is green (`authoring:stage`).
6. For existing staged imports:
   - Call `authoring.list_imports { bundleType: "idea" }` to inspect staged inventory (`authoring:read`).
   - Call `authoring.get_import { bundleType: "idea", importId }` to inspect validation reports and review history without exposing storage keys or reviewer IDs (`authoring:read`).
   - Call `authoring.restage_idea_bundle` to revalidate and replace an unreviewed or rejected import, resetting previous reviews via lifecycle services (`authoring:stage`).
   - Call `authoring.review_idea_bundle` to record an immutable review decision with notes (`authoring:review`).
7. Stop condition: Wait for admin review and publication via Zyx admin UI before Product authoring. MCP does not provide a publication tool and Idea withdrawal is not implemented.
