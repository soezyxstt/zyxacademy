---
name: instructional-language
description: Write, edit, and audit English instructional language (OER modules, introductory textbooks, tutorials, course explanations, worked examples) for struggling or novice college readers with limited analytical stamina. Use when drafting or revising English educational content to enforce high cohesion, Given-New flow, active voice, zero center-embedding, concepts-first Structure+Function definitions, conversational "you"/"we" voice with task relevance, and deterministic linting.
---

# Instructional Language (English)

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-stg` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.6"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain.

Panggil nama tool dari `tools/list`. Nama bertitik di skill ini merujuk ke operasi; nama panggilan biasanya mengganti titik dengan `_`, seperti `admin_environment`. Pengecualian: `authoring.get_solution_collection_review_context` memakai `authoring_solution_review_context`. Pertahankan nama bertitik pada argumen `operation` serta identitas konfirmasi dan receipt.
<!-- END:environment-connection -->

Produces high-cohesion, conversational, low-extraneous-load English instructional prose for novice and lower-to-mid-achieving college students without diluting disciplinary accuracy.

This skill runs a four-stage pipeline (**PLAN → DRAFT → VERIFY → REVISE**) to prevent persona/style drift on long modules and verify objective constraints programmatically before delivery.

## When to Load Supporting Files

- Read [rules.yaml](rules.yaml) for the machine-readable `P0_HARD` and `P1_STRONG` rulebook with repair actions.
- Read [references/contrastive-examples.md](references/contrastive-examples.md) before drafting to calibrate transformations (low cohesion, center-embedding, nominalization, passive voice, Structure+Function, POV + task relevance).
- Read [references/rubric-judge.md](references/rubric-judge.md) during Stage 3 (VERIFY) for isolated binary YES/NO semantic evaluation.
- Read [references/complete-guide.md](references/complete-guide.md) only when authoring full OER chapters or modules requiring Coh-Metrix details, Hyland metadiscourse, OpenStax/BCcampus/WCAG 2.1 standards, or TILT assignment framing.

---

## Core Style Anchors (Active in Every Section)

These `P0_HARD` rules override dense academic source texts (*Instruction Hierarchy*):

1. **STRICTLY ZERO em dashes (`U+2014`) and en dashes (`U+2013`) anywhere in the output.** Never use an em dash or en dash in headings, body prose, lists, callouts, or number ranges. Always use commas, parentheses, colons, or the word `to` (e.g., `80 to 120 words`). Any single occurrence automatically fails the `P0_HARD` gate.
2. **Given-New Contract and no dangling demonstratives.** Place familiar information in the topic position (sentence start) and new information in the stress position (sentence end). Never start a sentence with bare `This` or `These` followed by a verb; always pair with a summary noun (`This shift...`, `These results...`).
3. **Active voice, concrete verbs, zero center-embedding.** Keep subject and main verb close together. Deconstruct nominalizations (`the implementation of` → `when the team implemented`) and split center-embedded parenthetical clauses into separate sentences. Target mean sentence length <= 22 words (hard max 28 words).
4. **High cohesion (Reverse Cohesion Effect).** Repeat core nouns verbatim across adjacent sentences instead of using stylistic synonyms. Keep causal (`because`, `therefore`, `as a result`) and contrastive (`however`, `although`, `but`) connectives explicit. Avoid empty additive fillers (`furthermore`, `moreover`, `in addition to this`).
5. **Concepts first, jargon second (Structure + Function).** Explain the concrete idea before naming the technical term. Define every new Tier 2/Tier 3 term with both its **structure** (what it is) and its **function** (what it does). Keep bold signaling selective (<= 20% of words).
6. **Conversational POV paired with task relevance.** Address the reader directly with `you` and `we` (Visible Author tutor voice), and include at least one explicit sentence per subsection explaining *why* the concept matters to the reader's task or problem.
7. **Micro-chunked deductive paragraphs.** Hold one idea per paragraph (80 to 120 words, deductive topic sentence → elaboration/example → bridge) and group sections into 300 to 500 word chunks with one clean rhetorical pattern (prefer compare-contrast or problem-solution over flat descriptive lists).

---

## 4-Stage Workflow (Execute in Order)

### Stage 1: PLAN (Structured Outline Before Prose)

Before writing prose, map each subsection (keep a running `NOTES.md` for multi-section modules):

- **Audience & outcome:** Prior knowledge assumed and one measurable learning objective (Bloom verb).
- **Section map:** Task-relevance hook → rhetorical pattern (deductive / compare-contrast / problem-solution / worked example) → topic sentence per paragraph → new Tier 2/Tier 3 terms (with Structure + Function plan) → "Try It" self-check or summary bridge.
- **TILT framing (for tasks/assignments):** State **Purpose**, **Task**, and **Criteria for Success** explicitly.

**Stage 1 completion criterion:** Every subsection has a planned rhetorical pattern, paragraph topic sentences, new term list, task-relevance link, and at least one concrete or worked example.

### Stage 2: DRAFT (Section-Scoped Anti-Drift Writing)

Draft one 300 to 500 word section at a time with fresh attention to the Core Style Anchors:

1. Open with a concrete scenario or task-relevance anchor explaining why the concept matters.
2. Follow `Topic Sentence → Elaboration/Concrete Example → Bridge` in every 80 to 120 word paragraph.
3. For analytical or procedural topics, sequence **Worked Example** (Visible Author thinking aloud) → **Completion Problem** (partially solved) → independent "Try It" self-check with explained feedback.
4. Keep concrete examples tied directly to the core idea (never add decorative *seductive details*).
5. Update your running glossary of defined terms between sections so referential overlap stays exact.
6. Keep the entire draft strictly free of em dashes (`U+2014`) and en dashes (`U+2013`); use commas, parentheses, colons, or `to` instead.

**Stage 2 completion criterion:** All planned sections are drafted in full in the user's requested format.

### Stage 3: VERIFY (Hybrid Audit: Deterministic Linter + Isolated Semantic Judge)

Do not rely on unassisted self-correction. Run both verification gates:

1. **Deterministic Gate (Python Linter):**
   Run the validator on the draft:
   ```bash
   python scripts/lint_instructional_en.py <path-to-draft.md>
   ```
   Or via stdin if the draft is not saved to disk:
   ```bash
   python scripts/lint_instructional_en.py --stdin < draft.md
   ```
   The script returns JSON listing exact `P0_HARD` violations (em/en dashes, bureaucratic wordy phrases, dangling `This`/`These`, excessive additive connectives) and `P1_STRONG` metrics (mean/max sentence length, paragraph word count, passive-voice heuristic hits, conversational `you`/`we` ratio, bold signaling ratio <= 20%). Exit code `1` means `P0_HARD` violations must be fixed.

2. **Isolated Semantic Rubric (LLM Judge):**
   Open [references/rubric-judge.md](references/rubric-judge.md) and score each binary `YES/NO` dimension independently (Concepts-First, Structure+Function, Reverse Cohesion, Given-New, Zero Center-Embedding, Worked Examples, Task Relevance + Visible Author, TILT clarity). Log exact offending sentences.

**Stage 3 completion criterion:** Linter JSON output is recorded and every semantic rubric dimension has a `YES`/`NO` verdict with exact sentence locations for any `NO`.

### Stage 4: REVISE (Targeted Patch, Max 2 Loops)

1. Edit **only** the sentences or paragraphs flagged by the linter or semantic rubric, following the `repair` guidance in [rules.yaml](rules.yaml).
2. Preserve scientific accuracy, formulas, units, and boundary conditions; never trade factual precision for shorter sentences.
3. Re-run `python scripts/lint_instructional_en.py` after patching. Repeat up to 2 loops until all `P0_HARD` checks pass (`exit code 0`) and all semantic rubric items score `YES`.
4. Deliver the clean final text to the user without internal audit logs unless explicitly requested.

**Stage 4 completion criterion:** Linter exits with `0` (zero `P0_HARD` violations), `P1_STRONG` targets are met or justified (e.g., verbatim quotes/equations), and the final prose is ready to publish.
