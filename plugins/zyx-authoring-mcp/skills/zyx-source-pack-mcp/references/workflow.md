# Source Pack MCP reference

## Canonical ZIP

The only permitted entries are:

```text
manifest.json
documents/*.md
coverage/*.json
```

Use LF UTF-8 and stable relative paths. Keep every entry regular and mode `0644`. Never include source binaries in the ZIP; verify them through MCP `originals` for local files or `storedOriginals` for encrypted Zyx file references.

## Coverage rules

`processedUnits` must equal every integer from `1` to `expectedUnits` exactly once. `outputCounts` are calculated from final Markdown, not copied from inventory. Count headings, formulas, GFM or HTML tables, audit markers, and closed visual explanation blocks. The four review passes are `inventory`, `transcription`, `visual`, and `reconciliation`.

## Visual rule

Every instructional visual uses one closed `:::visual-explanation` block. Required fields are `id`, `source-unit`, `kind`, `title`, `purpose`, `elements`, `instructional-meaning`, and `uncertainty`. Structured visual kinds additionally require non-empty `relationships`, `labels`, and `reading-order`. A visual with uncertain text cannot declare `uncertainty: none`.

## MCP sequence untuk file tersimpan

1. Call `catalog.list_courses` and `catalog.list_chapters` from the course and chapter named in the prompt.
2. Call `source.list_files` with the opaque course and chapter keys. All PDF categories are returned by default; paginate until the relevant inventory is complete.
3. Read selected files with `source.read_file` in `pages` mode, no more than four pages per call. Use the extracted text and every returned page image. After one page-read failure or client timeout, retry that file in `blob` mode when it is within the blob limit.
4. Build and checksum the ZIP.
5. Call `source.ingest` with `{ filename, contentBase64, storedOriginals: [{ documentId, fileKey }] }`.
6. Stop on any blocking `quality.issues`.
7. Use the returned `sourcePackToken` only when `valid: true`, then call `workflow.start` with the same course and chapter.

If `fileKey` is expired, stale, moved, or no longer associated with the chapter, call `source.list_files` again and reselect the current reference. Never reconstruct or persist a `fileKey`, database ID, R2 key, or URL.

## Compatibility sequence untuk file lokal

For local files, keep each binary available and call `source.ingest` with `{ filename, contentBase64, originals: [{ documentId, contentBase64 }] }`. Local and stored originals may be mixed only when every `documentId` is unique. The local-file path remains unbound until `workflow.start`; stored originals bind the Source Pack token to their catalog course and chapter.
