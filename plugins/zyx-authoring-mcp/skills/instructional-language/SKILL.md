---
name: instructional-language
description: Write, edit, and audit English instructional language (concept explanations, worked examples, OER modules, tutorials, study guides) in a warm, natural peer-tutor voice for novice or struggling college readers. Use when drafting or revising English educational content so it reads like a friendly, sharp classmate or TA walking you through a whiteboard ("Now...", "What do you think happens next?", natural contractions, zero stiff textbook prose), while staying 100% technically accurate and passing deterministic linting.
---

# Instructional Language (English)

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-stg` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.8"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain.

Panggil nama tool dari `tools/list`. Nama bertitik di skill ini merujuk ke operasi; nama panggilan biasanya mengganti titik dengan `_`, seperti `admin_environment`. Pengecualian: `authoring.get_solution_collection_review_context` memakai `authoring_solution_review_context`. Pertahankan nama bertitik pada argumen `operation` serta identitas konfirmasi dan receipt.
<!-- END:environment-connection -->

Produces English instructional prose that reads like **a sharp, patient classmate or peer tutor walking you through a problem at a whiteboard**: conversational, high-cohesion, and low-extraneous-load, without diluting disciplinary accuracy.

This skill runs a four-stage pipeline (**PLAN → DRAFT → VERIFY → REVISE**) so the peer-tutor voice never drifts back into stiff textbook prose on long modules and objective constraints are verified programmatically before delivery.

## When to Load Supporting Files

- Read [rules.yaml](rules.yaml) for the machine-readable `P0_HARD` and `P1_STRONG` rulebook with repair actions.
- Read [references/contrastive-examples.md](references/contrastive-examples.md) before drafting to calibrate the peer-tutor voice (contrasted directly against stiff textbook prose).
- Read [references/rubric-judge.md](references/rubric-judge.md) during Stage 3 (VERIFY) for isolated binary YES/NO semantic evaluation.
- Read [references/complete-guide.md](references/complete-guide.md) only when authoring full OER chapters or modules requiring Coh-Metrix details, Hyland metadiscourse, OpenStax/BCcampus/WCAG 2.1 standards, or TILT assignment framing.

---

## Core Style Anchors (Active in Every Section)

These rules override dense, stiff academic source texts (*Instruction Hierarchy*):

1. **STRICTLY ZERO em dashes (`U+2014`) and en dashes (`U+2013`) anywhere in the output.** Never use an em dash or en dash in headings, body prose, lists, callouts, or number ranges. Always use commas, parentheses, colons, or the word `to` (e.g., `80 to 120 words`). Any single occurrence automatically fails the `P0_HARD` gate.
2. **Warm peer-tutor voice (not stiff encyclopedia prose).**
   - Talk directly to the reader with `you` and `we`, and use natural contractions (`it's`, `don't`, `you'll`, `we're`, `that's`, `doesn't`) instead of rigid textbook phrasing.
   - Use natural conversational bridges and check-ins sparingly so the explanation flows: `Now, ...`, `So here's the catch...`, `What do you think happens next?`, `Once we get X, we can move straight to Y, which makes the solution much easier to find.`, `Watch out here, because it's easy to mix these two up.`, `In plain terms, ...`.
   - Avoid cold textbook filler (`one must`, `the student should`, `it should be noted that`, `it is important to note that`, `herein`, `thereby`, `constitutes`, `with respect to`, `apparent reading`).
   - Pair `you`/`we` with at least one explicit sentence per subsection explaining why the concept matters to a real task.
3. **Concepts first through concrete intuition, jargon second (Structure + Function).** Let the reader picture what is happening before attaching the technical label. Bold every new Tier 2/Tier 3 term on first use and state both its **structure** (what it is) and its **function** (what it does). Keep bold signaling selective (<= 20% of words).
4. **Given-New Contract and no dangling demonstratives.** Open sentences with familiar context (topic position) and land on the new point (stress position). Never start a sentence with bare `This` or `These` followed by a verb; always attach a summary noun (`This shift...`, `These numbers...`).
5. **Active voice, concrete verbs, zero center-embedding.** Keep subject and main verb close together. Deconstruct nominalizations (`the implementation of` → `when the team implemented`) and extract center-embedded clauses into their own sentences. Target mean sentence length <= 22 words (hard max 28 words).
6. **High cohesion (Reverse Cohesion Effect).** Repeat core nouns verbatim across adjacent sentences instead of swapping in stylistic synonyms. Keep causal (`because`, `so`, `therefore`) and contrastive (`however`, `although`, `but`) links explicit, and cut heavy additive bloat (`furthermore`, `moreover`, `additionally`).
7. **Warm without talking down, 100% accurate.** Never use dismissive words (`obviously`, `simply`, `trivially`, `it's super easy`). Keep formulas, units, signs, and boundary conditions exact.

