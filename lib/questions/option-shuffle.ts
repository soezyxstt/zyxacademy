import {
  UnshuffledQuestionDraft,
  UnshuffledDraftOption,
  ShuffledQuestion,
  DistractorProvenanceRecord,
} from "./contracts";

/**
 * Seeded PRNG for deterministic option shuffling (Mulberry32).
 */

export function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let m = result.length;
  let t: T;
  let i: number;

  let state = seed >>> 0;
  function random() {
    state = (state + 0x6d2b79f5) | 0;
    let r = Math.imul(state ^ (state >>> 15), 1 | state);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }

  while (m) {
    i = Math.floor(random() * m--);
    t = result[m];
    result[m] = result[i];
    result[i] = t;
  }

  return result;
}

/**
 * Shuffles question options deterministically using stable option IDs.
 * Recomputes correctIndices, stableOptionIds, and distractor provenances after shuffle.
 * Enforces strict STOP condition against desynchronization.
 */
export function shuffleQuestionOptions(
  draft: UnshuffledQuestionDraft,
  seed: number,
  inputProvenances: DistractorProvenanceRecord[] = []
): ShuffledQuestion {
  if (!draft.options || draft.options.length === 0) {
    throw new Error("Cannot shuffle empty options list.");
  }

  // 1. Perform deterministic shuffle of UnshuffledDraftOption array
  const shuffledDraftOptions = seededShuffle<UnshuffledDraftOption>(draft.options, seed);

  // 2. Derive new display options, correctIndices, and stableOptionIds
  const displayOptions: string[] = [];
  const correctIndices: number[] = [];
  const stableOptionIds: string[] = [];

  shuffledDraftOptions.forEach((opt, newIndex) => {
    displayOptions.push(opt.text);
    stableOptionIds.push(opt.id);
    if (opt.isCorrect) {
      correctIndices.push(newIndex);
    }
  });

  // 3. STOP Condition Check: Verify answer synchronization
  const originalCorrectCount = draft.options.filter((o) => o.isCorrect).length;
  if (correctIndices.length !== originalCorrectCount) {
    throw new Error(
      `STOP CONDITION: Option shuffle desynchronized correct indices count (${correctIndices.length} vs expected ${originalCorrectCount}).`
    );
  }

  for (const idx of correctIndices) {
    const optAtIdx = shuffledDraftOptions[idx];
    if (!optAtIdx || !optAtIdx.isCorrect) {
      throw new Error(
        `STOP CONDITION: Index ${idx} in correctIndices does not correspond to a correct option after shuffle.`
      );
    }
  }

  // 4. Remap distractor provenances to new display optionIndex based on stableOptionId
  const remappedProvenances: DistractorProvenanceRecord[] = [];
  const optionIdToNewIndex = new Map<string, number>();
  shuffledDraftOptions.forEach((opt, idx) => {
    optionIdToNewIndex.set(opt.id, idx);
  });

  for (const prov of inputProvenances) {
    const newIdx = optionIdToNewIndex.get(prov.stableOptionId);
    if (newIdx !== undefined) {
      // Don't map correct options as distractors
      const isCorrectNow = correctIndices.includes(newIdx);
      if (!isCorrectNow) {
        remappedProvenances.push({
          ...prov,
          optionIndex: newIdx,
        });
      }
    }
  }

  return {
    slotId: draft.slotId,
    knowledgeObjectId: draft.knowledgeObjectId,
    ideaIds: draft.ideaIds,
    requiredIdeaRelations: draft.requiredIdeaRelations,
    prompt: draft.prompt,
    options: displayOptions,
    correctIndices,
    explanation: draft.explanation,
    stableOptionIds,
    distractorProvenances: remappedProvenances,
    shuffleSeed: seed,
    bloomLevel: draft.bloomLevel,
    pattern: draft.pattern,
    applicationLevel: draft.applicationLevel,
    estimatedSteps: draft.estimatedSteps,
  };
}

export function stableOptionIdsToIndices(
  stableOptionIds: readonly string[],
  selectedStableOptionIds: readonly string[],
): number[] {
  const indexById = new Map(stableOptionIds.map((id, index) => [id, index]));
  const indices = selectedStableOptionIds.map((id) => indexById.get(id));
  if (indices.some((index) => index === undefined)) {
    throw new Error("Answer contains an unknown stable option ID");
  }
  return [...new Set(indices as number[])].sort((left, right) => left - right);
}

export function indicesToStableOptionIds(
  stableOptionIds: readonly string[],
  selectedIndices: readonly number[],
): string[] {
  const ids = selectedIndices.map((index) => stableOptionIds[index]);
  if (ids.some((id) => !id)) throw new Error("Answer contains an invalid option index");
  return [...new Set(ids)];
}
