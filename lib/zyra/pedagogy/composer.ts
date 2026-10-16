import type { ProtectedItemPayload } from "@/lib/assessment-assistance-policy";
import type {
  PedagogyContext,
  PedagogySource,
  ZyraTeachingResponse,
} from "./contracts";
import type { TeachingPlan } from "./state-machine";
import type { CanvasSpec } from "@/lib/zyra/canvas";
import { parseCanvasSpec } from "@/lib/zyra/canvas";
import { sanitizeAnswer } from "@/lib/tutor/answer-sanitizer";

export interface LegacyTutorAnswer {
  answer: string;
  sources: Array<{ type: string; id: string; label: string; href: string }>;
  matchedConcepts: string[];
  confidence: number;
  grounded: boolean;
  coverageState?: "full" | "partial" | "none" | "conflict" | "needs_review";
  canvasSpec?: CanvasSpec | null;
}

function learnerSafeText(value: string): string {
  return value
    .replace(/\b(?:retrieved|retrieval|vectorize|semantic cache|cache hit|pipeline|system prompt|source list|snippet|excerpt)\b/gi, "materi")
    .replace(/[!]/g, ".")
    .replace(/[\u2013\u2014]/g, ",")
    .replace(/[\t ]+/g, " ")
    .trim();
}

function boundedEvidenceText(source: PedagogySource, activeAssessment: boolean): string {
  const answerSafe = activeAssessment && ["question", "practice_question", "past_exam", "solution"].includes(source.kind)
    ? source.content.replace(/(?:solution|explanation|answer|jawaban|pembahasan)\s*:[\s\S]*$/gi, "")
    : source.content;
  const text = learnerSafeText(answerSafe);
  return text.length > 900 ? `${text.slice(0, 897).trim()}...` : text;
}

function checkForUnderstanding(context: PedagogyContext, plan: TeachingPlan) {
  if (!plan.requiresCheckpoint) return null;
  const shape = context.learnerResponseShape === "unknown" ? "free_text" : context.learnerResponseShape;
  return {
    question: plan.state === "teach_back"
      ? "Coba jelaskan kembali gagasan utamanya dengan kata-katamu sendiri."
      : "Bagian mana yang paling membantu menjelaskan konsep ini? Jelaskan satu alasannya.",
    expectedResponseShape: shape,
  } as const;
}

function safeAssessmentDecision(context: PedagogyContext) {
  if (!context.activeAssessment) {
    return { decision: "allowed" as const, reasonCode: context.assessmentReasonCode };
  }
  if (context.allowDirectAnswerReveal) {
    return { decision: "allowed" as const, reasonCode: context.assessmentReasonCode };
  }
  return { decision: "scaffold_only" as const, reasonCode: context.assessmentReasonCode };
}

