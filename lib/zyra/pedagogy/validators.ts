import { validateTutorOutput, type ProtectedItemPayload } from "@/lib/assessment-assistance-policy";
import { validateVisualSpec } from "@/lib/tutor/visual-contracts";
import { validateCanvasSpec } from "@/lib/zyra/canvas";
import type { SemanticValidator, SemanticViolation } from "@/lib/ai/validation";
import {
  ZyraTeachingResponseSchema,
  type PedagogyContext,
  type PedagogyPromptInput,
  type ZyraTeachingResponse,
} from "./contracts";
import type { TeachingPlan } from "./state-machine";

export interface TeachingResponseValidationResult {
  valid: boolean;
  violations: SemanticViolation[];
  response?: ZyraTeachingResponse;
}

const PIPELINE_LANGUAGE = /\b(?:system prompt|prompt|pipeline|retriev(?:e|al|ed)?|vector(?:ize)?|semantic cache|cache hit|json|internal validation|model output|ai gateway|canonical runtime|source list|snippet|excerpt)\b/i;
const ACTIVE_ASSESSMENT_SOLUTION_LANGUAGE = /\b(?:jawaban akhir|final answer|solusi lengkap|kunci jawaban|correct option|pilih opsi|hasil akhirnya)\b/i;

function violation(code: string, path: string, message: string): SemanticViolation {
  return { code, path, message, severity: "error" };
}

function validateNoProtectedAnswer(
  response: ZyraTeachingResponse,
  context: PedagogyContext,
  protectedAnswers?: ProtectedItemPayload,
): SemanticViolation[] {
  if (!context.activeAssessment || context.allowDirectAnswerReveal) return [];

  const text = response.learnerFacingText;
  const result = validateTutorOutput(text, protectedAnswers ?? {}, "socratic_only");
  const violations = result.violations.map((code) => violation("ACTIVE_ASSESSMENT_LEAK", "learnerFacingText", code));
  if (ACTIVE_ASSESSMENT_SOLUTION_LANGUAGE.test(text)) {
    violations.push(violation(
      "ACTIVE_ASSESSMENT_LEAK",
      "learnerFacingText",
      "Active assessment responses must stop at the approved scaffold boundary.",
    ));
  }
  return violations;
}

export function validateTeachingResponse(
  response: unknown,
  context: PedagogyContext,
  plan: TeachingPlan,
  allowedSources: ReadonlyMap<string, number>,
  protectedAnswers?: ProtectedItemPayload,
): TeachingResponseValidationResult {
  const parsed = ZyraTeachingResponseSchema.safeParse(response);
  if (!parsed.success) {
    return {
      valid: false,
      violations: [violation("RESPONSE_SCHEMA_INVALID", "$", "The teaching response does not match the typed contract.")],
    };
  }

  const value = parsed.data;
  const violations: SemanticViolation[] = [];

  if (value.selectedState !== plan.state) {
    violations.push(violation("STATE_MISMATCH", "selectedState", "The response changed the server-selected teaching state."));
  }
  if (value.hintLevel !== plan.hintLevel) {
    violations.push(violation("HINT_LEVEL_MISMATCH", "hintLevel", "The response changed the server-selected hint level."));
  }
  if (value.learnerFacingText.length > 5000) {
    violations.push(violation("LEARNER_TEXT_TOO_LONG", "learnerFacingText", "Learner-facing text exceeds the bounded response size."));
  }
  if (PIPELINE_LANGUAGE.test(value.learnerFacingText)) {
    violations.push(violation("PIPELINE_LANGUAGE_LEAK", "learnerFacingText", "Pipeline terminology is not allowed in learner-facing text."));
  }

  const citedIds = new Set<string>();
  for (const citation of value.citations) {
    if (citedIds.has(citation.sourceId)) {
      violations.push(violation("DUPLICATE_CITATION", "citations", "A source may be cited at most once."));
    }
    citedIds.add(citation.sourceId);
    const expectedVersion = allowedSources.get(citation.sourceId);
    if (expectedVersion === undefined || expectedVersion !== citation.sourceVersion) {
      violations.push(violation("INVALID_CITATION", "citations", "Every citation must match an allowed canonical source and version."));
    }
  }

  if (plan.state !== "clarify" && plan.state !== "diagnose" && plan.state !== "orient" && allowedSources.size > 0 && value.citations.length === 0) {
    violations.push(violation("UNSUPPORTED_CLAIM", "citations", "A substantive teaching response requires at least one canonical citation."));
  }
  if (plan.requiresCheckpoint && !value.checkForUnderstanding) {
    violations.push(violation("MISSING_CHECKPOINT", "checkForUnderstanding", "This teaching state requires one check-for-understanding question."));
  }
  if (value.checkForUnderstanding && value.checkForUnderstanding.expectedResponseShape === "unknown") {
    violations.push(violation("CHECKPOINT_SHAPE_MISSING", "checkForUnderstanding.expectedResponseShape", "The checkpoint must describe the expected response shape."));
  }
  if (value.visualSpec) {
    const visual = validateVisualSpec(value.visualSpec, [...allowedSources.keys()]);
    for (const reasonCode of visual.reasonCodes) {
      violations.push(violation("INVALID_VISUAL_CLAIM", "visualSpec", reasonCode));
    }
  }
  if (value.canvasSpec) {
    const canvas = validateCanvasSpec(value.canvasSpec, [...allowedSources.keys()]);
    for (const reasonCode of canvas.reasonCodes) {
      violations.push(violation("INVALID_CANVAS_SPEC", "canvasSpec", reasonCode));
    }
  }
  if (context.misconceptionUncertain && value.diagnosisHypotheses.some((hypothesis) => hypothesis.evidenceSufficiency === "sufficient")) {
    violations.push(violation("UNSUPPORTED_DIAGNOSIS", "diagnosisHypotheses", "An uncertain diagnosis cannot be stored as a supported fact."));
  }

  violations.push(...validateNoProtectedAnswer(value, context, protectedAnswers));
  return { valid: violations.length === 0, violations, response: value };
}

export function createTeachingResponseValidator(
  context: PedagogyContext,
  plan: TeachingPlan,
  allowedSources: ReadonlyMap<string, number>,
  protectedAnswers?: ProtectedItemPayload,
): SemanticValidator<PedagogyPromptInput, ZyraTeachingResponse> {
  return {
    id: "zyra-pedagogy-response",
    version: "3.0.0",
    validate: (response) => validateTeachingResponse(response, context, plan, allowedSources, protectedAnswers).violations,
  };
}

export function pipelineLanguageRegex(): RegExp {
  return PIPELINE_LANGUAGE;
}
