# Zyx Product Bundle V4: Pedagogic Quality Rubric and Verification Protocol

## 1. Eight-Criterion Pedagogic Rubric

Use all eight criteria for independent editorial review. V4 approval requires the full rubric, the exact revision and content fingerprint, current verification plan/receipt, and an explicit current semantic decision for every section. Read the review context from authoring.get_import. Legacy V3 decisions retain their existing compatibility rules; they do not approve V4 content.

1. **`concept_accuracy` (Ketepatan Konsep dan Kebenaran Ilmiah)**
   - Definitions, theorems, formulas, and domain conditions are mathematically and scientifically exact.
   - No overgeneralized claims that omit required hypotheses (such as continuity, differentiability, or non-zero denominators).

2. **`prerequisite_completeness` (Kelengkapan Prasyarat)**
   - Every section declares its `pedagogy.prerequisites` with human-readable labels and valid `supportBlockIds`.
   - Foundational concepts are bridged before introducing advanced derivations.

3. **`explanation_sequence` (Urutan Penjelasan dan Alur Pedagogis)**
   - Sections and blocks progress logically from intuition and motivation to formal definition, step-by-step reasoning, worked example, misconception trap, and formative retrieval check.
   - No forward references to undefined concepts.

4. **`symbol_and_condition_clarity` (Kejelasan Simbol, Notasi, dan Syarat Berlaku)**
   - Every symbol in `pedagogy.symbols` is introduced in `introductionBlockId` with its exact meaning, units (if physical), and validity condition.
   - Notation is consistent across the Article, Diktat, visuals, and flashcards.

5. **`example_reasoning` (Penalaran Contoh Terkerja / Worked Example)**
   - Every V4 worked_example part includes ordered steps with operationMarkdown, reasonMarkdown, sourceElementRefs and parts, plus a concrete verificationMarkdown sanity check. Legacy V3 workedExamplePayload is only for explicit V3 revisions.

6. **`representation_or_visual` (Representasi Ganda atau Visual Terketik)**
   - Abstract relationships are supported by either a valid typed visual (`epsilon_delta_graph` or `learning_canvas` with complete `staticFallback`) or an explicit, justified `visualRequirement: { status: "not_required", reason: "..." }`.

7. **`misconceptions_and_limits` (Miskonsepsi, Kasus Batas, dan Jebakan Umum)**
   - Explicitly contrasts valid applications with common student errors and boundary counterexamples (for example, why a converse does not hold or where a formula breaks down).

8. **`formative_check_and_explanation` (Cek Formatif dan Pembahasan Mandiri)**
   - Every learning objective in `pedagogy.objectives` is paired with at least one formative check (`retrieval_prompt` or `retrieval_close`) whose `formativeCheckPayload` includes a clear answer key, progressive hints (when applicable), and a thorough self-study explanation.

## 2. Independent Critic and Student POV Verification Protocol

Before calling `authoring.submit_product_bundle`, run two independent subagent passes:

These passes are part of a complete Creator, Critic, and Student POV revision loop. After the Creator revises the content, both reviewers must read the final merged artifact again. Findings are closed only with concrete locations, evidence, and the Creator's disposition. Record the checksum/version each reviewer read; the staged version must match their final reread. Repeat the loop for blocking issues and substantive warnings. Lane-level review does not replace review of the merged artifact.

Keep review records outside the bundle ZIP with `PASS`, `FAIL`, `NOT_APPLICABLE`, or `NOT_TESTED`, evidence location, and reason. Unsupported human or platform tests must remain `NOT_TESTED`. Examples, misconceptions, and visuals are conditional pedagogic choices, not mandatory filler for every section; apply the decision rules in `product/editorial`.

### 2.1 Critic Subagent Pass
- **Input:** Draft `entities/products.json`, `entities/dependencies.json`, bound Source Pack Markdown, and published Idea list.
- **Task:**
  1. Audit all 8 criteria above with concrete block/section anchors (`targetType: "document" | "section" | "block" | "visual"`, `targetId`).
  2. Perform the full mathematical derivation audit (`product/derivation-audit`).
  3. Scan all learner-visible strings for leaked internal IDs (`idea-`, `source-`, `ex-`, `ls-`, `blk-`, `sec-`), untranslated raw English fragments where Indonesian is expected, or broken LaTeX delimiters.
  4. Inspect the rendered formulas, graph axes, annotations, controls, diagram nodes and tables. Mathematical symbols must be typeset, scientific numbers must use powers of ten rather than raw `e` notation, chemistry must retain subscripts and coefficients, and units must retain dimensions. Confirm readable glyph sizes at mobile width, no overlapping labels, no KaTeX errors and no nonzero quantities rounded silently to zero. Source code inspection alone does not pass this check.

### 2.2 Student POV Subagent Pass
- **Input:** Only the learner-visible Article sections, blocks, visuals, Diktat Markdown, and Flashcards (without internal Idea/source metadata).
- **Task:**
  1. Read each section sequentially as a first-year university student encountering the topic for the first time.
  2. Flag any "missing rung" where a step jumps without explanation, a symbol appears before its definition, or a formative check asks for a trick not taught in the section.
  3. Attempt every formative check using only the preceding text in that section to verify solvability and clarity.

## 3. Anchored Review Payload (`authoring.review_product_bundle`)

When recording a review decision with `authoring.review_product_bundle`:
- Pass the exact `policyVersion` and `contentFingerprint` from the staged bundle.
- V4 requires expectedRevision, current verificationPlanHash and verificationReceiptSignature, plus an explicit semanticHash decision for every section from the fresh review context. Provide all 8 items in `criteria`, each with `criterionId`, `status: "met" | "needs_revision" | "not_met"`, `reason`, and at least one `contentAnchors` entry (`{ targetType, targetId }`). Anchor objects have no `note` field.
- Each criterion not marked `"met"` requires an explicit `exceptions` entry `{ criterionId, approved: true, reason }` with a substantive reason.
