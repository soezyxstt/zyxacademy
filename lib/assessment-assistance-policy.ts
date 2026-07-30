/**
 * Assessment Assistance Policy engine.
 * Deterministic policy gating for AI tutor, mistake feedback, and assessment help entry points.
 */

export type ActivityKind = 'study' | 'practice' | 'quiz' | 'simulation' | 'exam';
export type AttemptState = 'none' | 'in_progress' | 'submitted' | 'completed' | 'expired';
export type AnswerReleaseState = 'hidden' | 'rationale_only' | 'released';
export type MatchState = 'none' | 'weak' | 'strong' | 'exact';

export type AllowedHelpLevel =
  | 'full_explanation'
  | 'concept_hint'
  | 'socratic_only'
  | 'clarify_context'
  | 'refuse_answer_reveal';

export interface AssessmentAssistancePolicyInput {
  activityKind: ActivityKind;
  attemptState: AttemptState;
  answerReleaseState: AnswerReleaseState;
  matchState: MatchState;
  courseOverride?: {
    allowDirectAnswerReveal?: boolean;
    allowedHelpLevel?: AllowedHelpLevel;
  };
}

export interface AssessmentAssistancePolicyResult {
  allowedHelpLevel: AllowedHelpLevel;
  reasonCode: string;
  allowDirectAnswerReveal: boolean;
  allowStoredExplanationReveal: boolean;
}

const VALID_ACTIVITIES = new Set<ActivityKind>(['study', 'practice', 'quiz', 'simulation', 'exam']);
const VALID_ATTEMPT_STATES = new Set<AttemptState>(['none', 'in_progress', 'submitted', 'completed', 'expired']);
const VALID_RELEASE_STATES = new Set<AnswerReleaseState>(['hidden', 'rationale_only', 'released']);
const VALID_MATCH_STATES = new Set<MatchState>(['none', 'weak', 'strong', 'exact']);

/**
 * Pure policy decision function. Unknown inputs fail closed to clarify_context or refuse_answer_reveal.
 */
