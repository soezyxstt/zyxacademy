import { validateTutorOutput, type ProtectedItemPayload } from '@/lib/assessment-assistance-policy';
import { sanitizeAnswer, type SanitizationSource } from '@/lib/tutor/answer-sanitizer';
import { sanitizePromptInput } from '@/lib/tutor/prompt-sanitizer';
import { parseFollowupAnswer, validateFollowups, type Followup } from '@/lib/zyra/followups';

export const PIPELINE_LANGUAGE = /\b(?:system prompt|pipeline|retriev(?:e|al|ed)?|vector(?:ize)?|semantic cache|cache hit|internal validation|model output|ai gateway|canonical runtime|source list|snippet|excerpt|panduan konteks|murid sedang membaca|harus merujuk)\b/i;

type SafetyContext = {
  sources: readonly SanitizationSource[];
  activeAssessment: boolean;
  protectedAnswers?: ProtectedItemPayload;
};

/** A missing policy context is not evidence that an untrusted suggestion is safe. */
export function safeFollowups(value: unknown, context: SafetyContext | null): Followup[] {
  if (!context || context.activeAssessment) return [];
  return validateFollowups(value).filter(({ label, prompt }) => [label, prompt].every((text) => {
    // Never transform a clickable prompt: a redaction can change its meaning.
    if (sanitizeAnswer(text, context.sources) !== text || sanitizePromptInput(text) !== text) return false;
    if (PIPELINE_LANGUAGE.test(text) || /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/.test(text)) return false;
    return validateTutorOutput(text, context.protectedAnswers ?? {}, 'socratic_only').valid;
  }));
}

/** Strip hidden metadata and apply the authenticated policy at the response boundary. */
export function finalizeTutorFollowups(answer: string, context: SafetyContext | null): { answer: string; followups: Followup[] } {
  const parsed = parseFollowupAnswer(answer);
  return { answer: parsed.text, followups: safeFollowups(parsed.followups, context) };
}
