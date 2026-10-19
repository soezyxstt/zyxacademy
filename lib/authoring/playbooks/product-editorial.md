# Zyx Product Bundle V3: Structured Article, Diktat, and Typed Visuals Editorial Guide

## 1. Structured Article Architecture (`productType: "article"`)

In `product-bundle.v3`, an Article uses structured `sections` (with `blocks: []` at the top level) so the student reader can render interactive section navigation, learning time estimates, typed visuals, worked examples, and formative checks.

### 1.1 Section Hierarchy (`sections`)

- Each primary subtopic section uses `kind: "topic"` and binds `learningSectionId` to a published `bagian_pembelajaran` ID in the locked chapter.
- Optional intro/outro/synthesis sections use the allowed section `kind` values in the validator contract.
- `orderIndex` must be contiguous (`0, 1, 2, ...`).
- Every section must include `id`, `kind`, `title`, `slug`, `orderIndex`, `learningObjective`, `ideaIds` (non-empty), `sourceRefs` (non-empty), `pedagogy`, and `blocks`.

### 1.2 Section `pedagogy` Object

Every section with instructional content requires a complete `pedagogy` object:
1. **`objectives`:** Array of `{ id, description, explanationBlockIds, formativeCheckBlockIds }`.
   - Every objective must reference at least one explanation block in `explanationBlockIds` and at least one formative check block (`retrieval_prompt` or `retrieval_close`) in `formativeCheckBlockIds` within that section.
2. **`prerequisites`:** Array of `{ id, type: "section" | "idea" | "external", label, supportBlockIds }`.
   - `label` must be human-readable Indonesian prose (never a raw database ID).
3. **`symbols`:** Array of `{ symbol, meaning, condition, introductionBlockId }`.
   - Every mathematical or domain symbol introduced in the section must be listed with its meaning, validity condition, and the `introductionBlockId` where it is first defined.
4. **`timeEstimate`:** `{ readingMinutes, examplesMinutes, practiceMinutes }` with realistic positive integers.
5. **`visualRequirement`:**
   - Either `{ status: "required", visualIds: ["vis-..."] }` referencing valid entries in `article.visuals`, or `{ status: "not_required", reason: "..." }` with a substantive pedagogical justification.

### 1.3 Semantic Blocks (`blocks`) and Payloads

Order blocks within each section (`orderIndex: 0, 1, 2, ...`) so concepts build naturally before testing the learner:
- **Concept & Intuition Blocks** (such as `concept_intro`, `definition`, `theorem`, `derivation`, `intuition`, `visual_explainer`, `misconception_trap`, `summary_box`):
  - Write clear, self-contained Indonesian explanations in `contentMarkdown`.
  - Define every symbol before or at its first formula appearance.
  - Include explicit misconception/boundary analysis explaining what happens when a theorem's condition is violated.
- **Worked Example Blocks (`blockType: "worked_example"`):**
  - Must include `workedExamplePayload`:
    ```json
    {
      "steps": [
        {
          "stepIndex": 0,
          "label": "Identifikasi bentuk limit dan syarat domain",
          "explanation": "Substitusi langsung $x = 2$ menghasilkan bentuk $0/0$, sehingga kita faktorkan pembilang untuk mencari faktor $(x - 2)$ pada domain $x \\neq 2$.",
          "reason": "Pada definisi limit $x \\to 2$, nilai fungsi di $x = 2$ tidak diperlukan; yang dianalisis adalah perilaku di sekitar $x = 2$."
        }
      ],
      "verification": "Substitusi nilai mendekati $x = 2$, misalnya $x = 2.001$, menghasilkan $f(2.001) = 4.001 \\approx 4$, konsisten dengan hasil limit."
    }
    ```
  - `stepIndex` must be contiguous starting at `0` (`0, 1, 2, ...`). Every step requires a non-empty `label`, `explanation`, and `reason`, plus a non-empty `verification`.
- **Formative Check Blocks (`blockType: "retrieval_prompt"` or `"retrieval_close"`):**
  - Must include `formativeCheckPayload`:
    - `checkKind`: `"multiple_choice" | "short_answer" | "numeric_answer" | "conceptual_explanation"`
    - `answer`: Canonical answer string.
    - `explanation`: Complete self-study walkthrough explaining why the answer is correct and why common traps fail.
    - `options`: Required when `checkKind === "multiple_choice"`; at least 2 options `{ id, text, isCorrect }` with exactly one option marked `isCorrect: true`.
    - `evaluation`: Optional typed evaluator (`choice`, `text_exact`, `numeric`, or `ai_rubric`) matching `checkKind`.
    - `feedbackPolicy`: Optional `{ hints: ["..."], allowRetry: true }` with at most 3 progressive hints.

## 2. Typed Visuals (`article.visuals`)

Never embed executable JavaScript, raw HTML, raw `<svg>`, `<iframe>`, or remote URLs. Use only supported typed visual specs in `article.visuals`:

1. **`kind: "epsilon_delta_graph"`:**
   - Fields: `id`, `kind`, `label`, `description`, `bounds: { xMin, xMax, yMin, yMax }` (`xMin < xMax`, `yMin < yMax`), `limitPoint` (strictly inside `xMin..xMax`), `limitValue` (strictly inside `yMin..yMax`), `defaultEpsilon` (`> 0`, band inside `yMin..yMax`), `defaultDelta` (`> 0`, neighborhood inside `xMin..xMax`), `functionModel` (`constant`, `linear`, or `quadratic`), and `staticFallback` (`table` with `summary`, `headers`, `rows`, or `text` with `summary`, `content`).
