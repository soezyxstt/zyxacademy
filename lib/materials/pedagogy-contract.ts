import { z } from "zod";
import { inspectPayloadSecurity } from "./visual-contract";

export const workedExampleStepSchema = z
  .object({
    stepIndex: z.number().int().nonnegative(),
    label: z.string().trim().min(1),
    explanation: z.string().trim().min(1),
    reason: z.string().trim().min(1),
  })
  .strict();
export type WorkedExampleStep = z.infer<typeof workedExampleStepSchema>;

export const workedExamplePayloadSchema = z
  .object({
    steps: z.array(workedExampleStepSchema).min(1),
    verification: z.string().trim().min(1),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const secCheck = inspectPayloadSecurity(payload);
    if (!secCheck.safe) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: secCheck.reason ?? "Security check failed for worked example payload",
      });
    }
    const indexes = payload.steps.map((s) => s.stepIndex);
    const sorted = [...indexes].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Worked example step indexes must be contiguous starting from 0, expected ${i} but got ${sorted[i]}`,
          path: ["steps", i, "stepIndex"],
        });
        break;
      }
    }
  });
export type WorkedExamplePayload = z.infer<typeof workedExamplePayloadSchema>;

export const formativeCheckKindSchema = z.enum([
  "multiple_choice",
  "short_answer",
  "numeric_answer",
  "conceptual_explanation",
]);
export type FormativeCheckKind = z.infer<typeof formativeCheckKindSchema>;

export const formativeCheckOptionSchema = z
  .object({
    id: z.string().trim().min(1),
    text: z.string().trim().min(1),
    isCorrect: z.boolean(),
  })
  .strict();
export type FormativeCheckOption = z.infer<typeof formativeCheckOptionSchema>;

const formativeTextNormalizationSchema = z.enum([
  "trim_casefold",
  "trim_casefold_collapse_whitespace",
]);
export type FormativeTextNormalization = z.infer<typeof formativeTextNormalizationSchema>;

const formativeChoiceEvaluationSchema = z
  .object({
    mode: z.literal("choice"),
  })
  .strict();

const formativeTextExactEvaluationSchema = z
  .object({
    mode: z.literal("text_exact"),
    acceptableAnswers: z.array(z.string().trim().min(1)).min(1),
    normalization: formativeTextNormalizationSchema,
  })
  .strict()
  .superRefine((evaluation, ctx) => {
    const normalized = evaluation.acceptableAnswers.map((answer) => {
      const folded = answer.trim().toLocaleLowerCase("id-ID");
      return evaluation.normalization === "trim_casefold_collapse_whitespace"
        ? folded.replace(/\s+/g, " ")
        : folded;
    });
    if (new Set(normalized).size !== normalized.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "acceptableAnswers must be unique after normalization",
        path: ["acceptableAnswers"],
      });
    }
  });

const formativeNumericEvaluationSchema = z
  .object({
    mode: z.literal("numeric"),
    target: z.number().finite(),
    absoluteTolerance: z.number().finite().nonnegative(),
    unit: z.string().trim().min(1).optional(),
  })
  .strict();

const formativeAiRubricCriterionSchema = z
  .object({
    id: z.string().trim().min(1),
    description: z.string().trim().min(1),
    weight: z.number().finite().positive(),
  })
  .strict();

const formativeAiRubricEvaluationSchema = z
  .object({
    mode: z.literal("ai_rubric"),
    criteria: z.array(formativeAiRubricCriterionSchema).min(1),
    requiredConcepts: z.array(z.string().trim().min(1)).min(1),
    misconceptionSignals: z.array(z.string().trim().min(1)),
  })
  .strict()
  .superRefine((evaluation, ctx) => {
    const criterionIds = evaluation.criteria.map((criterion) => criterion.id);
    if (new Set(criterionIds).size !== criterionIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI rubric criterion IDs must be unique",
        path: ["criteria"],
      });
    }

    const weightTotal = evaluation.criteria.reduce((total, criterion) => total + criterion.weight, 0);
    if (Math.abs(weightTotal - 1) > 0.000001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI rubric criterion weights must sum to 1",
        path: ["criteria"],
      });
    }
  });

export const formativeCheckEvaluationSchema = z.discriminatedUnion("mode", [
  formativeChoiceEvaluationSchema,
  formativeTextExactEvaluationSchema,
  formativeNumericEvaluationSchema,
  formativeAiRubricEvaluationSchema,
]);
export type FormativeCheckEvaluation = z.infer<typeof formativeCheckEvaluationSchema>;

export const formativeCheckFeedbackPolicySchema = z
  .object({
    hints: z.array(z.string().trim().min(1)).max(3),
    allowRetry: z.boolean(),
  })
  .strict();
export type FormativeCheckFeedbackPolicy = z.infer<typeof formativeCheckFeedbackPolicySchema>;

export const formativeCheckPayloadSchema = z
  .object({
    checkKind: formativeCheckKindSchema,
    answer: z.string().trim().min(1),
    explanation: z.string().trim().min(1),
    options: z.array(formativeCheckOptionSchema).optional(),
    evaluation: formativeCheckEvaluationSchema.optional(),
    feedbackPolicy: formativeCheckFeedbackPolicySchema.optional(),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const secCheck = inspectPayloadSecurity(payload);
    if (!secCheck.safe) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: secCheck.reason ?? "Security check failed for formative check payload",
      });
    }
    if (payload.checkKind === "multiple_choice") {
      if (!payload.options || payload.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Multiple choice formative checks require at least two options",
          path: ["options"],
        });
      } else {
        const optionIds = payload.options.map((o) => o.id);
        if (new Set(optionIds).size !== optionIds.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Multiple choice option IDs must be unique",
            path: ["options"],
          });
        }
        const correctCount = payload.options.filter((o) => o.isCorrect).length;
        if (correctCount !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Multiple choice formative check must have exactly one correct option",
            path: ["options"],
          });
        }
      }
    }

    if (!payload.evaluation) return;

    const expectedModeByKind: Record<FormativeCheckKind, FormativeCheckEvaluation["mode"]> = {
      multiple_choice: "choice",
      short_answer: "text_exact",
      numeric_answer: "numeric",
      conceptual_explanation: "ai_rubric",
    };
    const expectedMode = expectedModeByKind[payload.checkKind];
    if (payload.evaluation.mode !== expectedMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${payload.checkKind} formative checks require evaluation mode ${expectedMode}`,
        path: ["evaluation", "mode"],
      });
    }
  });
