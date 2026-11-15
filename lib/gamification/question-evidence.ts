/** A complete exposure history must come from an authoritative server record. */
export type QuestionExposureHistory =
 | { status: 'unsupported' }
 | { status: 'complete'; reveals: readonly { attemptId: string; occurredAt: Date }[] };

export type QuestionWriterInput = {
 userId: string; courseId: string; questionId: string; sourceVersion: string;
 attemptId: string; correct: boolean; occurredAt: Date;
 exposure: QuestionExposureHistory;
};

/** Validate the writer boundary before considering any receipt. This does not authenticate it. */
export function prepareQuestionEvidence(input: QuestionWriterInput) {
 if (![input.userId, input.courseId, input.questionId, input.sourceVersion, input.attemptId].every(value => typeof value === 'string' && value.trim().length > 0)
  || typeof input.correct !== 'boolean' || !(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) throw new Error('INVALID_QUESTION_EVIDENCE');
 if (!input.exposure || input.exposure.status === 'unsupported') return { status: 'unsupported' as const };
 if (input.exposure.status !== 'complete' || !Array.isArray(input.exposure.reveals)) throw new Error('INVALID_QUESTION_EVIDENCE');
 let lastReveal: { attemptId: string; occurredAt: Date } | null = null;
 for (const reveal of input.exposure.reveals) {
  if (!reveal || typeof reveal.attemptId !== 'string' || !reveal.attemptId.trim() || !(reveal.occurredAt instanceof Date) || !Number.isFinite(reveal.occurredAt.getTime()) || reveal.occurredAt > input.occurredAt) throw new Error('INVALID_QUESTION_EVIDENCE');
  if (!lastReveal || reveal.occurredAt > lastReveal.occurredAt) lastReveal = reveal;
  else if (reveal.occurredAt.getTime() === lastReveal.occurredAt.getTime() && reveal.attemptId !== lastReveal.attemptId) return { status: 'unsupported' as const };
 }
 return { status: 'supported' as const, lastReveal };
}
