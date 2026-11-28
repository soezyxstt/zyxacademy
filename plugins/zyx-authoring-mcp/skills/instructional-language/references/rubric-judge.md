# Isolated Semantic Audit Rubric (LLM Judge): English Instructional Prose

Run this rubric during **Stage 3 (VERIFY)** after `scripts/lint_instructional_en.py` completes.

## Evaluator Anti-Bias Rules

1. **Score one dimension at a time** as a strict binary `YES` or `NO`. Avoid vague partial grades.
2. **Counter verbosity bias.** Shorter, clearer prose that meets every criterion always outranks longer prose.
3. **Cite exact locations.** For every `NO`, quote the offending paragraph/sentence number and write a concrete patch instruction.
4. **Do not duplicate code checks.** Em/en dashes, dangling `This`/`These`, bureaucratic fillers, additive bloat, sentence length, passive ratio, `you`/`we` ratio, and bold ratio are already checked by `scripts/lint_instructional_en.py`.

---

## Pedagogical Constitution Checklist (Binary YES / NO)

| ID | Dimension | Binary Audit Question | Repair Action If NO |
|---|---|---|---|
| `SEM.1` | **Concepts-First** | Is every new concept explained in concrete plain language before or alongside its technical label? | Add a plain-language explanation before naming the term. |
| `SEM.2` | **Structure + Function Definition** | Does every newly introduced Tier 2/Tier 3 term state both its *structure* (what it is) and its *function* (what it does), flagging everyday vs technical ambiguity where needed? | Expand the definition to state both structure and function. |
| `SEM.3` | **Reverse Cohesion (Exact Overlap)** | Do adjacent sentences repeat core nouns verbatim rather than swapping in stylistic synonyms, and are causal/contrastive links explicit? | Replace stylistic synonyms with the exact core term and insert explicit causal/contrastive connectives. |
| `SEM.4` | **Given-New Flow** | Do sentences generally open with familiar/prior information (topic position) and end with the new emphasized point (stress position)? | Reorder clauses so known information links back before introducing new information. |
| `SEM.5` | **Zero Center-Embedding** | Are subjects kept close to their main verbs without long interrupting clauses tucked in the middle? | Extract the interrupting clause into its own sentence. |
| `SEM.6` | **Clean Rhetorical Staging** | Does each section use one clear rhetorical pattern (preferring compare-contrast or problem-solution over flat descriptive lists) with deductive 1-idea paragraphs? | Reorganize mixed paragraphs into one clean pattern with clear topic sentences. |
| `SEM.7` | **Worked Example → Fading** | For analytical or procedural topics, does the section provide a step-by-step worked example (Visible Author reasoning) before asking students to practice independently? | Insert a worked example with explicit reasoning before the "Try It" check. |
| `SEM.8` | **Task Relevance + Warm Tone** | Does the subsection pair conversational `you`/`we` with at least one explicit sentence explaining why the concept matters to a real task, in a warm, non-condescending tone? | Add a concrete task-relevance sentence and remove dismissive words (`obviously`, `simply`, `easy`). |
| `SEM.9` | **No Seductive Details & Full Accuracy** | Are concrete examples attached directly to core ideas (no distracting trivia), and do all simplifications preserve formulas, units, and boundary conditions? | Cut off-topic trivia and restore any omitted conditions or units. |
| `SEM.10` | **TILT Clarity (Tasks/Exercises)** | If the text includes an exercise or assignment, does it state **Purpose**, **Task**, and **Criteria for Success** explicitly? | Add the missing Purpose, Task, or Criteria for Success block. |

---

## Internal Audit Log Format

```text
SEM.1 [YES/NO] - <if NO: Para X, Sent Y -> exact patch>
SEM.2 [YES/NO] - ...
...
SEM.10 [YES/NO] - ...
```

Fix every `NO` item in Stage 4 (REVISE), then re-run `scripts/lint_instructional_en.py`.
