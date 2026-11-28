# Isolated Semantic Audit Rubric (LLM Judge): English Instructional Prose

Run this rubric during **Stage 3 (VERIFY)** after `scripts/lint_instructional_en.py` completes.

## Evaluator Anti-Bias Rules

1. **Score one dimension at a time** as a strict binary `YES` or `NO`. Avoid vague partial grades.
2. **Counter verbosity bias.** Shorter, warmer, clearer prose that meets every criterion always outranks longer prose.
3. **Cite exact locations.** For every `NO`, quote the offending paragraph/sentence number and write a concrete patch instruction.
4. **Do not duplicate code checks.** Em/en dashes, dangling `This`/`These`, bureaucratic fillers, additive bloat, stiff textbook phrases, sentence length, passive ratio, `you`/`we` ratio, and bold ratio are already checked by `scripts/lint_instructional_en.py`.

---

## Pedagogical Constitution Checklist (Binary YES / NO)

| ID | Dimension | Binary Audit Question | Repair Action If NO |
|---|---|---|---|
| `SEM.1` | **Read-Aloud Peer-Tutor Test** | If read aloud, does this sound like a sharp, friendly classmate or TA explaining at a whiteboard (using natural contractions and bridges like `Now, ...`, `What do you think happens...?`, `Watch out here...`), rather than a cold textbook? | Rewrite stiff sentences into natural spoken-style tutor prose and add 1 to 2 organic bridges or check-in questions. |
| `SEM.2` | **Concepts-First** | Is every new concept pictured in concrete plain language before or alongside its technical label? | Add a concrete intuition or mental picture before naming the term. |
| `SEM.3` | **Structure + Function Definition** | Does every newly introduced Tier 2/Tier 3 term state both its *structure* (what it is) and its *function* (what it does), flagging everyday vs technical ambiguity where needed? | Expand the definition to state both structure and function. |
| `SEM.4` | **Reverse Cohesion (Exact Overlap)** | Do adjacent sentences repeat core nouns verbatim rather than swapping in stylistic synonyms, and are causal/contrastive links explicit? | Replace stylistic synonyms with the exact core term and insert explicit causal/contrastive connectives. |
| `SEM.5` | **Given-New Flow & Zero Center-Embedding** | Do sentences open with familiar context, end on the new point, and keep subjects right beside their main verbs? | Reorder clauses for Given-New flow and extract any long interrupting clause into its own sentence. |
| `SEM.6` | **Clean Rhetorical Staging** | Does each section use one clear rhetorical pattern (preferring compare-contrast or problem-solution over flat lists) with focused 1-idea paragraphs? | Reorganize mixed paragraphs into one clean pattern with clear topic sentences. |
| `SEM.7` | **Worked Example & Pitfall Callout** | For analytical or procedural topics, does the section walk through a concrete worked example and flag a common misconception (`Watch out here...`) before independent practice? | Add a step-by-step worked example and a clear pitfall note. |
| `SEM.8` | **Task Relevance & Non-Condescending Warmth** | Does the subsection connect the concept to a real task the reader cares about while staying free of dismissive words (`obviously`, `simply`, `easy`)? | Add a concrete task-relevance sentence and cut any dismissive wording. |
| `SEM.9` | **No Seductive Details & 100% Accuracy** | Are examples tied directly to core ideas (no off-topic trivia), and do all formulas, units, signs, and boundary conditions stay exact? | Cut off-topic trivia and restore any omitted conditions or units. |
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