export type FormativeCheckPayload = z.infer<typeof formativeCheckPayloadSchema>;

export const learningObjectiveRefSchema = z
  .object({
    id: z.string().trim().min(1),
    description: z.string().trim().min(1),
    explanationBlockIds: z.array(z.string().trim().min(1)).min(1),
    formativeCheckBlockIds: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();
export type LearningObjectiveRef = z.infer<typeof learningObjectiveRefSchema>;

export const prerequisiteRefSchema = z
  .object({
    id: z.string().trim().min(1),
    type: z.enum(["section", "idea", "external"]),
    label: z.string().trim().min(1),
    supportBlockIds: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();
export type PrerequisiteRef = z.infer<typeof prerequisiteRefSchema>;

export const symbolIntroductionSchema = z
  .object({
    symbol: z.string().trim().min(1),
    meaning: z.string().trim().min(1),
    condition: z.string().trim().min(1).optional(),
    introductionBlockId: z.string().trim().min(1),
  })
  .strict();
export type SymbolIntroduction = z.infer<typeof symbolIntroductionSchema>;

export const learningTimeEstimateSchema = z
  .object({
    readingMinutes: z.number().int().nonnegative(),
    examplesMinutes: z.number().int().nonnegative(),
    practiceMinutes: z.number().int().nonnegative(),
  })
  .strict();
export type LearningTimeEstimate = z.infer<typeof learningTimeEstimateSchema>;

export const visualRequirementSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("required"),
      visualIds: z.array(z.string().trim().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("not_required"),
      reason: z.string().trim().min(1),
    })
    .strict(),
]);
export type VisualRequirement = z.infer<typeof visualRequirementSchema>;

export const sectionPedagogyMetadataSchema = z
  .object({
    objectives: z.array(learningObjectiveRefSchema).min(1),
    prerequisites: z.array(prerequisiteRefSchema).default([]),
    symbols: z.array(symbolIntroductionSchema).default([]),
    timeEstimate: learningTimeEstimateSchema,
    visualRequirement: visualRequirementSchema,
  })
  .strict()
  .superRefine((meta, ctx) => {
    const secCheck = inspectPayloadSecurity(meta);
    if (!secCheck.safe) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: secCheck.reason ?? "Security check failed for section pedagogy metadata",
      });
    }

    const objIds = meta.objectives.map((o) => o.id);
    if (new Set(objIds).size !== objIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Section objective IDs must be unique within section",
        path: ["objectives"],
      });
    }

    const prereqIds = meta.prerequisites.map((p) => p.id);
    if (new Set(prereqIds).size !== prereqIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Section prerequisite IDs must be unique within section",
        path: ["prerequisites"],
      });
    }

    const symbols = meta.symbols.map((s) => s.symbol);
    if (new Set(symbols).size !== symbols.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Section symbols must be unique within section",
        path: ["symbols"],
      });
    }
  });
