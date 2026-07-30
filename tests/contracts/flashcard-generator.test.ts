import { describe, expect, it } from "bun:test";

process.env.MOCK_GEMINI = "true";
import { FlashcardContractV2Schema } from "@/lib/flashcards/contracts";
import { validateFlashcardAtomicity } from "@/lib/flashcards/validator";

describe("Flashcard Active-Recall Contract Tests (Plan 013)", () => {
  it("AI-FC-ATOM-001: Enforces single atomic recall target and rejects multi-target fronts", () => {
    const validCard = FlashcardContractV2Schema.parse({
      id: "fc-101",
      recallTarget: "Definisi Turunan",
      promptType: "definition",
      front: "Apakah definisi dari turunan fungsi f(x)?",
      canonicalAnswer: "Laju perubahan instantan fungsi terhadap variabel bebasnya.",
      atomicKeyPoints: ["Laju perubahan instantan"],
      acceptableVariants: ["Limit dari [f(x+h) - f(x)] / h saat h mendekati 0"],
      nonAcceptedConfusions: ["Luas daerah di bawah kurva"],
      sourceKoIds: ["ko-turunan-1"],
      sourceSpanIds: ["span-1"],
      contentComplexity: "medium",
    });

    const valResult = validateFlashcardAtomicity(validCard);
    expect(valResult.isValid).toBe(true);

    const multiTargetCard = {
      ...validCard,
      front: "Apakah definisi turunan serta sebutkan rumus integral sekaligus?",
    };

    const multiValResult = validateFlashcardAtomicity(multiTargetCard);
    expect(multiValResult.isValid).toBe(false);
    expect(multiValResult.errors.some((e) => e.includes("multiple interrogative targets"))).toBe(true);
  });

  it("AI-FC-SRC-002: Requires KO anchoring and source span provenance", () => {
    const cardWithoutKo = {
      id: "fc-102",
      recallTarget: "Rumus Limit",
      promptType: "formula",
      front: "Tuliskan rumus limit fungsi.",
      canonicalAnswer: "lim_{x->a} f(x) = L",
      atomicKeyPoints: ["lim_{x->a}"],
      sourceKoIds: [], // Invalid: empty
      contentComplexity: "easy",
    };

    const valResult = validateFlashcardAtomicity(cardWithoutKo);
    expect(valResult.isValid).toBe(false);
  });

  it("AI-FC-COMP-003: Separates content complexity from observed learner difficulty", () => {
    const card = FlashcardContractV2Schema.parse({
      id: "fc-103",
      recallTarget: "Aturan Rantai",
      promptType: "formula",
      front: "Bagaimanakah rumus aturan rantai turunan f(g(x))?",
      canonicalAnswer: "f'(g(x)) * g'(x)",
      atomicKeyPoints: ["f'(g(x)) * g'(x)"],
      sourceKoIds: ["ko-rantai"],
      contentComplexity: "high",
    });

    expect(card.contentComplexity).toBe("high");
    // Learner difficulty is not stored as a model confidence label on the card schema itself
    expect((card as any).learnerDifficulty).toBeUndefined();
  });
});
