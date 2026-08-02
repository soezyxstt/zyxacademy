import { createHash } from "node:crypto";
import { z } from "zod";

export const assessmentTypeSchema = z.enum(["quiz", "tryout"]);
export type AssessmentType = z.infer<typeof assessmentTypeSchema>;

export const blueprintDimensionSchema = z.record(z.string().min(1), z.number().finite().nonnegative());

export const assessmentBlueprintInputSchema = z.object({
  assessmentType: assessmentTypeSchema,
  chapterIds: z.array(z.string().min(1)).min(1),
  itemCount: z.number().int().positive(),
  seed: z.number().int(),
  dimensions: z.object({
    ideaCoverage: blueprintDimensionSchema,
    difficulty: blueprintDimensionSchema,
    cognitiveLevel: blueprintDimensionSchema,
    reasoningPattern: blueprintDimensionSchema,
    relationUse: blueprintDimensionSchema,
    questionType: blueprintDimensionSchema,
  }),
  version: z.string().min(1).default("1.0"),
});

export type AssessmentBlueprintInput = z.input<typeof assessmentBlueprintInputSchema>;
export type BlueprintDimensions = z.infer<typeof assessmentBlueprintInputSchema>["dimensions"];

export interface RoundedDimension {
  key: string;
  requested: number;
  allocated: number;
  remainder: number;
}

export interface AssessmentBlueprint {
  version: string;
  assessmentType: AssessmentType;
  chapterIds: string[];
  itemCount: number;
  seed: number;
  dimensions: Record<keyof BlueprintDimensions, Record<string, number>>;
  blueprintHash: string;
}

export interface AssessmentItemCandidate {
  id: string;
  version: number;
  chapterId: string;
  status?: string;
  isStale?: boolean;
  ideaIds: string[];
  difficulty?: string;
  cognitiveLevel?: string;
  reasoningPattern?: string;
  relationUse?: string;
  questionType?: string;
  solverStatus?: "accepted" | "needs_review" | "rejected";
  criticStatus?: "accepted" | "needs_review" | "rejected";
}

export interface SelectedAssessmentItem extends AssessmentItemCandidate {
  selectionRank: number;
}

export interface IndependentQuestionDimensions {
  difficulty: "easy" | "medium" | "hard";
  difficultyBasis: string;
  ideaIds: readonly string[];
  cognitiveLevel: string;
  reasoningPattern: string;
  applicationLevel: number;
  estimatedSteps: number;
}

const dimensionNames = [
  "ideaCoverage",
  "difficulty",
  "cognitiveLevel",
  "reasoningPattern",
  "relationUse",
  "questionType",
] as const;

export function validateIndependentQuestionDimensions(
  dimensions: IndependentQuestionDimensions,
): string[] {
  const errors: string[] = [];
  if (dimensions.ideaIds.length === 0) errors.push("published questions require one or more Ideas");
  if (!dimensions.difficultyBasis.trim()) errors.push("difficulty requires an independent basis");
  if (/idea\s*count|number\s*of\s*ideas/i.test(dimensions.difficultyBasis)) {
    errors.push("difficulty cannot be derived from Idea count");
  }
  if (!Number.isInteger(dimensions.applicationLevel) || dimensions.applicationLevel < 0 || dimensions.applicationLevel > 5) {
    errors.push("applicationLevel must be an integer from 0 through 5");
  }
  if (!Number.isInteger(dimensions.estimatedSteps) || dimensions.estimatedSteps < 1) {
    errors.push("estimatedSteps must be a positive integer");
  }
  return errors;
}

