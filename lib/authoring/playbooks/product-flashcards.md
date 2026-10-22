# Zyx Product Bundle V4: Atomic Flashcard Authoring Guide

## 1. Purpose and Structure

Flashcards in Zyx use spaced repetition (SM-2) to reinforce long-term retention of atomic concepts, definitions, conditions, and misconception traps after a student reads the Article.

In `product-bundle.v4` (the same flashcard rules apply to legacy V3 revisions):
- Create one `flashcard_set` entity for the chapter (`productType: "flashcard_set"`).
- Create individual `flashcard` entities (`productType: "flashcard"`, `setId` referencing the `flashcard_set.id`).

## 2. Hard Invariants for Flashcards

1. **Strictly One Idea per Flashcard:**
   - Every `flashcard` entity must have `ideaLinks` with length `1` and `weight: 1`:
     ```json
     "ideaLinks": [
       {
         "id": "<published-idea-id>",
         "version": 1,
         "semanticHash": "<64-hex-hash>",
         "weight": 1,
         "role": "primary"
       }
     ]
     ```
   - Never link multiple Ideas to a single `flashcard`. The parent `flashcard_set` aggregates all covered Ideas with positive weights summing to `1`.
2. **Minimum Information Principle (Atomicity):**
   - Each card tests exactly one cognitive target: a definition condition, a theorem hypothesis, a formula component, a geometric interpretation, or a single misconception contrast.
   - Never write multi-part essay questions or long multi-step calculations on a flashcard.
3. **Self-Contained Front (`front` / `prompt`) and Concise Back (`back` / `answer`):**
   - The front must specify enough context (domain, variable meanings, function assumptions) that there is one unambiguous answer.
   - Avoid vague fronts like "Apa bunyi teorema limit?" when there are five limit theorems. Instead, ask specifically: "Syarat apa yang harus dipenuhi oleh $\lim_{x \to c} g(x)$ agar aturan limit hasil bagi $\lim_{x \to c} \frac{f(x)}{g(x)} = \frac{\lim_{x \to c} f(x)}{\lim_{x \to c} g(x)}$ berlaku?"
   - Keep the back concise (1 to 3 sentences + clean LaTeX formula) so a student can self-grade recall in under 15 seconds.

## 3. Recommended Card Mix per Chapter

Aim for balanced coverage across the published Ideas of the chapter:
1. **Concept & Definition Cards:** Test core definitions and the exact role of quantifiers or domain conditions.
2. **Condition & Hypothesis Cards ("Why does this condition exist?"):** Test what breaks when a hypothesis is omitted (for example, why $0 < |x - c| < \delta$ requires $0 < |x - c|$).
3. **Pattern Recognition Cards:** Present a mathematical form or physical setup and ask which method or principle applies first, without requiring heavy arithmetic.
4. **Misconception Trap Cards:** Present a common false statement and ask why it fails or what counterexample disproves it.

## 4. Formatting and Hygiene

- Use valid inline LaTeX (`$...$`) for all variables, equations, and inequalities.
- Never include internal Idea codes (`MA-CP3-01`), database IDs (`idea-...`), or source chunk IDs on the front or back of any card.
- Ensure every `flashcard` includes valid `sourceRefs` matching active source excerpts from the chapter.
