import { isDeepStrictEqual } from 'node:util';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { db } from '@/db';
import { buktiIdeJawaban, itemAsesmen, jawabanMurid, soal } from '@/db/schema';
import { checkAnswerCorrectness } from '@/lib/gamification/question-grading';
import {
  buildLegacyGradingPolicySnapshot, buildLegacyRenderedQuestionSnapshot, buildLegacyResponseSnapshot,
  deriveLegacyAnswerEvidence, legacyAnswerEvidenceId, legacyAnswerId, legacyItemId,
  type LegacyQuizQuestionSnapshot, type MappedLegacyQuestion,
} from './live-idea-evidence';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Item = typeof itemAsesmen.$inferSelect;
type CanonicalRow = typeof soal.$inferSelect;

/** Accept our exact rubric or a sync snapshot proving the locked question and answer. */
export function compatibleLegacyItem(item: Item, question: LegacyQuizQuestionSnapshot, mapping: MappedLegacyQuestion, canonical: CanonicalRow): boolean {
  if (item.soalId !== question.id || item.contentVersion !== mapping.questionVersion || item.generationHash !== mapping.generationHash) return false;
  const policy = item.gradingPolicySnapshot;
  if (policy.source === 'legacy_exact_canonical_idea_link') {
    return isDeepStrictEqual(policy, buildLegacyGradingPolicySnapshot(question, mapping))
      && isDeepStrictEqual(item.renderedQuestionSnapshot, buildLegacyRenderedQuestionSnapshot(question))
      && isDeepStrictEqual(item.optionOrderSnapshot, question.stable_option_ids ?? []);
  }
  if (!['legacy', 'mcp_assembly'].includes(String(policy.source)) || policy.questionId !== question.id) return false;
  const rendered = item.renderedQuestionSnapshot;
  const options = canonical.optionsSnapshot as { text?: unknown; isCorrect?: unknown }[];
  return rendered.id === question.id && rendered.prompt === question.prompt && rendered.questionType === mapping.questionType
    && isDeepStrictEqual(rendered.optionsSnapshot, canonical.optionsSnapshot)
    && Array.isArray(options) && options.every(option => option && typeof option === 'object')
    && isDeepStrictEqual(options.map(option => option.text), question.options)
    && isDeepStrictEqual(options.flatMap((option, index) => option.isCorrect ? [index] : []), question.correct_indices)
    && isDeepStrictEqual(item.optionOrderSnapshot, options.map((_, index) => String(index)));
}

/** Resolve conflicts in batches and check every referenced row. Key-share locks
 * keep assessment sync from deleting selected items before the answer insert. */
