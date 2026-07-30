import {
  BlueprintSlot,
  BlueprintSlotSchema,
  AssessmentBlueprint,
  CognitiveProcess,
  DifficultyTarget,
  ReasoningPattern,
  ItemFormat,
  AnswerCardinality,
  MisconceptionFamily,
} from "./contracts";
import { randomUUID } from "crypto";

/**
 * Seeded Pseudo-Random Number Generator (Mulberry32)
 */
export function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Validates a single BlueprintSlot against impossible combinations and STOP conditions.
 */
export function validateSlot(slot: BlueprintSlot): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // STOP Condition: Must have valid knowledgeObjectId
  if (!slot.knowledgeObjectId || slot.knowledgeObjectId.trim() === "") {
    errors.push("STOP CONDITION: Blueprint slot has no sourced Knowledge Object ID.");
  }

  // Schema validation
  const schemaResult = BlueprintSlotSchema.safeParse(slot);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push(`[${issue.path.join(".")}]: ${issue.message}`);
    }
  }

  // Reject impossible format/cardinality combinations
  if (slot.itemFormat === "multiple_choice" && slot.answerCardinality !== "single") {
    errors.push("Single-choice item format must have 'single' answer cardinality.");
  }

  // Bloom level vs difficulty target consistency check
  if (slot.cognitiveProcess === "remember" && slot.difficultyTarget === "hard") {
    errors.push("Impossible slot combination: 'remember' cognitive level with 'hard' target difficulty.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Derives cognitive process, difficulty, and reasoning pattern from a Knowledge Object.
 */
export function generateSlotFromKO(
  ko: {
    id: string;
    learningObjectiveId?: string | null;
    title?: string;
    type?: string;
    difficulty?: string;
    bloomLevel?: string;
    mtdId?: string;
    sourceMtdVersion?: number;
    sourceSectionId?: string;
  },
  slotIndex: number = 0,
  context: "quiz" | "uts" | "uas" | "practice" | "tryout" | "tutorial" = "practice"
): BlueprintSlot {
  if (!ko.id) {
    throw new Error("STOP CONDITION: Blueprint slot creation requires a valid Knowledge Object ID.");
  }

  let cognitiveProcess: CognitiveProcess = "understand";
  let difficultyTarget: DifficultyTarget = "medium";
  let reasoningPattern: ReasoningPattern = "conceptual";
  const itemFormat: ItemFormat = "multiple_choice";
  const answerCardinality: AnswerCardinality = "single";

  const koType = (ko.type || "definition").toLowerCase();

  switch (koType) {
    case "definition":
      cognitiveProcess = "understand";
      difficultyTarget = "easy";
      reasoningPattern = "conceptual";
      break;
    case "formula":
      cognitiveProcess = "apply";
      difficultyTarget = "medium";
      reasoningPattern = "direct_computation";
      break;
    case "misconception":
      cognitiveProcess = "analyze";
      difficultyTarget = "medium";
      reasoningPattern = "parameter_analysis";
      break;
    case "concept_overview":
    case "summary":
    case "objective":
      cognitiveProcess = "evaluate";
      difficultyTarget = "hard";
      reasoningPattern = "modeling";
      break;
    case "example":
    case "exercise":
      cognitiveProcess = "apply";
      difficultyTarget = (ko.difficulty as DifficultyTarget) || "medium";
      reasoningPattern = "procedural";
      break;
    default:
      cognitiveProcess = "understand";
      difficultyTarget = "medium";
      reasoningPattern = "conceptual";
      break;
  }

  // Override with explicit properties if set
  if (ko.difficulty && ["easy", "medium", "hard"].includes(ko.difficulty)) {
    difficultyTarget = ko.difficulty as DifficultyTarget;
  }

  if (
    ko.bloomLevel &&
    ["remember", "understand", "apply", "analyze", "evaluate", "create"].includes(ko.bloomLevel)
  ) {
    cognitiveProcess = ko.bloomLevel as CognitiveProcess;
  }

  const targetedMisconceptions: Array<{
    optionId: string;
    family: MisconceptionFamily;
    description: string;
  }> = [
    { optionId: "opt_1", family: "calc_error", description: "Calculation or algebraic error" },
    { optionId: "opt_2", family: "unit_error", description: "Unit conversion or scaling error" },
    { optionId: "opt_3", family: "vocab_swap", description: "Term or related concept swap" },
  ];

  const slot: BlueprintSlot = {
    slotId: `slot-${slotIndex + 1}-${randomUUID().slice(0, 8)}`,
    learningObjectiveId: ko.learningObjectiveId || `lo-${ko.id}`,
    knowledgeObjectId: ko.id,
    cognitiveProcess,
    difficultyTarget,
    difficultyBasis: `Derived from KO type '${koType}' and explicit metadata`,
    reasoningPattern,
    itemFormat,
    answerCardinality,
    targetedMisconceptions,
    sourceRequirements: {
      sourceSectionId: ko.sourceSectionId,
      sourceMtdId: ko.mtdId,
      sourceMtdVersion: ko.sourceMtdVersion || 1,
    },
    assessmentContext: context,
    releasePolicy: "immediate",
  };

  const validation = validateSlot(slot);
  if (!validation.valid) {
    throw new Error(`Invalid generated slot: ${validation.errors.join("; ")}`);
  }

  return slot;
}

/**
 * Builds a full deterministic assessment blueprint for a set of KOs.
 */
export function buildAssessmentBlueprint(input: {
  courseId: string;
  chapterId?: string;
  kos: Array<{
    id: string;
    learningObjectiveId?: string | null;
    title?: string;
    type?: string;
    difficulty?: string;
    bloomLevel?: string;
    mtdId?: string;
    sourceMtdVersion?: number;
    sourceSectionId?: string;
  }>;
  requestedCount: number;
  seed?: number;
  context?: "quiz" | "uts" | "uas" | "practice" | "tryout" | "tutorial";
}): AssessmentBlueprint {
  const { courseId, chapterId, kos, requestedCount } = input;
  const seed = input.seed ?? 42;
  const rng = createSeededRandom(seed);
  const context = input.context ?? "practice";

  if (kos.length === 0) {
    throw new Error("Cannot build blueprint with empty KOs array.");
  }

  // Verify all KOs have valid IDs
  for (const ko of kos) {
    if (!ko.id || ko.id.trim() === "") {
      throw new Error("STOP CONDITION: All KOs in blueprint input must have a valid ID.");
    }
  }

  const slots: BlueprintSlot[] = [];
  const crossDimensionCounts: Record<string, number> = {};

  // Build slots up to requested count using deterministic rotation over input KOs
  for (let i = 0; i < requestedCount; i++) {
    const koIndex = i % kos.length;
    const ko = kos[koIndex];

    const slot = generateSlotFromKO(ko, i, context);

    // Apply minor deterministic jitter to difficulty distribution if needed for multi-question batches
    if (requestedCount > 1 && kos.length === 1) {
      if (i % 3 === 0) {
        slot.difficultyTarget = "easy";
        slot.cognitiveProcess = "understand";
      } else if (i % 3 === 2) {
        slot.difficultyTarget = "hard";
        slot.cognitiveProcess = "analyze";
      }
    }

    const validation = validateSlot(slot);
    if (!validation.valid) {
      throw new Error(`Slot validation failed: ${validation.errors.join("; ")}`);
    }

    slots.push(slot);

    // Accumulate cross-dimension cell count
    const cellKey = `${slot.cognitiveProcess}:${slot.difficultyTarget}:${slot.reasoningPattern}`;
    crossDimensionCounts[cellKey] = (crossDimensionCounts[cellKey] || 0) + 1;
  }

  // Small batch tolerances
  const maxAllowedPerKO = Math.ceil(requestedCount / Math.max(1, kos.length)) + 1;

  return {
    blueprintId: `bp-${randomUUID()}`,
    version: "2.0",
    courseId,
    chapterId,
    seed,
    slots,
    crossDimensionCounts,
    tolerances: {
      minEasyRatio: 0.1,
      maxHardRatio: 0.5,
      maxAllowedPerKO,
    },
  };
}
