# Zyx Source Pack MCP: Lossless Transcription and Multi-Source Reconciliation Guide

## 1. Core Fidelity Principle

A Source Pack is a canonical, lossless transcription of the original academic source documents. It is NOT a summary, study guide, or translation.

1. **Preserve Original Language:** Keep the exact language of each source document (whether Indonesian, English, or mixed). Translation and pedagogical adaptation happen later in Idea Bundle and Product Bundle stages.
2. **Zero Omission of Units:** Every page (`1..expectedUnits`) or slide must be accounted for. If a page is a title page, table of contents, or intentionally blank, include its unit marker (`<!-- page N -->`) and a brief literal transcription of its visible text so unit coverage reaches 100%.
3. **Complete Mathematical and Symbolic Fidelity:**
   - Transcribe every definition, theorem, lemma, corollary, proof step, and condition verbatim in clean LaTeX.
   - Never replace intermediate algebraic steps with phrases like "dengan cara yang sama" or "trivial" unless the original source itself wrote those exact words.
   - Preserve original equation numbers, theorem numbers, and variable symbols.
4. **Complete Worked Examples, Exercises, and Solutions:**
   - Every worked example, practice problem, and solution step in the source document must be transcribed in full, including problem numbers, sub-parts (`(a)`, `(b)`, `(c)`), given values, and final answers.

## 2. Handling Visuals, Diagrams, and Tables in Source Transcription

Because downstream Idea and Product stages read the Markdown transcription in `documents/<docId>.md`:
1. **Tables:** Convert every visual table into a complete GitHub-Flavored Markdown table (or LaTeX `array`/`tabular` when matrix layout requires it) with all headers, units, and cell values preserved.
2. **Plots and Graphs:** Below the transcribed caption or paragraph, add a structured `[Visual Transcription]` block recording:
   - Coordinate axes, labels, and units.
   - Plotted functions, curves, asymptotes, critical points, intercepts, and shaded regions.
   - Explicit numerical or symbolic values marked on the axes (for example, $c$, $L$, $L-\varepsilon$, $L+\varepsilon$, $c-\delta$, $c+\delta$).
3. **Schematic Diagrams, Free-Body Diagrams, and Circuits:** Record every labeled component, node, force vector, direction, and connectivity relationship so downstream Product authoring can construct accurate typed visuals (`learning_canvas` or `epsilon_delta_graph`).

## 3. Multi-Source Reconciliation Rules

When a chapter has multiple source documents (for example, a textbook chapter PDF, lecture slides, and a tutorial problem set):
1. **Separate Document Files:** Keep each physical source document as its own entry in `manifest.json.documents` and its own Markdown file `documents/<docId>.md`. Never merge multiple PDFs into a single `.md` file, because `originalSha256` and `expectedUnits` are verified per document.
2. **Notation and Terminology Alignment Notes:**
   - Preserve each document's literal notation inside its own `.md` file.
   - When two documents use different symbols for the same concept (for example, $\ln x$ vs $\log x$, or $\vec{F}$ vs $\mathbf{F}$), you may append a brief non-destructive `> [Reconciliation Note]` blockquote at the relevant section noting the cross-document equivalence while keeping the original text intact.
3. **Cross-Linking Problems and Solutions:**
   - When problems are in one PDF (`role: "problem_set"`) and solutions are in another (`role: "solution_manual"`), keep both documents separate in `documents/` and preserve matching problem numbers (`Soal 1(a)`, `Soal 1(b)`) so downstream provenance can link both source chunks cleanly.

## 4. Quality Gate Remediation Checklist

Before calling `source.ingest`, verify:
- Every `documents/<docId>.md` exists in the ZIP and its UTF-8 byte SHA-256 matches `markdownSha256`.
- Every unit from `1` to `expectedUnits` has an explicit marker (`<!-- page N -->` or `<!-- slide N -->`).
- Character and token density per unit meet the validator threshold (no stubbed or truncated pages).
- All LaTeX delimiters (`$...$` and `$$...$$`) are balanced.
- `archiveChecksum` is computed over the deterministic serialization of the manifest (with `archiveChecksum` omitted) and all document files.
