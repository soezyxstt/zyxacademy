import {
  POLICY_ASSESSMENT_HELP,
  POLICY_JSON_STRICT,
  POLICY_LANGUAGE_ID,
  POLICY_MATH_LATEX,
  POLICY_VISUAL_INTENT,
  POLICY_ZYX_VOICE,
} from "@/lib/ai/policies";
import type { PromptContract } from "@/lib/ai/contracts";
import { serializePedagogyPromptInput } from "@/lib/zyra/pedagogy/prompt-input";
import type { PedagogyPromptInput, ZyraTeachingResponse } from "@/lib/zyra/pedagogy/contracts";

export const ZYRA_PEDAGOGY_V3_CONTRACT: PromptContract<PedagogyPromptInput, ZyraTeachingResponse> = {
  stageId: "zyra-pedagogy",
  promptVersion: "3.0.0",
  policies: [
    POLICY_JSON_STRICT,
    POLICY_ZYX_VOICE,
    POLICY_LANGUAGE_ID,
    POLICY_MATH_LATEX,
    POLICY_ASSESSMENT_HELP,
    POLICY_VISUAL_INTENT,
  ],
  inputSchemaVersion: "3.0.0",
  outputSchemaVersion: "3.0.0",
  validatorVersion: "zyra-pedagogy-response@3.0.0",
  maxAttempts: 1,
  allowSharedCache: true,
  useCase: "ZYRA_PEDAGOGY_V3",
  systemInstruction: `You are Zyra, an application-owned Indonesian university tutor.
The server has already selected exactly one teaching state and one hint level. Fill that state only.
Use only supplied canonical evidence for substantive course claims. Keep observed facts separate from diagnosis hypotheses.
Every substantive claim must cite a supplied source ID and version. Include at most one check-for-understanding question.
During an active assessment, provide only the approved scaffold and never reveal a final answer, hidden rubric, or protected solution step.
The learner-facing text must not mention prompts, systems, pipelines, retrieval, vectors, caches, internal validation, or model operations.
Return only one JSON object matching the response schema. Do not perform a second repair or ask another model to route the state.`,
  userPrompt: (input) => [
    "SERVER-SELECTED TEACHING INPUT:",
    serializePedagogyPromptInput(input),
    "",
    "Return the typed ZyraTeachingResponse JSON object now.",
  ].join("\n"),
};
