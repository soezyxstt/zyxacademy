# Zyx Source Pack MCP: Workflow and Contract Playbook

## 1. Stage Objective

Build a lossless, verbatim-faithful `source-pack.v1` ZIP archive from stored course PDFs or local academic documents (PDF, DOCX, PPTX, spreadsheets, HTML, Markdown), validate it against original binary SHA-256 hashes via `source.ingest`, and persist it to R2 and `impor_bundle` for downstream authoring.

## 2. Step-by-Step Tool Sequence

1. **Bootstrap:** Call `workflow.get_playbook` with `skill: "zyx-source-pack-mcp"`, `stage: "source"`, and client metadata. Save `bootstrapToken`.
2. **Scope Discovery:**
   - Call `catalog.list_courses` to obtain `courseKey`.
   - Call `catalog.list_chapters` with `courseKey` to obtain `chapterKey`.
3. **Check Existing Packs:**
   - Call `source.list_packs` with `courseKey` and `chapterKey`.
   - If a persisted Source Pack already covers the target materials, inspect it with `source.get_pack` (`packId`, optional `documentId`) before deciding whether to reuse or create a new revision.
4. **Read Stored Source Files:**
   - If the host catalog lacks `source.get_read_job`, repeat `source.read_file` with the same arguments to poll. `workflow.list.sourceReader` advertises current reader options. Host catalog refresh is separate from server registration.
   - Citations identify the PDF page explicitly. A `printedPage` with `printedPageVerified: false` is only a candidate; verify it visually. If `textQuality.status` is `needs_visual_review`, inspect the page image before transcribing formulas. Never guess missing symbols from control characters.
   - When a download reports `checksumStatus: pending`, poll `checksumJobId` with the same `fileKey`, then request the download descriptor again to obtain SHA-256 for full-file verification.
   - Call `source.list_files` with `courseKey`, `chapterKey`, and optional `categories` (`["materi", "soal", "pembahasan_soal"]`).
   - Read every page of each selected file using `source.read_file` with `mode: "pages"` (up to 4 unique positive page numbers per call, e.g., `pages: [1, 2, 3, 4]`, then `[5, 6, 7, 8]`, until `pageCount` is reached).
   - Page reads default to `representation: "text"`. If the response is `pending`, save `jobId` and call `source.get_read_job` with `fileKey` and `jobId` after `pollAfterMs` until complete. A failed job reports status per page; use `retryFailed: true` to retry only failed pages. Keep successful pages.
   - Request `representation: "image"` or `"both"` when verifying formulas, tables, charts, scans, or layout. Set `imageWidth` from 320 to 2048 px (default 1280). Text alone is not proof of visual completeness. Inspect each required `imageUrl` and preserve its citation. Page images are full-page renders stored in R2.
   - For the original binary, use `mode: "download"`. Download the temporary URL with HTTP Range and retain the partial file and ETag between attempts. The repository client is `bun scripts/download-source-pdf.ts descriptor.json output.pdf`; save the returned download payload in a local ignored descriptor file. If the URL expires, request a fresh descriptor for the same source and run the client again. `mode: "blob"` is a compatibility alias for download. Clients without binary downloads continue reading pages and polling jobs.
5. **Transcribe and Reconcile:**
   - Transcribe each source document into structured Markdown under `documents/<docId>.md` following the lossless transcription and reconciliation rules in `source/reconciliation`.
   - Never translate source text, never summarize away derivations or examples, and never omit exercises or solutions present in the source.
6. **Assemble and Ingest `source-pack.v1`:**
   - Package `manifest.json` and `documents/<docId>.md` into a deterministic ZIP archive.
   - Call `source.ingest` with `filename`, `contentBase64`, `storedOriginals` (mapping each `documentId` to its `fileKey` from `source.list_files`) or `originals` (mapping each `documentId` to `contentBase64` of the raw original file), and `bootstrapToken`.
   - If `source.ingest` returns `ok: false` or `valid: false`, fix every reported quality or schema issue, recompute all hashes, and re-run `source.ingest`.

## 3. `source-pack.v1` Archive Contract

The ZIP archive must contain only `manifest.json` and the declared `documents/<docId>.md` files. Do not place raw PDF binaries inside the Source Pack ZIP; originals are passed alongside the ZIP in `source.ingest` so the server can independently verify `originalSha256`.

### 3.1 Scoped Document IDs (Collision Prevention)

`sumber_materi.id` is globally unique across chapters. Always include the chapter code or slug in each `documentId` (for example, `source-doc-ma1101-bab01-001`) so ingesting a Source Pack never collides with document IDs from another chapter (`SOURCE_PACK_DOCUMENT_ID_COLLISION`).

### 3.2 `manifest.json` Schema

```json
{
  "schemaVersion": "source-pack.v1",
  "packId": "sp-ma1101-bab01-limit",
  "name": "MA1101 Bab 1 Limit dan Kekontinuan",
  "createdAt": "2026-09-01T00:00:00.000Z",
  "archiveChecksum": "<64-hex-sha256-of-manifest-without-archiveChecksum-and-documents>",
  "documents": [
    {
      "id": "source-doc-ma1101-bab01-001",
      "title": "Slide Kuliah Bab 1 Limit",
      "path": "documents/source-doc-ma1101-bab01-001.md",
      "role": "lecture_notes",
      "unitKind": "slide",
      "expectedUnits": 24,
      "originalFilename": "bab1-limit.pdf",
      "originalSha256": "<64-hex-sha256-of-raw-original-binary>",
      "markdownSha256": "<64-hex-sha256-of-utf8-markdown-file-bytes>"
    }
  ]
}
```

### 3.3 Allowed Enums and Limits

- `role`: `"lecture_notes" | "textbook" | "problem_set" | "solution_manual" | "syllabus" | "reference" | "other"`
- `unitKind`: `"page" | "slide" | "section" | "problem" | "sheet" | "document"`
- `expectedUnits`: Positive integer matching the total pages/slides/units of the source document.
- Size limits:
  - Source Pack ZIP: max 64 MiB (`AUTHORING_MCP_MAX_SOURCE_PACK_BYTES`).
  - Stored original PDF: max 50 MiB per file.
  - Total originals (`originals` + `storedOriginals`): max 96 MiB (`AUTHORING_MCP_MAX_ORIGINAL_BYTES`).

### 3.4 Required Markdown Markers for Unit and Section Tracking

Inside each `documents/<docId>.md`:
- Mark every page or slide boundary with an HTML comment or heading marker recognized by the validator, such as `<!-- page 1 -->` / `<!-- slide 1 -->` or `## Page 1` / `## Slide 1`, from `1` through `expectedUnits`.
- Use standard Markdown headings (`#`, `##`, `###`) for logical sections so `sectionCount` is positive and structural hierarchy is preserved.
- Preserve mathematical notation in LaTeX (`$...$` for inline math, `$$...$$` for display math).
- When a page contains a diagram, plot, or table, transcribe all labels, axes, data rows, and functional relationships in structured Markdown/LaTeX alongside the text.