export function composeSafeTeachingResponse(
  context: PedagogyContext,
  plan: TeachingPlan,
  evidence: readonly PedagogySource[],
  reasonCode: string,
): ZyraTeachingResponse {
  const generationFailed = reasonCode === "MODEL_OUTPUT_REJECTED";
  const teachingEvidence = evidence.filter((source) => !/Murid sedang membaca|PANDUAN KONTEKS|HARUS merujuk|Konteks halaman saat ini/i.test(source.content));
  if (generationFailed || teachingEvidence.length === 0 || context.evidenceSufficiency === "insufficient" || plan.state === "clarify") {
    const clarification = generationFailed
      ? "Penjelasannya belum berhasil dibuat. Coba lagi atau pilih bagian materi yang ingin kamu bahas."
      : "Bahan ajar yang tersedia belum cukup untuk menjawab pertanyaan ini dengan pasti. Coba sebutkan bagian materi atau istilah yang ingin kamu bahas.";
    return {
      learningGoal: context.explicitTopic,
      observedFacts: [],
      diagnosisHypotheses: [],
      selectedState: "clarify",
      teachingMove: "clarify_evidence",
      hintLevel: "none",
      explanationBlocks: [{ kind: "goal", text: clarification }],
      citations: [],
      visualSpec: null,
      canvasSpec: null,
      imageObservations: [],
      uncertainties: [],
      unreadableRegions: [],
      checkForUnderstanding: null,
      nextAllowedAction: "request_clarification",
      assessmentSafety: { decision: "clarify", reasonCode },
      learnerFacingText: clarification,
    };
  }

  const primary = teachingEvidence[0];
  const evidenceText = boundedEvidenceText(primary, context.activeAssessment && !context.allowDirectAnswerReveal);
  const citations = teachingEvidence.slice(0, 3).map((source) => ({
    sourceId: source.id,
    sourceVersion: source.version,
    claim: `Materi terkait ${source.title}`,
  }));
  const explanation = plan.state === "diagnose"
    ? "Sebelum memilih penjelasan yang tepat, kita perlu membedakan bagian konsep yang masih membingungkan."
    : evidenceText;
  const checkpoint = checkForUnderstanding(context, plan);
  const blocks: ZyraTeachingResponse["explanationBlocks"] = [
    { kind: plan.state === "hint_1_concept" ? "principle" as const : "concept" as const, text: explanation },
  ];
  if (checkpoint) blocks.push({ kind: "checkpoint" as const, text: checkpoint.question });

  const learnerText = plan.state === "diagnose"
    ? `${explanation} Menurutmu, bagian mana yang paling sulit: definisinya, hubungan antarbesaran, atau langkah penerapannya?`
    : `${blocks.map((block) => block.text).join("\n\n")}`;

  return {
    learningGoal: context.explicitTopic,
    observedFacts: [`Materi ${primary.title} tersedia untuk topik ini.`],
    diagnosisHypotheses: plan.state === "diagnose"
      ? [{ hypothesis: "Penyebab kebingungan belum dapat dipastikan dari bukti yang tersedia.", evidenceSufficiency: "limited" }]
      : [],
    selectedState: plan.state,
    teachingMove: plan.teachingMove,
    hintLevel: plan.hintLevel,
    explanationBlocks: blocks,
    citations,
    visualSpec: null,
    canvasSpec: null,
    imageObservations: [],
    uncertainties: [],
    unreadableRegions: [],
    checkForUnderstanding: checkpoint,
    nextAllowedAction: plan.nextAllowedAction,
    assessmentSafety: safeAssessmentDecision(context),
    learnerFacingText: learnerSafeText(learnerText),
  };
}

export function teachingResponseToTutorAnswer(
  response: ZyraTeachingResponse,
  evidence: readonly PedagogySource[],
): LegacyTutorAnswer {
  const byId = new Map(evidence.map((source) => [source.id, source]));
  const sources = response.citations
    .map((citation) => byId.get(citation.sourceId))
    .filter((source): source is PedagogySource => Boolean(source))
    .map((source) => ({
      type: source.kind,
      id: source.id,
      label: source.title,
      href: source.href,
    }));
  return {
    answer: sanitizeAnswer(response.learnerFacingText, evidence),
    sources,
    matchedConcepts: response.citations.map((citation) => citation.sourceId),
    confidence: sources.length > 0 ? 0.85 : 0,
    grounded: sources.length > 0,
    coverageState: sources.length > 0 ? "full" : "none",
    // The harness renders exactly the validated canvasSpec emitted by the
    // model. It never synthesizes a visual from prose: no structured spec
    // means no interactive canvas, only the textual answer.
    canvasSpec: parseCanvasSpec(response.canvasSpec, evidence.map((source) => source.id))
      ?? (response.canvasSpec && typeof response.canvasSpec === "object" ? parseCanvasSpec({ ...response.canvasSpec, claimRefs: [] }) : null)
      ?? null,
  };
}

export function redactProtectedAnswersForPrompt(
  context: PedagogyContext,
  protectedAnswers?: ProtectedItemPayload,
): ProtectedItemPayload | undefined {
  if (!context.activeAssessment || context.allowDirectAnswerReveal || !protectedAnswers) return undefined;
  return {
    correctIndices: protectedAnswers.correctIndices?.map(() => -1),
  };
}