2. **`kind: "learning_canvas"`:**
   - Bounded application-owned 2D `CanvasSpec` supporting function plots, data series, derivation diagrams, vector fields, or chemistry diagrams with explicit domain bounds, accessible `label` and `description`, and a required `staticFallback` whenever `interactive: true`.

## 3. Diktat Editorial Standard (`productType: "diktat"`)

### Required authoring decisions and evidence

- Article is the student's only primary reading for the chapter. It must teach every objective without requiring the Source Pack, Ideas, Diktat, or flashcards. Source Pack and Ideas remain the provenance evidence, not alternative learner explanations.
- Finish and review the Article before deriving Diktat and flashcards. Every fact, condition, formula, answer, and explanation in a derivative must point to learner-readable Article content. If a required fact is missing, teach it in the Article first. A link to an Idea or a section title is not derivation evidence.
- Keep an objective-to-block and derivative-to-Article matrix outside the bundle ZIP. Record block decisions as `REQUIRED`, `OPTIONAL`, or `NOT_APPLICABLE`, with a reason and source evidence. Do not add unsupported planning fields to the bundle schema.
- Worked examples are conditional: use one when a procedure, strategy choice, application, or verification needs a concrete case. Misconceptions and limits are conditional: include them when a predictable error, domain restriction, ambiguity, or source conflict changes understanding or correctness. Do not manufacture examples, traps, applications, or visuals to fill a template, page count, or word target.
- When an optional block is omitted, update all explanation, formative-check, support, and visual references to avoid dangling IDs. Diktat must not reintroduce examples or misconceptions that the Article deliberately omitted as irrelevant.

### Formula-first presentation

- After a short orientation, put mathematical relations in `mathematical_representation` blocks as separate display math (`$$...$$`). These blocks contain formulas only, with no prose on the delimiter line or after the closing delimiter.
- Explain symbols, domain, assumptions, validity conditions, and meaning in separate verbal blocks before students use them. Avoid repeated boilerplate labels and do not repeat the same formula in every explanatory sentence.
- Reviewers must flag formulas hidden only in prose, raw unrendered LaTeX, undefined symbols, missing conditions, and paragraphs mixing several mathematical decisions. Use only fields and semantic tokens supported by the active contract, never raw HTML, CSS, executable expressions, SVG, or remote embeds.
- Report prose words per topic, formula block count, mixed formula block count, and typed visual count. These metrics identify readability problems; they are not targets that justify filler.

### Review sheet and PDF evidence

- Diktat is a selective exam-review sheet, not an Article copy. Keep the complete Idea coverage and truth conditions, formulas/definitions, necessary symbols, method decisions, risky traps, and recall cues. Remove repeated introductions, long analogies, full derivations, and long examples already taught in the Article.
- Keep body font fixed at 10.5 pt and disable auto-shrink. The contract permits 1 to 4 pages with no minimum-filling target. Do not shrink text, drop formulas, or remove important conditions to meet the page budget; revise content selection or report a scope/layout conflict.
- Claim PDF `VERIFIED` only after rendering the exact artifact hash, measuring its page count, and inspecting every page. Record artifact hash, renderer/profile version, page count, and findings. `NOT_RENDERED`, stale evidence, broken glyphs, raw formulas, clipping, blank pages, or page counts outside 1 to 4 block PDF verification.
- Use `PASS`, `FAIL`, `NOT_APPLICABLE`, and `NOT_TESTED` for author checks, with item, evidence location, and reason. Human, student, browser, platform, and tagged-PDF checks remain `NOT_TESTED` until actually performed. Do not equate MCP validation, author preflight, admin review, PDF verification, or publication readiness.

### Visual and semantic presentation checks

- Mark visuals required only when spatial relationships, shape, comparison, change, or transformation materially aid understanding. Otherwise record `NOT_APPLICABLE` with evidence. Default to bounded 2D; 3D requires explicit typed-renderer and PDF-fallback support.
- Use academic icons and only supported semantic tokens such as remember, avoid, caution, definition, or formula. Never use Sparkles, AI-glow icons, emoji, or color alone to carry meaning. Verify labels, contrast, light/dark/print presentation, and keyboard behavior where actually tested.
- Graphs need accessible descriptions, meaningful bounds, axes/units where relevant, labels, and static text/table fallback. Before/after curves use dashed original and solid result. Interactive controls need ID, label, min/max/step/default and a supported binding; use static visuals when interaction adds no learning insight.
- Admin preview and learner rendering must preserve the same section/block visual references. Verify parity at the runtime boundary before claiming it; schema success alone is insufficient.

1. **Purpose:** A Diktat is a high-density, print-ready A4 review sheet (target 1 to 4 rendered PDF pages) linked to its source Article (`sourceArticleId`, `sourceArticleVersion`, `sourceArticleHash`).
2. **Structure:** Organize `contentMarkdown` into compact definitions, key theorems with explicit validity conditions, canonical problem-solving algorithms, common exam traps, and a concise worked reference example.
3. **PDF Page Budget:** Keep Markdown length, table widths, and display formulas compact so the A4 print renderer produces between 1 and 4 pages (`readyPageRange: { minPages: 1, maxPages: 4 }`) without `PAGE_BUDGET_EXCEEDED` or `LAYOUT_OVERFLOW`.
