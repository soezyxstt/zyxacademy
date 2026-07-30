import { FlashcardContractV2, FlashcardContractV2Schema } from "./contracts";

/**
 * Plan 013: Flashcard Atomicity & Integrity Validator
 */

export interface FlashcardValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates that a flashcard complies with the V2 contract and atomicity rules.
 */
export function validateFlashcardAtomicity(card: unknown): FlashcardValidationResult {
  const parseResult = FlashcardContractV2Schema.safeParse(card);
  if (!parseResult.success) {
    return {
      isValid: false,
      errors: parseResult.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
    };
  }

  const data: FlashcardContractV2 = parseResult.data;
  const errors: string[] = [];

  // 1. Atomicity check: Reject fronts asking for multiple unrelated targets via conjunctions
  if (data.front.includes(" sekaligus ") || data.front.includes(" serta sebutkan ")) {
    errors.push("Flashcard front contains multiple interrogative targets and violates atomicity");
  }

  // 2. Source KO requirement
  if (data.sourceKoIds.length === 0) {
    errors.push("Flashcard must be anchored to at least one valid Knowledge Object ID");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
