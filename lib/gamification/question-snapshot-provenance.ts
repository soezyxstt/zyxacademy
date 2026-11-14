/** A legacy projection can establish a canonical version only when its content agrees. */
export function canonicalObjectiveProvenance(
 legacy: { id: string; generationHash: string | null; questionType: string; prompt: string; options: unknown; correctIndices: unknown },
 canonical: { id: string; generationHash: string; questionType: string; prompt: string; optionsSnapshot: unknown; version: number; status: string; quizEligible: boolean; mataKuliahId: string },
 expectedCourseId: string | null,
) {
 if (!expectedCourseId || canonical.mataKuliahId !== expectedCourseId || legacy.id !== canonical.id || !legacy.generationHash || legacy.generationHash !== canonical.generationHash || canonical.status !== 'published' || !canonical.quizEligible || !Number.isSafeInteger(canonical.version) || canonical.version < 1 || legacy.questionType !== canonical.questionType || legacy.prompt !== canonical.prompt || !['multiple_choice', 'multiple_choices'].includes(legacy.questionType)) return null;
 if (!Array.isArray(legacy.options) || !Array.isArray(legacy.correctIndices) || !Array.isArray(canonical.optionsSnapshot) || !legacy.options.length || legacy.options.length !== canonical.optionsSnapshot.length) return null;
 const correct: number[] = [];
 for (let i = 0; i < canonical.optionsSnapshot.length; i++) {
  const option = canonical.optionsSnapshot[i];
  if (!option || typeof option !== 'object' || typeof option.text !== 'string' || typeof option.isCorrect !== 'boolean' || legacy.options[i] !== option.text) return null;
  if (option.isCorrect) correct.push(i);
 }
 if (!correct.length || (legacy.questionType === 'multiple_choice' && correct.length !== 1) || legacy.correctIndices.length !== correct.length || legacy.correctIndices.some((index, i) => index !== correct[i])) return null;
 return { marker: 'canonical-objective-v1' as const, canonicalQuestionId: canonical.id, courseId: canonical.mataKuliahId, sourceVersion: String(canonical.version), answerProof: { questionType: legacy.questionType, correctIndices: correct } };
}
