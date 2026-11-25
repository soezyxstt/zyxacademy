# Zyx Source Pack MCP: Workflow and Contract Playbook

## 1. Stage objective and reuse

Create a faithful `zyx-source-pack.v1` archive, verify it against every original binary, and persist it through `source.ingest` for later authoring. A valid Source Pack is reusable source evidence, not a learner publication.

1. Call `workflow.get_playbook` with `skill: "zyx-source-pack-mcp"`, `stage: "source"`, current client metadata and truthful capabilities. Read the required modules and keep the returned `bootstrapToken` in private execution state. This stage does not need an authoring run.
2. Discover `courseKey` and `chapterKey` through `catalog.list_courses` and `catalog.list_chapters`. Check `source.list_packs` before transcribing again. Inspect a candidate with `source.get_pack`, including its documents and exact `importId` or checksum. Reuse only the source revision that covers the requested materials.
3. For stored PDFs, call `source.list_files` in that scope. Categories are `materi`, `soal`, and `pembahasan_soal`. Keep each physical document separate. Use chapter-scoped document IDs, such as `source-doc-ma1101-ch01-001`, to avoid collisions across chapters.

## 2. Read and reconcile the source

- Read every page with `source.read_file`, `mode: "pages"`, using at most four distinct positive page numbers per request. Keep completed results. Use the returned page total to check the full sequence.
- Text is the default representation. Request `image` or `both` for formulas, tables, visuals, scans, reading order, or uncertain extraction. `imageWidth` accepts 320 through 2048 pixels. Inspect the images and citations; extracted text alone does not prove visual completeness. A candidate printed page with `printedPageVerified: false` needs visual verification. Resolve `textQuality.status: "needs_visual_review"` before trusting the transcription.
- If pending, call `source.get_read_job` with the same `fileKey` and `jobId` after `pollAfterMs`. Use `retryFailed: true` only for failed pages. `workflow.list.sourceReader` advertises reader support. If the host catalog lacks the polling tool, repeat the same `source.read_file` arguments as the advertised fallback.
- Prefer `storedOriginals` during ingest when the binary already exists on the server. Download locally only when the task needs the file. `mode: "download"` returns a temporary URL and checksum status; `blob` is a compatibility alias. For a pending checksum, poll `checksumJobId` with the same file key, then refresh the descriptor. Never invent a checksum when unavailable.
- With a repository checkout, `bun scripts/download-source-pdf.ts descriptor.json output.pdf` supports resumable downloads. Keep the descriptor private; retain partial bytes and ETag, and refresh an expired descriptor for the same source. Verify the complete binary hash.
- Follow `source/reconciliation` to transcribe all units, inventories, visuals, questions and solutions. Preserve source language and content. Do not guess missing symbols, silently correct errors, or omit repeated content from the source.

Page extraction and job polling require `authoring:stage` as well as read access. An insufficient-scope response requires the advertised authorization step, not another source path that bypasses the check.

## 3. Archive contract

The strict schema in `lib/authoring/source-pack.ts` and quality checks in `lib/authoring/quality/source-pack.ts` define this format. The current source stage has no public schema descriptor; use this active module and the live tool schema. Do not borrow Idea or Product manifest fields.

The ZIP contains only `manifest.json` and each declared `markdownPath` and `coveragePath`. Document paths begin with `documents/` and end in `.md`; coverage paths begin with `coverage/` and end in `.json`. Paths are relative, unique, and contain neither traversal nor backslashes. Original binaries travel alongside the ZIP through ingest, not inside it. The server calculates the archive checksum; `archiveChecksum` is not a manifest field.

Document `role` is `material`, `question`, `solution`, `mixed`, or `reference`. `unitKind` is `page`, `slide`, `sheet`, or `section`. `expectedUnits` is a positive integer. Use the real language, generation metadata and timestamp, original filename/media type, and lowercase SHA-256 hashes of the exact original and Markdown bytes. Do not reuse the example's metadata for a real source.

### Minimal complete archive example

This small text source shows the complete file shapes. Both text blocks use UTF-8, LF line endings, and one final newline. Its raw original `source.txt` is:

```text
Contoh sumber
Teks asli.
```

`documents/source-doc-example-ch01-001.md`:

```markdown
<!-- source-unit: 1 -->
# Contoh sumber
Teks asli.
```

`manifest.json`:

```json
{
  "schemaVersion": "zyx-source-pack.v1",
  "packId": "sp-example-ch01",
  "name": "Contoh sumber",
  "language": "id",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "generator": {
    "provider": "openai",
    "model": "example",
    "promptVersion": "source-pack-example-v1"
  },
  "documents": [{
    "id": "source-doc-example-ch01-001",
    "title": "Contoh sumber",
    "originalFilename": "source.txt",
    "originalMediaType": "text/plain",
    "originalSha256": "84a6be0262a1b11ef5226fb2a9f7bcf6709329a17c57436caf9c5080cc1fc91c",
    "role": "material",
    "unitKind": "section",
    "expectedUnits": 1,
    "markdownPath": "documents/source-doc-example-ch01-001.md",
    "coveragePath": "coverage/source-doc-example-ch01-001.json",
    "markdownSha256": "c494ece18c79a75bb82beee275700eb439743efc72fdbfc081d4fbc4a3632e12"
  }]
}
```

`coverage/source-doc-example-ch01-001.json`:

```json
{
  "documentId": "source-doc-example-ch01-001",
  "status": "complete",
  "expectedUnits": 1,
  "processedUnits": [1],
  "inventory": {
    "headings": 1, "formulas": 0, "tables": 0, "examples": 0,
    "applications": 0, "visuals": 0, "questions": 0, "solutions": 0
  },
  "outputCounts": {
    "headings": 1, "formulas": 0, "tables": 0, "examples": 0,
    "applications": 0, "visualExplanations": 0, "questions": 0, "solutions": 0
  },
  "unresolved": [],
  "reviewPasses": ["inventory", "transcription", "visual", "reconciliation"]
}
```

Every document needs its own coverage file. `processedUnits` and Markdown `<!-- source-unit: N -->` markers must each equal the ordered sequence from 1 through `expectedUnits`, without gaps or duplicates. Inventory and output counts must agree; `visuals` maps to `visualExplanations`. All four review passes must actually be completed and `unresolved` must be empty. The validator checks output counts against the Markdown, not only against the ledger.

## 4. Ingest and completion

Build a deterministic ZIP after all reconciliation passes. The archive limit is 64 MiB, with at most 1024 entries, 32 MiB per uncompressed file, and 128 MiB total uncompressed data. Direct original files allow 32 MiB each; stored PDFs allow 50 MiB each; combined originals allow 96 MiB. Follow lower live tool or transport limits if present. Never discard source content to meet a limit.

Call `source.ingest` with `filename`, ZIP `contentBase64`, `bootstrapToken`, and an original for every declared document. Use `storedOriginals: [{documentId, fileKey}]` for stored PDFs or `originals: [{documentId, contentBase64}]` for local binaries. These are arrays, not objects keyed by document ID. Do not supply the same document twice. All stored originals must share the selected course and chapter.

Resolve every structural or quality failure, recompute affected hashes from actual bytes, and ingest again. An unreadable source remains unfinished; do not mark it complete to pass validation. On success, require `ok: true`, valid quality, and `persisted.importId`; retain the exact pack identity and checksum for the next stage. If a response is lost, inspect stored packs before retrying the same archive. Keep opaque keys, tokens and signed URLs out of source files and user reports.
