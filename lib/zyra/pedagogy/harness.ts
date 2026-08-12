import type { ProtectedItemPayload } from "@/lib/assessment-assistance-policy";
import { PromptExecutor } from "@/lib/prompt-executor";
import {
  PedagogyPromptInputSchema,
  ZyraTeachingResponseSchema,
  type PedagogyContext,
  type PedagogySource,
  type ZyraTeachingResponse,
} from "./contracts";
import { composeSafeTeachingResponse } from "./composer";
import { buildPedagogyPromptInput, type PedagogyEvidenceInput } from "./prompt-input";
import { selectTeachingPlan, type TeachingPlan } from "./state-machine";
import { createTeachingResponseValidator, validateTeachingResponse } from "./validators";
import { ZYRA_PEDAGOGY_V3_CONTRACT } from "@/prompts/zyra/pedagogy-v3";
import type { ProviderInputPart } from "@/lib/ai/provider/provider-adapter";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import { isZyraCanvasFeatureEnabled } from "@/lib/zyra/canvas";

export interface RunPedagogicalTurnParams {
  userId: string;
  learnerQuestion: string;
  context: PedagogyContext;
  evidence: readonly PedagogyEvidenceInput[];
  protectedAnswers?: ProtectedItemPayload;
  generate?: boolean;
  cacheKey?: string;
  cacheTtlSeconds?: number;
  idempotencyKey?: string;
  imageParts?: readonly ProviderInputPart[];
}

export interface PedagogicalTurnResult {
  response: ZyraTeachingResponse;
  plan: TeachingPlan;
  providerCalls: number;
  usedFallback: boolean;
  outcome: "composed" | "generated" | "rejected";
  violationCodes: string[];
}

function sourceMap(sources: readonly PedagogySource[]): ReadonlyMap<string, number> {
  return new Map(sources.map((source) => [source.id, source.version]));
}

function applyFeatureGates(response: ZyraTeachingResponse): ZyraTeachingResponse {
  if (isZyraCanvasFeatureEnabled(zyraRuntimeEnv.FEATURE_ZYRA_LEARNING_CANVAS_V1)) return response;
  return response.canvasSpec ? { ...response, canvasSpec: null } : response;
}

function safeFallback(
  context: PedagogyContext,
  plan: TeachingPlan,
  input: ReturnType<typeof buildPedagogyPromptInput>,
  reasonCode: string,
): ZyraTeachingResponse {
  const response = composeSafeTeachingResponse(context, plan, input.evidence, reasonCode);
  const check = validateTeachingResponse(response, context, plan, sourceMap(input.evidence));
  if (check.valid && check.response) return check.response;

  return composeSafeTeachingResponse(
    { ...context, evidenceSufficiency: "insufficient" },
    selectTeachingPlan({ ...context, evidenceSufficiency: "insufficient" }),
    [],
    "SAFE_COMPOSITION_VALIDATION_FAILED",
  );
}

export async function runPedagogicalTurn(params: RunPedagogicalTurnParams): Promise<PedagogicalTurnResult> {
  const plan = selectTeachingPlan(params.context);
  const promptInput = buildPedagogyPromptInput(
    params.context,
    plan,
    params.learnerQuestion,
    params.evidence,
    { hasImages: Boolean(params.imageParts?.length) },
  );
  const parsedInput = PedagogyPromptInputSchema.parse(promptInput);
  const allowedSources = sourceMap(parsedInput.evidence);

  if (params.generate === false || parsedInput.evidence.length === 0 || plan.state === "clarify") {
    return {
      response: safeFallback(params.context, plan, parsedInput, parsedInput.evidence.length === 0 ? "NO_EVIDENCE" : "DETERMINISTIC_COMPOSITION"),
      plan,
      providerCalls: 0,
      usedFallback: true,
      outcome: "composed",
      violationCodes: [],
    };
  }

  const contract = {
    ...ZYRA_PEDAGOGY_V3_CONTRACT,
    validators: [createTeachingResponseValidator(params.context, plan, allowedSources, params.protectedAnswers)],
  };
  const result = await PromptExecutor.run({
    userId: params.userId,
    contract,
    variables: parsedInput,
    schema: ZyraTeachingResponseSchema,
    evidenceContext: {
      courseId: params.context.courseId,
      selectedState: plan.state,
      evidenceIds: parsedInput.evidence.map((source) => source.id),
      evidenceVersions: parsedInput.evidence.map((source) => source.version),
    },
    cachePolicy: params.imageParts?.length
      ? "bypass"
      : params.context.activeAssessment ? "active_assessment" : "public_scaffold",
    cacheKey: params.imageParts?.length ? undefined : params.cacheKey,
    cacheTtlSeconds: params.imageParts?.length ? undefined : params.cacheTtlSeconds,
    idempotencyKey: params.idempotencyKey,
    providerParts: params.imageParts,
    maxAttempts: params.imageParts?.length ? 1 : undefined,
  });

  if (result.success && result.data) {
    const validated = validateTeachingResponse(result.data, params.context, plan, allowedSources, params.protectedAnswers);
    if (validated.valid && validated.response) {
      return {
        response: applyFeatureGates(validated.response),
        plan,
        providerCalls: 1,
        usedFallback: false,
        outcome: "generated",
        violationCodes: [],
      };
    }
    const codes = validated.violations.map((item) => item.code);
    return {
      response: safeFallback(params.context, plan, parsedInput, "MODEL_OUTPUT_REJECTED"),
      plan,
      providerCalls: 1,
      usedFallback: true,
      outcome: "rejected",
      violationCodes: codes,
    };
  }

  return {
    response: safeFallback(params.context, plan, parsedInput, "MODEL_OUTPUT_REJECTED"),
    plan,
    providerCalls: 1,
    usedFallback: true,
    outcome: "rejected",
    violationCodes: result.violationCodes.length > 0 ? result.violationCodes : ["MODEL_OUTPUT_REJECTED"],
  };
}
