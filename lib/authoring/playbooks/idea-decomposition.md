# Zyx Idea Bundle V3: Pedagogical Decomposition and Graph Design Guide

## 1. Designing `learningSections` (Subtopik Pembelajaran)

Before extracting individual Ideas, partition the chapter into a coherent sequence of `learningSections`:
1. **Learner-Centric Progression:** Order sections (`orderIndex: 0, 1, 2, ...`) from foundational intuition and definitions to core theorems/methods, then applications and synthesis.
2. **Scope per Section:** A section should represent one focused study session (typically 15 to 35 minutes, 3 to 10 atomic Ideas) that will later map 1-to-1 to a `topic` section in Product Bundle V3 Articles.
3. **Clear Learning Objective:** Write `learningObjective` in Indonesian using measurable action verbs (for example, "Menjelaskan definisi formal limit $\varepsilon$-$\delta$ dan membuktikan limit fungsi linier serta kuadratik").

## 2. Atomic Idea Granularity Rules

An Idea (`ide`) is the smallest independently testable and teachable unit of knowledge:
1. **One Concept per Idea:** Never bundle a definition, two theorems, and a computational procedure into a single Idea. Split them into distinct Ideas connected by `idea-relations.json`.
2. **Self-Contained `canonicalStatement`:**
   - Must state the exact claim, definition, formula, or procedure clearly in Indonesian without requiring the reader to guess missing quantifiers, domains, or conditions.
   - Example (Good): "Untuk fungsi $f(x)$ yang terdefinisi pada selang terbuka di sekitar $c$ (kecuali mungkin di $c$), $\lim_{x \to c} f(x) = L$ berarti untuk setiap $\varepsilon > 0$ terdapat $\delta > 0$ sehingga jika $0 < |x - c| < \delta$, maka $|f(x) - L| < \varepsilon$."
   - Example (Bad): "Definisi limit epsilon delta." (This is a label, not a canonical statement.)
3. **`conciseExplanation`:**
   - Provide 2 to 4 sentences explaining the intuition, geometric/physical meaning, why the conditions matter (for example, why $0 < |x - c|$ excludes $x = c$), and how it connects to adjacent concepts.
4. **`latex` Field:**
   - When the Idea involves a primary mathematical formula, identity, or symbolic condition, populate `latex` with the clean canonical LaTeX expression (without surrounding `$$` delimiters if the schema expects raw LaTeX, or consistent with existing course Ideas).

## 3. Classification Enums

Assign accurate metadata to every Idea:
- **`knowledgeKind`:**
  - `"definition"`: Formal definition, notation convention, or domain classification.
  - `"theorem"` or `"principle"` / `"concept"`: Fundamental law, theorem, lemma, property, or conceptual principle.
  - `"procedure"`: Step-by-step algorithm, calculation method, or problem-solving technique.
  - `"example"` / `"application"`: Canonical worked archetype or physical/domain modeling pattern.
  - `"misconception"` / `"condition"`: Boundary condition, domain restriction, or common conceptual trap.
  *(Check `workflow.get_contract` or validator enum diagnostics for exact permitted enum literals.)*
- **`instructionalRole`:**
  - `"foundation"` / `"prerequisite"`: Required baseline concept.
  - `"core"`: Central concept of the chapter that every student must master.
  - `"supporting"` / `"worked_pattern"`: Method or bridge concept that supports core mastery.
  - `"extension"` / `"enrichment"`: Advanced case, proof detail, or boundary nuance.
- **`difficultyMetadata`:**
  - Include `{ "level": "easy" | "medium" | "hard", "cognitiveLoad": "low" | "moderate" | "high", "rationale": "..." }`.

## 4. Source Coverage and Provenance Quality Gates

`evaluateIdeaBundleQuality` enforces strict source grounding:
1. **Meaningful Source Coverage:** Chunks in `source-chunks.json` must cover the substantive sections and units of every Source Pack document. Do not cherry-pick only the first two pages of a 20-page slide deck.
2. **Non-Trivial Excerpts:** Each source chunk must contain the actual definition, derivation, or example text from the Source Pack Markdown, not just a section heading.
3. **Formula Traceability:** Major formulas present in the Source Pack must be represented in the extracted Ideas and their provenance chunks.
4. **No Duplicate Ideas:** Every Idea must have a distinct `code`, `stableKey`, and `semanticHash`. Do not create near-duplicate Ideas with slightly reworded statements.

## 5. Idea Relations and DAG Integrity

1. **Connected Graph:** Avoid isolated Ideas unless a chapter genuinely has a standalone note. Connect definitions to the theorems and procedures that depend on them (`relationType: "prerequisite"`).
2. **Strict Acyclicity:** Verify topological ordering across all `prerequisite` edges before packaging the ZIP. If $A$ is a prerequisite of $B$ and $B$ is a prerequisite of $C$, $C$ cannot be a prerequisite of $A$.
3. **Meaningful `explanation`:** Every relation edge must explain *why* the source Idea is required for or elaborates the target Idea.
