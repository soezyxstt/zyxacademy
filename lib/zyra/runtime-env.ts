import { z } from "zod";

const optionalString = z.preprocess(
  (value) => typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().url().optional(),
);
const optionalFlag = z.preprocess(
  (value) => typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.enum(["0", "1"]).optional(),
);

export const ZyraRuntimeEnvSchema = z.object({
  FEATURE_ZYRA_IDEA_RUNTIME_V1: optionalFlag,
  FEATURE_VECTORIZE_ONLY_V1: optionalFlag,
  FEATURE_ZYRA_PEDAGOGY_V3: optionalFlag,
  FEATURE_ZYRA_PERSONALIZATION_V1: optionalFlag,
  FEATURE_ZYRA_LEARNING_CANVAS_V1: optionalFlag,
  FEATURE_ZYRA_IMAGE_INPUT_V1: optionalFlag,
  FEATURE_ZYRA_MURID_V3: optionalFlag,
  FEATURE_ZYRA_SELECTION_ASK_V1: optionalFlag,
  FEATURE_ZYRA_PET_V1: optionalFlag,
  FEATURE_ZYRA_TUTOR_COPILOT_V1: optionalFlag,
  FEATURE_ZYRA_ADMIN_COPILOT_V1: optionalFlag,
  FEATURE_ZYRA_AI_OPS_V1: optionalFlag,
  FEATURE_ASSESSMENT_ASSISTANCE_POLICY: optionalFlag,
  FEATURE_FEEDBACK: optionalFlag,
  FEATURE_MISCONCEPTION: optionalFlag,
  FEATURE_ZYRA_SEMANTIC_CACHE_V1: optionalFlag,
  FEATURE_STUDY_PATH: optionalFlag,
  FEATURE_TUTOR_EVIDENCE_V2: optionalFlag,
  FEATURE_TUTOR_PIPELINE_V2: optionalFlag,
  STAGING_ZYRA_PEDAGOGY_USER_ID: optionalString,
  ZYX_ENVIRONMENT: optionalString,
  GEMINI_API_KEY: optionalString,
  GEMINI_API_KEY_2: optionalString,
  GEMINI_API_KEY_3: optionalString,
  GEMINI_API_KEY_4: optionalString,
  GEMINI_PROJECT_ALIAS_1: optionalString,
  GEMINI_PROJECT_ALIAS_2: optionalString,
  GEMINI_PROJECT_ALIAS_3: optionalString,
  GEMINI_PROJECT_ALIAS_4: optionalString,
  CF_AI_GATEWAY_URL: optionalUrl,
  CF_AI_GATEWAY_TOKEN: optionalString,
  CF_ACCOUNT_ID: optionalString,
  CF_KV_NAMESPACE_ID: optionalString,
  CF_API_TOKEN: optionalString,
  VECTORIZE_WORKER_URL: optionalUrl,
  VECTORIZE_SHARED_SECRET: optionalString,
}).strict();

export type ZyraRuntimeEnv = z.infer<typeof ZyraRuntimeEnvSchema>;

export function createZyraRuntimeEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): ZyraRuntimeEnv {
  return ZyraRuntimeEnvSchema.parse({
    FEATURE_ZYRA_IDEA_RUNTIME_V1: source.FEATURE_ZYRA_IDEA_RUNTIME_V1,
    FEATURE_VECTORIZE_ONLY_V1: source.FEATURE_VECTORIZE_ONLY_V1,
    FEATURE_ZYRA_PEDAGOGY_V3: source.FEATURE_ZYRA_PEDAGOGY_V3,
    FEATURE_ZYRA_PERSONALIZATION_V1: source.FEATURE_ZYRA_PERSONALIZATION_V1,
    FEATURE_ZYRA_LEARNING_CANVAS_V1: source.FEATURE_ZYRA_LEARNING_CANVAS_V1,
    FEATURE_ZYRA_IMAGE_INPUT_V1: source.FEATURE_ZYRA_IMAGE_INPUT_V1,
    FEATURE_ZYRA_MURID_V3: source.FEATURE_ZYRA_MURID_V3,
    FEATURE_ZYRA_SELECTION_ASK_V1: source.FEATURE_ZYRA_SELECTION_ASK_V1,
    FEATURE_ZYRA_PET_V1: source.FEATURE_ZYRA_PET_V1,
    FEATURE_ZYRA_TUTOR_COPILOT_V1: source.FEATURE_ZYRA_TUTOR_COPILOT_V1,
    FEATURE_ZYRA_ADMIN_COPILOT_V1: source.FEATURE_ZYRA_ADMIN_COPILOT_V1,
    FEATURE_ZYRA_AI_OPS_V1: source.FEATURE_ZYRA_AI_OPS_V1,
    FEATURE_ASSESSMENT_ASSISTANCE_POLICY: source.FEATURE_ASSESSMENT_ASSISTANCE_POLICY,
    FEATURE_FEEDBACK: source.FEATURE_FEEDBACK,
    FEATURE_MISCONCEPTION: source.FEATURE_MISCONCEPTION,
    FEATURE_ZYRA_SEMANTIC_CACHE_V1: source.FEATURE_ZYRA_SEMANTIC_CACHE_V1,
    FEATURE_STUDY_PATH: source.FEATURE_STUDY_PATH,
    FEATURE_TUTOR_EVIDENCE_V2: source.FEATURE_TUTOR_EVIDENCE_V2,
    FEATURE_TUTOR_PIPELINE_V2: source.FEATURE_TUTOR_PIPELINE_V2,
    STAGING_ZYRA_PEDAGOGY_USER_ID: source.STAGING_ZYRA_PEDAGOGY_USER_ID,
    ZYX_ENVIRONMENT: source.ZYX_ENVIRONMENT,
    GEMINI_API_KEY: source.GEMINI_API_KEY,
    GEMINI_API_KEY_2: source.GEMINI_API_KEY_2,
    GEMINI_API_KEY_3: source.GEMINI_API_KEY_3,
    GEMINI_API_KEY_4: source.GEMINI_API_KEY_4,
    GEMINI_PROJECT_ALIAS_1: source.GEMINI_PROJECT_ALIAS_1,
    GEMINI_PROJECT_ALIAS_2: source.GEMINI_PROJECT_ALIAS_2,
    GEMINI_PROJECT_ALIAS_3: source.GEMINI_PROJECT_ALIAS_3,
    GEMINI_PROJECT_ALIAS_4: source.GEMINI_PROJECT_ALIAS_4,
    CF_AI_GATEWAY_URL: source.CF_AI_GATEWAY_URL,
    CF_AI_GATEWAY_TOKEN: source.CF_AI_GATEWAY_TOKEN,
    CF_ACCOUNT_ID: source.CF_ACCOUNT_ID,
    CF_KV_NAMESPACE_ID: source.CF_KV_NAMESPACE_ID,
    CF_API_TOKEN: source.CF_API_TOKEN,
    VECTORIZE_WORKER_URL: source.VECTORIZE_WORKER_URL,
    VECTORIZE_SHARED_SECRET: source.VECTORIZE_SHARED_SECRET,
  });
}

export const zyraRuntimeEnv = createZyraRuntimeEnv();
