# Source Pack MCP reference

## Canonical ZIP

The only permitted entries are:

```text
manifest.json
documents/*.md
coverage/*.json
```

Use LF UTF-8 and stable relative paths. Keep every entry regular and mode `0644`. Never include source binaries in the ZIP; send them through the MCP `originals` field for ephemeral checksum verification.

## Coverage rules

`processedUnits` must equal every integer from `1` to `expectedUnits` exactly once. `outputCounts` are calculated from final Markdown, not copied from inventory. Count headings, formulas, GFM or HTML tables, audit markers, and closed visual explanation blocks. The four review passes are `inventory`, `transcription`, `visual`, and `reconciliation`.

## Visual rule

Every instructional visual uses one closed `:::visual-explanation` block. Required fields are `id`, `source-unit`, `kind`, `title`, `purpose`, `elements`, `instructional-meaning`, and `uncertainty`. Structured visual kinds additionally require non-empty `relationships`, `labels`, and `reading-order`. A visual with uncertain text cannot declare `uncertainty: none`.

## MCP sequence

1. Build and checksum the ZIP.
2. Call `source.ingest` with `{ filename, contentBase64, originals: [{ documentId, contentBase64 }] }`.
3. Stop on any blocking `quality.issues`.
4. Use the returned `sourcePackToken` only when `valid: true`.
5. Call `catalog.list_courses`, `catalog.list_chapters`, and `workflow.start`.
