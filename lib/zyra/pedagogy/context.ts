import type {
  ActivityKind,
  AnswerReleaseState,
  AttemptState,
  MatchState,
} from "@/lib/assessment-assistance-policy";
import {
  PedagogyContextSchema,
  type HintLevel,
  type LearnerResponseShape,
  type PedagogyContext,
} from "./contracts";

export type PedagogyContextAction = PedagogyContext["action"];

export interface BuildPedagogyContextInput {
  responseLanguage?: "id" | "en";
  courseId: string;
  chapterId?: string | null;
  question: string;
  action: PedagogyContextAction;
  activityKind: ActivityKind;
  attemptState: AttemptState;
  answerReleaseState: AnswerReleaseState;
  matchState: MatchState;
  allowDirectAnswerReveal: boolean;
  assessmentReasonCode: string;
  evidenceSufficiency: PedagogyContext["evidenceSufficiency"];
  previousHintLevel?: HintLevel;
  learnerResponseShape?: LearnerResponseShape;
  misconceptionUncertain?: boolean;
  responseModifiers?: string[];
}

function cleanTopic(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function isActiveAssessment(attemptState: AttemptState, activityKind: ActivityKind): boolean {
  return activityKind === "quiz" || activityKind === "exam" || attemptState === "in_progress";
}

export function buildPedagogyContext(input: BuildPedagogyContextInput): PedagogyContext {
  const context = {
    responseLanguage: input.responseLanguage ?? "id",
    courseId: cleanTopic(input.courseId),
    chapterId: input.chapterId ? cleanTopic(input.chapterId) : null,
    action: input.action,
    evidenceSufficiency: input.evidenceSufficiency,
    activeAssessment: isActiveAssessment(input.attemptState, input.activityKind),
    allowDirectAnswerReveal: input.allowDirectAnswerReveal,
    assessmentReasonCode: cleanTopic(input.assessmentReasonCode),
    learnerResponseShape: input.learnerResponseShape ?? "unknown",
    previousHintLevel: input.previousHintLevel ?? "none",
    misconceptionUncertain: input.misconceptionUncertain ?? false,
    responseModifiers: (input.responseModifiers ?? []).map(cleanTopic).filter(Boolean).slice(0, 8),
    explicitTopic: cleanTopic(input.question),
  } satisfies PedagogyContext;

  return PedagogyContextSchema.parse(context);
}

export function assertProfileFreePedagogyContext(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase();
  const forbidden = [
    "studentid",
    "userid",
    "learnerid",
    "mastery",
    "history",
    "sessionid",
    "recentmessages",
    "correctanswer",
    "correctoption",
    "protectedanswer",
    "profile",
  ];
  const match = forbidden.find((term) => serialized.includes(term));
  if (match) throw new Error(`PEDAGOGY_CONTEXT_FORBIDDEN_FIELD:${match}`);
}

export function normalizeLearnerResponseShape(value: unknown): LearnerResponseShape {
  if (value === "short_answer" || value === "multiple_choice" || value === "equation" || value === "prediction") {
    return value;
  }
  if (value === "free_text") return value;
  return "unknown";
}