function assertFiniteNonNegative(value: number, key: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Blueprint dimension ${key} must be finite and non-negative`);
  }
}

/**
 * Allocates an exact item count with the largest-remainder method.
 * Tie-breaking by key keeps a blueprint stable across runtimes.
 */
export function roundDimensionDistribution(
  targets: Record<string, number>,
  itemCount: number,
): Record<string, number> {
  if (!Number.isInteger(itemCount) || itemCount < 1) {
    throw new Error("itemCount must be a positive integer");
  }

  const entries = Object.entries(targets).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return {};

  let total = 0;
  for (const [key, value] of entries) {
    assertFiniteNonNegative(value, key);
    total += value;
  }
  if (total <= 0) throw new Error("At least one blueprint dimension target must be positive");

  const rounded = entries.map(([key, value]) => {
    const requested = (value / total) * itemCount;
    const allocated = Math.floor(requested);
    return { key, requested, allocated, remainder: requested - allocated } satisfies RoundedDimension;
  });

  let remaining = itemCount - rounded.reduce((sum, item) => sum + item.allocated, 0);
  rounded.sort((left, right) => right.remainder - left.remainder || left.key.localeCompare(right.key));
  for (let index = 0; index < rounded.length && remaining > 0; index += 1) {
    rounded[index].allocated += 1;
    remaining -= 1;
  }

  return Object.fromEntries(
    rounded
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((item) => [item.key, item.allocated]),
  );
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function compileAssessmentBlueprint(input: AssessmentBlueprintInput): AssessmentBlueprint {
  const parsed = assessmentBlueprintInputSchema.parse(input);
  if (parsed.assessmentType === "quiz" && parsed.chapterIds.length !== 1) {
    throw new Error("quiz assessments must cover exactly one chapter");
  }
  if (parsed.assessmentType === "tryout" && parsed.chapterIds.length < 1) {
    throw new Error("tryout assessments must cover at least one chapter");
  }

  const dimensions = Object.fromEntries(
    dimensionNames.map((name) => [name, roundDimensionDistribution(parsed.dimensions[name], parsed.itemCount)]),
  ) as AssessmentBlueprint["dimensions"];

  const withoutHash = {
    version: parsed.version,
    assessmentType: parsed.assessmentType,
    chapterIds: [...parsed.chapterIds],
    itemCount: parsed.itemCount,
    seed: parsed.seed,
    dimensions,
  };

  return { ...withoutHash, blueprintHash: stableHash(withoutHash) };
}

function candidateScore(candidate: AssessmentItemCandidate, blueprint: AssessmentBlueprint): string {
  return stableHash({ seed: blueprint.seed, blueprintHash: blueprint.blueprintHash, id: candidate.id });
}

function isEligible(candidate: AssessmentItemCandidate, blueprint: AssessmentBlueprint): boolean {
  return (
    blueprint.chapterIds.includes(candidate.chapterId) &&
    candidate.status !== "retired" &&
    candidate.status !== "draft" &&
    candidate.isStale !== true &&
    candidate.solverStatus !== "rejected" &&
    candidate.solverStatus !== "needs_review" &&
    candidate.criticStatus !== "rejected" &&
    candidate.criticStatus !== "needs_review" &&
    candidate.ideaIds.length > 0
  );
}

/**
 * Selects a reproducible item set. Candidate order, database row order, and
 * JavaScript's random number generator do not affect the result.
 */
export function selectAssessmentItems(
  blueprint: AssessmentBlueprint,
  candidates: AssessmentItemCandidate[],
): SelectedAssessmentItem[] {
  const eligible = candidates
    .filter((candidate) => isEligible(candidate, blueprint))
    .sort((left, right) => candidateScore(left, blueprint).localeCompare(candidateScore(right, blueprint)) || left.id.localeCompare(right.id));

  if (eligible.length < blueprint.itemCount) {
    throw new Error(`Assessment blueprint requires ${blueprint.itemCount} eligible items; found ${eligible.length}`);
  }

  return eligible.slice(0, blueprint.itemCount).map((candidate, index) => ({
    ...candidate,
    selectionRank: index,
  }));
}

export function assertBlueprintItemCount(
  blueprint: AssessmentBlueprint,
  selected: readonly unknown[],
): void {
  if (selected.length !== blueprint.itemCount) {
    throw new Error(`Selected item count ${selected.length} does not equal blueprint item count ${blueprint.itemCount}`);
  }
}