export async function writeLegacyIdeaEvidence(tx: Tx, input: {
  assessmentId: string; attemptId: string; snapshot: LegacyQuizQuestionSnapshot[];
  answers: Record<string, unknown>; mappings: readonly MappedLegacyQuestion[];
  canonicalRows: readonly CanonicalRow[]; now: Date;
}): Promise<Set<string>> {
  const ideaIds = new Set<string>();
  const questions = new Map(input.snapshot.map((question, orderIndex) => [question.id, { question, orderIndex }]));
  const canonical = new Map(input.canonicalRows.map(row => [row.id, row]));
  const candidates = input.mappings.flatMap(mapping => {
    const entry = questions.get(mapping.questionId), row = canonical.get(mapping.questionId);
    if (!entry || !row) return [];
    const { question, orderIndex } = entry;
    return [{ question, mapping, canonical: row, item: {
      id: legacyItemId(input.assessmentId, question.id), asesmenId: input.assessmentId, soalId: question.id, orderIndex,
      renderedQuestionSnapshot: buildLegacyRenderedQuestionSnapshot(question), optionOrderSnapshot: question.stable_option_ids ?? [],
      gradingPolicySnapshot: buildLegacyGradingPolicySnapshot(question, mapping), contentVersion: mapping.questionVersion, generationHash: mapping.generationHash,
    } }];
  });
  if (!candidates.length) return ideaIds;
  await tx.insert(itemAsesmen).values(candidates.map(candidate => candidate.item)).onConflictDoNothing();
  const items = await tx.select().from(itemAsesmen).where(or(
    and(eq(itemAsesmen.asesmenId, input.assessmentId), inArray(itemAsesmen.soalId, candidates.map(c => c.question.id))),
    inArray(itemAsesmen.id, candidates.map(c => c.item.id)),
  )).for('key share');
  const byQuestion = new Map(items.filter(item => item.asesmenId === input.assessmentId).map(item => [item.soalId, item]));
  const withItems = candidates.flatMap(candidate => {
    const item = byQuestion.get(candidate.question.id);
    if (!item || !compatibleLegacyItem(item, candidate.question, candidate.mapping, candidate.canonical)) return [];
    const { question, mapping } = candidate;
    const submitted = input.answers[question.id];
    const isCorrect = checkAnswerCorrectness(question, submitted), isEssay = mapping.questionType === 'essay';
    return [{ ...candidate, isCorrect, answer: {
      id: legacyAnswerId(input.attemptId, question.id), percobaanAsesmenId: input.attemptId, itemAsesmenId: item.id,
      renderedQuestionSnapshot: buildLegacyRenderedQuestionSnapshot(question), optionOrderSnapshot: question.stable_option_ids ?? [],
      responseSnapshot: buildLegacyResponseSnapshot(question, submitted), gradingPolicySnapshot: buildLegacyGradingPolicySnapshot(question, mapping),
      contentVersion: mapping.questionVersion, score: isEssay ? null : isCorrect ? 1 : 0,
      status: isEssay ? 'needs_review' as const : isCorrect ? 'correct' as const : 'incorrect' as const,
      reviewRevision: 0, answeredAt: input.now,
    } }];
  });
  if (!withItems.length) return ideaIds;
  await tx.insert(jawabanMurid).values(withItems.map(candidate => candidate.answer)).onConflictDoNothing();
  const answers = await tx.select().from(jawabanMurid).where(or(
    and(eq(jawabanMurid.percobaanAsesmenId, input.attemptId), inArray(jawabanMurid.itemAsesmenId, withItems.map(c => c.answer.itemAsesmenId))),
    inArray(jawabanMurid.id, withItems.map(c => c.answer.id)),
  )).for('key share');
  const answersById = new Map(answers.map(answer => [answer.id, answer]));
  const contributions = withItems.flatMap(candidate => {
    const expected = candidate.answer, actual = answersById.get(expected.id);
    if (!actual || actual.percobaanAsesmenId !== expected.percobaanAsesmenId || actual.itemAsesmenId !== expected.itemAsesmenId
      || actual.contentVersion !== expected.contentVersion || actual.score !== expected.score || actual.status !== expected.status || actual.reviewRevision !== 0
      || !isDeepStrictEqual(actual.renderedQuestionSnapshot, expected.renderedQuestionSnapshot)
      || !isDeepStrictEqual(actual.optionOrderSnapshot, expected.optionOrderSnapshot)
      || !isDeepStrictEqual(actual.responseSnapshot, expected.responseSnapshot)
      || !isDeepStrictEqual(actual.gradingPolicySnapshot, expected.gradingPolicySnapshot)) return [];
    const derived = deriveLegacyAnswerEvidence({ question: candidate.question, mapping: candidate.mapping, isCorrect: candidate.isCorrect });
    return derived.status === 'derived' ? derived.contributions.map(contribution => ({
      id: legacyAnswerEvidenceId(actual.id, contribution.ideaId), jawabanMuridId: actual.id, ideId: contribution.ideaId,
      scoreContribution: contribution.scoreContribution, weight: contribution.weight, confidence: contribution.confidence,
      evidenceSource: contribution.evidenceSource, rubricVersion: contribution.rubricVersion, derivationStatus: contribution.derivationStatus,
      ambiguous: contribution.ambiguous, affectsMastery: contribution.affectsMastery,
    })) : [];
  });
  if (!contributions.length) return ideaIds;
  const prior = await tx.select().from(buktiIdeJawaban).where(or(
    inArray(buktiIdeJawaban.id, contributions.map(row => row.id)),
    inArray(buktiIdeJawaban.jawabanMuridId, [...new Set(contributions.map(row => row.jawabanMuridId))]),
  )).for('share');
  const matches = (actual: typeof buktiIdeJawaban.$inferSelect, expected: typeof contributions[number]) =>
    Object.entries(expected).every(([key, value]) => isDeepStrictEqual(actual[key as keyof typeof actual], value));
  const incompatibleAnswers = new Set<string>();
  for (const expected of contributions) {
    if (prior.some(actual => (actual.id === expected.id || (actual.jawabanMuridId === expected.jawabanMuridId && actual.ideId === expected.ideId)) && !matches(actual, expected))) incompatibleAnswers.add(expected.jawabanMuridId);
  }
  const accepted = contributions.filter(row => !incompatibleAnswers.has(row.jawabanMuridId));
  if (!accepted.length) return ideaIds;
  await tx.insert(buktiIdeJawaban).values(accepted).onConflictDoNothing();
  const evidence = await tx.select().from(buktiIdeJawaban).where(or(
    inArray(buktiIdeJawaban.id, accepted.map(row => row.id)),
    inArray(buktiIdeJawaban.jawabanMuridId, [...new Set(accepted.map(row => row.jawabanMuridId))]),
  ));
  const byId = new Map(evidence.map(row => [row.id, row]));
  for (const expected of accepted) {
    const actual = byId.get(expected.id);
    if (actual && matches(actual, expected)) ideaIds.add(expected.ideId);
  }
  return ideaIds;
}