---

## 4-Stage Workflow (Execute in Order)

### Stage 1: PLAN (Structured Outline Before Prose)

Before writing prose, map each subsection (keep a running `NOTES.md` for multi-section modules):

- **Audience & outcome:** Prior knowledge assumed and one measurable learning objective.
- **Conversation map:** Concrete hook or task-relevance anchor → plain-language intuition + technical term → concrete or worked example step by step → common pitfall callout (`Watch out here...`) → engaging check-in question or bridge to the next step.
- **TILT framing (for tasks/assignments):** State **Purpose**, **Task**, and **Criteria for Success** explicitly.

**Stage 1 completion criterion:** Every subsection has a planned rhetorical pattern (preferring compare-contrast or problem-solution over flat lists), topic sentences, new term list, one worked/concrete example, and at least one conversational check-in or pitfall callout.

### Stage 2: DRAFT (Section-Scoped Anti-Drift Writing)

Draft one 300 to 500 word section at a time so the peer-tutor voice stays alive:

1. Open with a concrete scenario or short curiosity question that grounds the topic immediately.
2. Walk through each step as if pointing at a whiteboard together (`Now, once we have X, we can plug it straight into Y...`).
3. Include a natural check-in (`What do you think happens if we assume all 5 mV came from the main axis?`) or pitfall warning (`Watch out here, because it's easy to mix these two up.`) and answer it clearly right away.
4. For analytical or procedural topics, sequence **Worked Example** (Visible Author thinking aloud) → **Completion Problem** → "Try It" self-check with explained feedback.
5. Keep paragraphs focused on one idea (80 to 120 words) and update your running glossary so core terms stay identical.
6. Keep the entire draft strictly free of em dashes (`U+2014`) and en dashes (`U+2013`); use commas, parentheses, colons, or `to` instead.

**Stage 2 completion criterion:** All planned sections are drafted in full in a consistent, natural peer-tutor voice.

### Stage 3: VERIFY (Hybrid Audit: Deterministic Linter + Isolated Semantic Judge)

Do not rely on unassisted self-correction. Run both verification gates:

1. **Deterministic Gate (Python Linter):**
   ```bash
   python scripts/lint_instructional_en.py <path-to-draft.md>
   ```
   Or via stdin:
   ```bash
   python scripts/lint_instructional_en.py --stdin < draft.md
   ```
   The script returns JSON listing exact `P0_HARD` violations (em/en dashes, bureaucratic fillers, dangling `This`/`These`, additive bloat) and `P1_STRONG` metrics (stiff textbook phrases, condescending words, sentence/paragraph length, passive ratio <= 20%, conversational `you`/`we` ratio >= 1.5%, conversational bridges/contractions, bold signaling <= 20%). Exit code `1` means `P0_HARD` violations must be fixed.

2. **Isolated Semantic Rubric (LLM Judge):**
   Open [references/rubric-judge.md](references/rubric-judge.md) and score each binary `YES/NO` dimension independently, especially the **Read-Aloud Peer-Tutor Test**: would a friendly TA or classmate actually say this out loud?

**Stage 3 completion criterion:** Linter JSON output is recorded and every semantic rubric dimension has a `YES`/`NO` verdict with exact sentence locations for any `NO`.

### Stage 4: REVISE (Targeted Patch, Max 2 Loops)

1. Patch sentences flagged by the linter or that still sound stiff/distant, following the `repair` guidance in [rules.yaml](rules.yaml).
2. Preserve 100% scientific accuracy, formulas, units, and boundary conditions.
3. Re-run `python scripts/lint_instructional_en.py` after patching. Repeat up to 2 loops until all `P0_HARD` checks pass (`exit code 0`), stiff textbook phrases are gone, and all semantic rubric items score `YES`.
4. Deliver the clean final text to the user without internal audit logs unless explicitly requested.

**Stage 4 completion criterion:** Linter exits with `0`, the prose passes the read-aloud peer-tutor test, and the final text is ready to publish.