export function evaluateAssessmentAssistancePolicy(
  input: AssessmentAssistancePolicyInput
): AssessmentAssistancePolicyResult {
  if (
    !input ||
    !VALID_ACTIVITIES.has(input.activityKind) ||
    !VALID_ATTEMPT_STATES.has(input.attemptState) ||
    !VALID_RELEASE_STATES.has(input.answerReleaseState) ||
    !VALID_MATCH_STATES.has(input.matchState)
  ) {
    return {
      allowedHelpLevel: 'refuse_answer_reveal',
      reasonCode: 'UNKNOWN_INPUT_FAIL_CLOSED',
      allowDirectAnswerReveal: false,
      allowStoredExplanationReveal: false,
    };
  }

  const { activityKind, attemptState, answerReleaseState, matchState, courseOverride } = input;

  // Active attempt protection for quiz, simulation, exam
  if (attemptState === 'in_progress' || attemptState === 'submitted') {
    if (activityKind === 'quiz' || activityKind === 'simulation' || activityKind === 'exam') {
      if (matchState === 'exact') {
        return {
          allowedHelpLevel: 'refuse_answer_reveal',
          reasonCode: 'ACTIVE_ASSESSMENT_EXACT_MATCH_REFUSED',
          allowDirectAnswerReveal: false,
          allowStoredExplanationReveal: false,
        };
      }
      if (matchState === 'strong' || matchState === 'weak') {
        return {
          allowedHelpLevel: 'socratic_only',
          reasonCode: 'ACTIVE_ASSESSMENT_SOCRATIC_ONLY',
          allowDirectAnswerReveal: false,
          allowStoredExplanationReveal: false,
        };
      }
      return {
        allowedHelpLevel: 'clarify_context',
        reasonCode: 'ACTIVE_ASSESSMENT_CONTEXT_ONLY',
        allowDirectAnswerReveal: false,
        allowStoredExplanationReveal: false,
      };
    }
  }

  // Completed attempt logic
  if (attemptState === 'completed') {
    if (answerReleaseState === 'released') {
      const result: AssessmentAssistancePolicyResult = {
        allowedHelpLevel: 'full_explanation',
        reasonCode: 'COMPLETED_ATTEMPT_RELEASED',
        allowDirectAnswerReveal: true,
        allowStoredExplanationReveal: true,
      };
      if (courseOverride?.allowedHelpLevel) {
        result.allowedHelpLevel = courseOverride.allowedHelpLevel;
      }
      return result;
    }
    if (answerReleaseState === 'rationale_only') {
      return {
        allowedHelpLevel: 'concept_hint',
        reasonCode: 'COMPLETED_ATTEMPT_RATIONALE_ONLY',
        allowDirectAnswerReveal: false,
        allowStoredExplanationReveal: true,
      };
    }
    // Hidden
    return {
      allowedHelpLevel: 'socratic_only',
      reasonCode: 'COMPLETED_ATTEMPT_HIDDEN',
      allowDirectAnswerReveal: false,
      allowStoredExplanationReveal: false,
    };
  }

  // Study / Practice mode (unlinked to an active exam)
  if (activityKind === 'study' || activityKind === 'practice') {
    return {
      allowedHelpLevel: 'full_explanation',
      reasonCode: 'STUDY_PRACTICE_ALLOWED',
      allowDirectAnswerReveal: true,
      allowStoredExplanationReveal: true,
    };
  }

  // Standalone unlinked quiz/exam questions outside an active attempt
  if (matchState === 'exact') {
    return {
      allowedHelpLevel: 'socratic_only',
      reasonCode: 'UNLINKED_ASSESSMENT_EXACT_SOCRATIC',
      allowDirectAnswerReveal: false,
      allowStoredExplanationReveal: false,
    };
  }

  return {
    allowedHelpLevel: 'concept_hint',
    reasonCode: 'UNLINKED_ASSESSMENT_CONCEPT_HINT',
    allowDirectAnswerReveal: false,
    allowStoredExplanationReveal: true,
  };
}

export interface ProtectedItemPayload {
  correctIndices?: number[];
  correctOptions?: string[];
  explanationText?: string;
}

/**
 * Deterministic post-validator to verify generated response does not leak protected data.
 */
export function validateTutorOutput(
  text: string,
  protectedData: ProtectedItemPayload,
  allowedHelpLevel: AllowedHelpLevel
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // When help level forbids answer reveal, inspect output for exact leaks
  if (
    allowedHelpLevel === 'socratic_only' ||
    allowedHelpLevel === 'refuse_answer_reveal' ||
    allowedHelpLevel === 'clarify_context'
  ) {
    if (protectedData.correctOptions && protectedData.correctOptions.length > 0) {
      for (const opt of protectedData.correctOptions) {
        const trimmed = opt.trim();
        if (!trimmed) continue;

        if (trimmed.length >= 3 && text.toLowerCase().includes(trimmed.toLowerCase())) {
          violations.push('EXACT_OPTION_TEXT_LEAK');
          break;
        }

        // Numerical / short formula leak check
        const numMatch = trimmed.match(/^[\d\.\/\+\-\*\=a-zA-Z\s]{1,10}$/);
        if (numMatch) {
          const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(?:^|\\s|:|=)${escaped}(?:$|\\s|\\.|,|;|!)`, 'i');
          if (regex.test(text)) {
            violations.push('NUMERICAL_KEY_ANSWER_LEAK');
            break;
          }
        }
      }
    }

    if (protectedData.explanationText) {
      const expSnippet = protectedData.explanationText.slice(0, 50).trim();
      if (expSnippet.length >= 20 && text.toLowerCase().includes(expSnippet.toLowerCase())) {
        violations.push('STORED_EXPLANATION_LEAK');
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
