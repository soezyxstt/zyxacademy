import type {
  HintLevel,
  LearnerResponseShape,
  PedagogyContext,
  TeachingMove,
  TeachingState,
  NextAllowedAction,
} from "./contracts";

export type PedagogyAction = PedagogyContext["action"];

export interface TeachingPlan {
  state: TeachingState;
  hintLevel: HintLevel;
  teachingMove: TeachingMove;
  nextAllowedAction: NextAllowedAction;
  requiresCheckpoint: boolean;
  reasonCodes: string[];
}

const HINT_ORDER: HintLevel[] = [
  "none",
  "hint_1_concept",
  "hint_2_representation",
  "hint_3_analogous_example",
  "hint_4_partial_step",
];

function nextHint(previous: HintLevel): HintLevel {
  const index = HINT_ORDER.indexOf(previous);
  return HINT_ORDER[Math.min(HINT_ORDER.length - 1, Math.max(0, index) + 1)] ?? "hint_1_concept";
}

function stateForHint(hintLevel: HintLevel): TeachingState {
  if (hintLevel === "hint_1_concept") return "hint_1_concept";
  if (hintLevel === "hint_2_representation") return "hint_2_representation";
  if (hintLevel === "hint_3_analogous_example") return "hint_3_analogous_example";
  if (hintLevel === "hint_4_partial_step") return "hint_4_partial_step";
  return "explain";
}

function moveForState(state: TeachingState): TeachingMove {
  switch (state) {
    case "orient": return "orient_goal";
    case "diagnose": return "diagnose_misconception";
    case "explain": return "explain_concept";
    case "hint_1_concept": return "identify_principle";
    case "hint_2_representation": return "show_representation";
    case "hint_3_analogous_example": return "work_analogous_example";
    case "hint_4_partial_step": return "reveal_partial_step";
    case "teach_back": return "teach_back_prompt";
    case "check": return "check_understanding";
    case "clarify": return "clarify_evidence";
  }
}

function nextActionForState(state: TeachingState, activeAssessment: boolean): NextAllowedAction {
  if (activeAssessment && state === "hint_4_partial_step") return "stop_at_assessment_boundary";
  switch (state) {
    case "diagnose": return "ask_discriminating_question";
    case "clarify": return "request_clarification";
    case "hint_3_analogous_example": return "try_analogous_example";
    case "hint_4_partial_step": return "stop_at_assessment_boundary";
    case "teach_back":
    case "check": return "answer_checkpoint";
    default: return "continue_with_hint";
  }
}

function withPlan(
  state: TeachingState,
  hintLevel: HintLevel,
  context: PedagogyContext,
  reasonCodes: string[],
): TeachingPlan {
  return {
    state,
    hintLevel,
    teachingMove: moveForState(state),
    nextAllowedAction: nextActionForState(state, context.activeAssessment),
    requiresCheckpoint: [
      "explain",
      "hint_1_concept",
      "hint_2_representation",
      "hint_3_analogous_example",
      "hint_4_partial_step",
      "teach_back",
      "check",
    ].includes(state),
    reasonCodes,
  };
}

export function selectTeachingPlan(context: PedagogyContext): TeachingPlan {
  if (context.evidenceSufficiency === "insufficient") {
    return withPlan("clarify", "none", context, ["INSUFFICIENT_CANONICAL_EVIDENCE"]);
  }

  if (context.action === "check_response") {
    return withPlan("check", context.previousHintLevel, context, ["CHECK_LEARNER_RESPONSE"]);
  }

  if (context.action === "teach_back") {
    return withPlan("teach_back", context.previousHintLevel, context, ["EXPLICIT_TEACH_BACK"]);
  }

  if (context.misconceptionUncertain && context.action !== "hint_request") {
    return withPlan("diagnose", context.previousHintLevel, context, ["DIAGNOSIS_REQUIRES_EVIDENCE"]);
  }

  if (context.action === "hint_request") {
    const hint = nextHint(context.previousHintLevel);
    const reason = hint === "hint_4_partial_step"
      ? ["HINT_SEQUENCE_CAPPED_AT_PARTIAL_STEP"]
      : ["EXPLICIT_HINT_REQUEST"];
    return withPlan(stateForHint(hint), hint, context, reason);
  }

  if (context.action === "new_topic") {
    if (context.activeAssessment && !context.allowDirectAnswerReveal) {
      return withPlan("hint_1_concept", "hint_1_concept", context, ["ACTIVE_ASSESSMENT_SCAFFOLD_CAP"]);
    }
    return withPlan("orient", "none", context, ["NEW_TOPIC_ORIENTATION"]);
  }

  if (context.previousHintLevel !== "none") {
    const hint = nextHint(context.previousHintLevel);
    return withPlan(stateForHint(hint), hint, context, ["CONTINUE_HINT_SEQUENCE"]);
  }

  if (context.activeAssessment && !context.allowDirectAnswerReveal) {
    return withPlan("hint_1_concept", "hint_1_concept", context, ["ACTIVE_ASSESSMENT_SCAFFOLD_CAP"]);
  }

  return withPlan("explain", "none", context, ["DIRECT_CONCEPT_EXPLANATION"]);
}

export function isActiveAssessmentContext(context: Pick<PedagogyContext, "activeAssessment" | "allowDirectAnswerReveal">): boolean {
  return context.activeAssessment && !context.allowDirectAnswerReveal;
}

export function responseShapeRequiresCheckpoint(shape: LearnerResponseShape): boolean {
  return shape !== "unknown";
}

export function hintLevelIndex(level: HintLevel): number {
  return HINT_ORDER.indexOf(level);
}
