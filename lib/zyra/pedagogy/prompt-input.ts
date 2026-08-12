import { createHash } from "node:crypto";
import type { TeachingPlan } from "./state-machine";
import {
  PedagogyPromptInputSchema,
  type PedagogyContext,
  type PedagogyPromptInput,
  type PedagogySource,
} from "./contracts";
import { assertProfileFreePedagogyContext } from "./context";

export interface PedagogyEvidenceInput {
  id: string;
  version?: number;
  kind: string;
  title: string;
  content: string;
  href: string;
}

function removeAnswerBearingSections(content: string): string {
  return content
    .replace(/(?:solution|explanation|answer|jawaban|pembahasan)\s*:[\s\S]*$/gi, "")
    .replace(/(?:solusi|jawaban akhir)\s*:[\s\S]*$/gi, "")
    .trim();
}

function safeContent(content: string, activeAssessment: boolean, kind: string): string {
  const bounded = content.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 6000);
  if (!activeAssessment) return bounded;
  if (["question", "practice_question", "past_exam", "solution"].includes(kind)) {
    return removeAnswerBearingSections(bounded);
  }
  return bounded;
}

function sourceHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildPedagogyPromptInput(
  context: PedagogyContext,
  plan: TeachingPlan,
  learnerQuestion: string,
  evidence: readonly PedagogyEvidenceInput[],
): PedagogyPromptInput {
  assertProfileFreePedagogyContext(context);
  const safeEvidence: PedagogySource[] = evidence
    .slice(0, 12)
    .map((item) => {
      const content = safeContent(item.content, context.activeAssessment && !context.allowDirectAnswerReveal, item.kind);
      return {
        id: item.id,
        version: item.version ?? 1,
        kind: item.kind,
        title: item.title.replace(/\s+/g, " ").trim().slice(0, 200),
        content,
        href: item.href,
        contentHash: sourceHash(content),
      };
    })
    .filter((item) => item.content.length > 0);

  const input: PedagogyPromptInput = {
    context,
    selectedState: plan.state,
    hintLevel: plan.hintLevel,
    evidence: safeEvidence,
    learnerQuestion: learnerQuestion.replace(/\s+/g, " ").trim().slice(0, 1200),
    outputRules: [
      "Return one JSON object matching the typed response contract.",
      "Use only the supplied evidence for substantive course claims.",
      "Keep observed facts separate from diagnosis hypotheses.",
      "Cite canonical source IDs and versions for each substantive claim.",
      "Ask at most one check-for-understanding question.",
      "Never reveal a final answer, protected solution, or hidden rubric during an active assessment.",
      "Do not mention system, prompt, pipeline, retrieval, vector, cache, or internal validation details to the learner.",
      "Write learner-facing text in concise Indonesian without exclamation marks or long dash characters.",
    ],
  };

  return PedagogyPromptInputSchema.parse(input);
}

export function serializePedagogyPromptInput(input: PedagogyPromptInput): string {
  return JSON.stringify(input);
}
