# Zyx Question Authoring MCP: Question Design and Distractor Quality Guide

## 1. Pedagogical Alignment with Ideas

1. **Test the Linked Idea Directly:**
   - A question linked to an Idea with `role: "primary"` must require that specific concept, theorem, or procedure to solve.
   - When a problem combines a main theorem (`weight: 0.7`, `role: "primary"`) with a prerequisite algebraic or trigonometric identity (`weight: 0.3`, `role: "supporting"`), link both Ideas with weights summing to `1.0`.
2. **Close Chapter Coverage Gaps:**
   - Check `assessment.analyze_bank` and the coverage warnings returned by `assessment.validate_quiz_draft` (`QUESTION_COVERAGE_GAP`).
   - Prioritize writing questions for `uncoveredIdeas` before adding extra questions to Ideas that already have high coverage.

## 2. Calibrating Difficulty and Cognitive Level

Avoid clustering all questions at `medium` + `apply`. Distribute questions intentionally across the chapter's learning needs:
- **`easy` (`remember` / `understand`):**
  - 1 to 2 steps. Tests direct definition recognition, hypothesis checking, graphical interpretation, or single-step application without algebraic traps.
- **`medium` (`apply` / `analyze`):**
  - 2 to 4 steps. Requires selecting the right theorem/method, checking domain conditions, and executing a clean multi-step calculation or conceptual comparison.
- **`hard` (`analyze` / `evaluate` / `create`):**
  - Multi-concept synthesis, parameter analysis (for example, finding values of $a$ and $b$ that make a piecewise function differentiable), counterexample construction, or non-routine modeling.

## 3. Stem (`prompt`) Engineering

1. **Self-Contained and Unambiguous:**
   - State all domain assumptions, variable types ($x \in \mathbb{R}$, $n \in \mathbb{N}$), and units explicitly in the prompt.
   - Put the core question and shared context in `prompt` rather than repeating long phrases in every option.
2. **Avoid Negative-Stem Traps Unless Necessary:**
   - Prefer positive phrasing. When asking for an exception or false statement, bold the keyword (**kecuali** or **tidak benar**) so students do not misread the prompt under time pressure.
3. **Zero Internal ID Leakage:**
   - Never mention Idea codes (`MA-CP3-01`), database IDs (`idea-...`), or source file names in `prompt`, `options`, or `explanation`.

## 4. Diagnostic Distractor Engineering (`multiple_choice` / `multiple_choices`)

Every wrong option must be a plausible result derived from a specific misconception or calculation error, never a random number or absurd statement:
1. **Map Each Distractor to a Real Error:**
   - Sign error or omitted negative sign during differentiation/integration.
   - Applying a theorem when its hypothesis is violated (for example, applying L'Hopital's rule to a non-$0/0$ form).
   - Stopping at an intermediate variable instead of answering the quantity requested in the prompt.
   - Omitting the chain-rule inner derivative or constant factor.
2. **Structural Parity Across Options:**
   - Keep all options similar in length, grammatical structure, mathematical form, and precision so the correct answer does not stand out by formatting alone.
   - Order numerical or symbolic options logically (ascending/descending value or degree).
   - Never use "Semua jawaban benar" or "Tidak ada jawaban yang benar" as filler options; if "Tidak ada" (limit does not exist) is mathematically meaningful, explain the exact left/right limit discrepancy.

## 5. Complete `explanation` Standard

Never leave `explanation` empty (`QUESTION_EXPLANATION_EMPTY`). Every explanation must include:
1. **Core Concept / Idea Principle:** State the definition, theorem, or rule that governs the problem.
2. **Step-by-Step Solution:** Show the clear mathematical or logical derivation arriving at the correct answer.
3. **Distractor Diagnosis:** Briefly explain why the main distractors are wrong so students reviewing their mistakes understand the exact trap to avoid.
