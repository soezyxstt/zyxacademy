# Zyx Product Bundle V4: Mathematical and Scientific Derivation Audit Guide

## 1. Purpose

Every derivation, proof, worked example, and numerical calculation in an Article, Diktat, or formative check explanation must pass a deterministic step-by-step audit before staging.

## 2. Step-by-Step Derivation Rules

1. **No Unjustified Algebraic Leaps:**
   - Do not combine more than two non-trivial algebraic or calculus operations in a single transition without showing the intermediate expression.
   - In `worked_example` blocks, each step in `workedExamplePayload.steps` must isolate one logical move, state the transformation in `explanation`, and state the mathematical justification (theorem, identity, or domain condition) in `reason`.

2. **Explicit Domain and Inequality Tracking:**
   - Whenever dividing by an expression $g(x)$, state explicitly why $g(x) \neq 0$ on the active domain (for example, "karena $0 < |x - c| < \delta$, maka $x \neq c$ sehingga $x - c \neq 0$").
   - Whenever multiplying or dividing an inequality by a factor, state the sign of that factor and whether the inequality direction is preserved or reversed.
   - When bounding a non-linear expression in an $\varepsilon$-$\delta$ proof (for example, bounding $|x + c|$ by choosing $\delta = \min(1, \dots)$), write out the triangle inequality and the auxiliary bound $\delta \le 1$ explicitly so the learner sees where the constant comes from.

3. **Symbol and Unit Consistency:**
   - Every symbol used in a derivation must match its entry in `section.pedagogy.symbols`.
   - Never reuse the same letter for two different quantities within the same section (for example, using $c$ for both the limit point $x \to c$ and a constant of integration).
   - For physics, chemistry, and engineering courses, verify dimensional homogeneity on both sides of every equation and include SI units in numerical substitutions and final answers.

4. **Independent Numerical and Symbolic Verification:**
   - Substitute the final answer or an independent test value back into the original problem statement (and record this check in `workedExamplePayload.verification`).
   - For multiple-choice formative checks, verify that:
     - Exactly one option evaluates to the true result.
     - No distractor becomes accidentally equivalent to the correct answer under an alternate algebraic simplification.
     - Each distractor corresponds to a specific, identifiable student error (such as sign flip, omitted chain-rule factor, or boundary mistake) explained in `formativeCheckPayload.explanation`.

5. **LaTeX Render Safety (Article and Diktat PDF):**
   - Use standard KaTeX-compatible commands (`\frac`, `\sqrt`, `\lim`, `\sum`, `\int`, `\left`, `\right`, `\begin{aligned}...\end{aligned}`, `\begin{cases}...\end{cases}`).
   - Avoid unsupported custom TeX macros (`\newcommand`, `\def`), unescaped `%` or `&` outside alignment environments, or overly wide single-line display equations that would trigger `FORMULA_RENDER_ERROR` or `LAYOUT_OVERFLOW` during A4 Diktat PDF rendering.
