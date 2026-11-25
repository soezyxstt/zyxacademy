# Zyx Source Pack MCP: Transcription and Reconciliation Guide

## 1. Preserve the source

Keep the source language, wording, notation, conditions, equation numbers, derivations, examples, exercises and solutions. Normalize layout into Markdown and LaTeX without changing meaning. Do not translate, summarize, correct an apparent error, add a missing answer, or replace intermediate work with an invented shortcut.

Account for every page, slide, sheet or section with exactly `<!-- source-unit: N -->` in order. A page heading alone is not a unit marker. Transcribe title pages and contents pages too; a blank unit still keeps its marker. Use headings only for headings present in the source. Keep reading order across columns, footnotes and continued tables or questions.

Compare extracted text with the original page image wherever layout, symbols or visuals matter. Resolve ambiguous symbols from the source, not from mathematical expectation. If essential content remains unreadable, report the document and unit and keep the pack unfinished. Never remove an uncertainty merely to set `status: "complete"`.

## 2. Count what is actually present

Inventory each original before reconciling its output. Count headings, formulas, tables, examples, applications, visuals, questions and solutions consistently. Do not derive both sides from the same output and call that source reconciliation.

| Content | Markdown representation checked by the quality validator |
| --- | --- |
| Heading | Markdown `#` through `######` followed by its original text |
| Formula | Balanced `$...$` or `$$...$$`; escape literal currency dollar signs |
| Table | Complete Markdown table with a separator row, or an HTML `table` when needed to preserve merged cells |
| Example | Unique marker such as `<!-- source-example: ex-1 -->`, followed by the full example |
| Application | Unique `<!-- source-application: app-1 -->` marker and full content |
| Question | Unique `<!-- source-question: q-1 -->` marker and full stem, options and parts |
| Solution | Unique `<!-- source-solution: sol-1 -->` marker and all supplied solution steps |
| Visual | One complete `:::visual-explanation` block per counted visual |

Marker IDs use lowercase letters, digits, dots, underscores, colons or hyphens and begin with a letter or digit. Preserve printed numbering in the text; the marker ID does not replace it. Keep markers unique within each document. The Markdown counts must match `outputCounts`, and the source inventory must match those counts. `inventory.visuals` maps to `outputCounts.visualExplanations`.

Tables retain every header, unit and cell. A matrix represented as math counts as math; a LaTeX table alone is not counted as a Markdown/HTML table. Do not alter the inventory to hide a lost table or to satisfy the counter.

## 3. Explain visuals from visible evidence

The archive must not contain Markdown image references or HTML `img` elements. Transcribe each visual into the required block within its source unit. Record labels, axes, units, values, directions, connections and reading order. Do not infer unlabeled values, hidden geometry or a formula that the source does not state.

Example format for a visible diagram containing only nodes A and B with an arrow from A to B:

```markdown
<!-- source-unit: 1 -->
:::visual-explanation
id: diagram-1
source-unit: 1
kind: diagram
title: Urutan A ke B
purpose: Menunjukkan urutan dua simpul.
elements:
  - Simpul A.
  - Simpul B.
relationships:
  - Panah berarah dari A ke B.
labels:
  - A
  - B
reading-order:
  - A
  - B
instructional-meaning: A mendahului B sesuai arah panah.
uncertainty: none
:::
```

Every block needs a unique `id` in the document and nonempty `source-unit`, `kind`, `title`, `purpose`, `elements`, `instructional-meaning`, and `uncertainty`. The declared unit must match the preceding unit marker. Use scalar text or lists with two spaces before `-` as shown. Close the block with `:::`; do not nest blocks.

For `3d-plot`, `chart`, `diagram`, `geometry`, `graph`, `number-line`, and `plot`, also supply nonempty lists for `relationships`, `labels`, and `reading-order`. Use `uncertainty: none` only when the transcription has no unresolved ambiguity. If the source intentionally omits a quantity, state that fact without estimating it. If blur or cropping prevents faithful transcription, resolve it before claiming the pack is complete.

## 4. Reconcile documents and finish

Keep each physical original in its own manifest entry, Markdown file and coverage file. Do not merge PDFs or deduplicate repeated content across originals: hashes, units and evidence are document-specific. Preserve each source's notation. Record conflicts or possible equivalences in private working notes for later review, not as invented source claims.

For a question document (`role: "question"`) and a separate solution document (`role: "solution"`), preserve printed question numbers and subparts so later provenance can point to both. Record only answers and steps that are actually present. A question without a supplied solution remains a question without a supplied solution.

Complete four real passes: `inventory`, `transcription`, `visual`, and `reconciliation`. In the visual pass, verify visual content or confirm its absence. Before ingest, compare originals with final Markdown, check exact unit sequences and all counts, balance math delimiters, and verify original and Markdown byte hashes. No fixed character-density threshold proves completeness. Valid counts and hashes support the audit but cannot replace reading the source.