export type SectionPedagogyMetadata = z.infer<typeof sectionPedagogyMetadataSchema>;

export interface PedagogyReferenceValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSectionPedagogyReferences(params: {
  sectionId: string;
  sectionBlocks: readonly { id: string; blockType: string }[];
  pedagogy?: SectionPedagogyMetadata;
  availableSectionIds: readonly string[];
  availableVisualIds: readonly string[];
}): PedagogyReferenceValidationResult {
  const errors: string[] = [];
  const { sectionId, sectionBlocks, pedagogy, availableSectionIds, availableVisualIds } = params;
  if (!pedagogy) return { valid: true, errors: [] };

  const sectionBlockMap = new Map(sectionBlocks.map((b) => [b.id, b.blockType]));
  const sectionSet = new Set(availableSectionIds);
  const visualSet = new Set(availableVisualIds);

  for (const obj of pedagogy.objectives) {
    for (const expId of obj.explanationBlockIds) {
      const type = sectionBlockMap.get(expId);
      if (!type) {
        errors.push(
          `PEDAGOGY_DANGLING_EXPLANATION_BLOCK: Objective ${obj.id} references missing explanation block ${expId}`,
        );
      } else if (type !== "explanation") {
        errors.push(
          `PEDAGOGY_BLOCK_TYPE_MISMATCH: Objective ${obj.id} explanationBlockId ${expId} has blockType '${type}', expected 'explanation'`,
        );
      }
    }
    for (const chkId of obj.formativeCheckBlockIds) {
      const type = sectionBlockMap.get(chkId);
      if (!type) {
        errors.push(
          `PEDAGOGY_DANGLING_FORMATIVE_CHECK_BLOCK: Objective ${obj.id} references missing formative check block ${chkId}`,
        );
      } else if (type !== "retrieval_prompt" && type !== "retrieval_close") {
        errors.push(
          `PEDAGOGY_BLOCK_TYPE_MISMATCH: Objective ${obj.id} formativeCheckBlockId ${chkId} has blockType '${type}', expected 'retrieval_prompt' or 'retrieval_close'`,
        );
      }
    }
  }

  for (const prereq of pedagogy.prerequisites) {
    for (const supId of prereq.supportBlockIds) {
      if (!sectionBlockMap.has(supId)) {
        errors.push(
          `PEDAGOGY_DANGLING_SUPPORT_BLOCK: Prerequisite ${prereq.id} references missing support block ${supId}`,
        );
      }
    }
    if (prereq.type === "section") {
      if (prereq.id === sectionId) {
        errors.push(
          `PEDAGOGY_SELF_PREREQUISITE: Section ${sectionId} cannot reference itself as prerequisite`,
        );
      } else if (!sectionSet.has(prereq.id)) {
        errors.push(
          `PEDAGOGY_DANGLING_SECTION_REFERENCE: Section ${sectionId} references missing section ${prereq.id}`,
        );
      }
    }
  }

  for (const sym of pedagogy.symbols) {
    if (!sectionBlockMap.has(sym.introductionBlockId)) {
      errors.push(
        `PEDAGOGY_DANGLING_SYMBOL_BLOCK: Symbol '${sym.symbol}' references missing introduction block ${sym.introductionBlockId}`,
      );
    }
  }

  if (pedagogy.visualRequirement.status === "required") {
    for (const visualId of pedagogy.visualRequirement.visualIds) {
      if (!visualSet.has(visualId)) {
        errors.push(
          `PEDAGOGY_DANGLING_VISUAL_REFERENCE: Section ${sectionId} references missing visual ${visualId}`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
