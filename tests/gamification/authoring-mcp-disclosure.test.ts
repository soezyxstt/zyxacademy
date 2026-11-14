import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { getTableName, sql } from 'drizzle-orm';
import { aiQuestionBank, assessmentSources, ide, pembahasanSoal, questionReferenceLinks, soal, soalIde, gamificationQuestionBankDisclosures } from '../../db/schema';
import { isEligibleQuestionRetry } from '../../lib/gamification/evidence';

const source = readFileSync('lib/authoring/mcp-server.ts', 'utf8');
const transpiler = new Bun.Transpiler({ loader: 'ts' });
const exposureSource = readFileSync('lib/gamification/question-exposure.ts', 'utf8');
const lockCode = exposureSource.slice(exposureSource.indexOf('export async function lockQuestionExposureUser'), exposureSource.indexOf('export async function lockQuestionExposure(')).replace('export ', '');
const globalCode = exposureSource.slice(exposureSource.indexOf('export async function recordAuthorizedGlobalDisclosures'), exposureSource.indexOf('/** Resolve question IDs exclusively')).replace('export ', '');
const recordAuthorizedGlobalDisclosures = Function('sql', 'gamificationQuestionBankDisclosures', transpiler.transformSync(`${lockCode}\n${globalCode}\nreturn recordAuthorizedGlobalDisclosures;`))(sql, gamificationQuestionBankDisclosures);

type Disclosure = { userId: string; questionId: string; courseId: string; exposedAt: Date };
function harness(tool: string, options: { missing?: boolean; deny?: boolean; failWrite?: boolean; includeContent?: boolean } = {}) {
 const principal = { userId: 'authenticated-user', actorId: 'other-actor', scopes: options.deny ? [] : ['authoring:read'] };
 const run = { courseId: 'course', chapterId: 'chapter' };
 const question = { id: 'question', courseId: 'course', mataKuliahId: 'course', origin: 'historical_reference', questionType: 'multiple_choice', prompt: 'Question', optionsSnapshot: [{ text: 'A', isCorrect: true }], version: 1, status: 'published' };
 const writes: Disclosure[] = [];
 const tx = { execute: async () => {}, insert: () => ({ values: (rows: Disclosure[]) => ({ onConflictDoNothing: async () => { if (options.failWrite) throw new Error('WRITE_FAILED'); writes.push(...rows); } }) }) };
 const db = {
  select: () => ({ from: (table: unknown) => {
   const rows = getTableName(table as any) === getTableName(soal) ? (options.missing ? [] : [question]) : getTableName(table as any) === getTableName(aiQuestionBank) ? [{ correctIndices: [0], acceptableAnswers: [], explanation: 'Answer' }] : [];
   const chain: any = { innerJoin: () => chain, where: () => chain, orderBy: () => chain, limit: async () => rows, then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject) };
   return chain;
  } }),
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
 };
 const offset = source.indexOf(`registerTool("${tool}"`);
 if (offset < 0) throw new Error('Tool missing');
 const start = source.indexOf('}, async (', offset) + 3;
 const end = source.indexOf('\n  }));', start);
 const callback = source.slice(start, end + 5);
 const code = transpiler.transformSync(`return (${callback});`);
 const dependencies: Record<string, unknown> = {
  principal, db, recordAuthorizedGlobalDisclosures, soal, soalIde, ide, questionReferenceLinks, assessmentSources, aiQuestionBank, pembahasanSoal,
  requireMcpScope: () => { if (options.deny) throw new Error('DENIED'); },
  readMcpRunToken: () => run, requireHistoricalReadWorkflow: () => run,
  eq: () => ({}), and: () => ({}), desc: () => ({}), runScope: () => ({}),
  historicalSourceAttribution: () => ({}), loadQuestionExplanationAndSolution: async () => ({ answer: { correctIndices: [0] }, explanation: 'Answer', solution: null }),
  resolveProductDependencyState: async () => ({}), safeTool: async (fn: () => Promise<unknown>) => { try { return await fn(); } catch (error) { return { error: (error as Error).message }; } },
 };
 const handler = Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
 const input = { runToken: 'run', questionId: 'question', productId: 'question', productType: 'question', includeContent: options.includeContent ?? true };
 return { handler, input, writes };
}

for (const tool of ['assessment.get_question', 'assessment.get_reference_question', 'knowledge.get_product']) {
 test(`${tool} records the authenticated viewer before releasing answers and denies same-day XP`, async () => {
  const h = harness(tool);
  const result = await h.handler(h.input);
  expect(result.ok).toBe(true);
  expect(h.writes).toHaveLength(1);
  expect(h.writes[0]).toMatchObject({ userId: 'authenticated-user', questionId: 'question', courseId: 'course' });
  expect(isEligibleQuestionRetry({ correct: true, attemptId: 'later', occurredAt: h.writes[0].exposedAt, lastReveal: { attemptId: 'bank', occurredAt: h.writes[0].exposedAt } })).toBe(false);
 });
 test(`${tool} withholds answers on denied access, absent question, or disclosure failure`, async () => {
  for (const options of [{ deny: true }, { missing: true }, { failWrite: true }]) {
   const h = harness(tool, options);
   const result = await h.handler(h.input);
   expect(result.ok).toBeUndefined();
   expect(result.error).toBeDefined();
   expect(h.writes).toHaveLength(0);
  }
 });
}
test('question product metadata without content does not record an answer disclosure', async () => {
 const h = harness('knowledge.get_product', { includeContent: false });
 const result = await h.handler(h.input);
 expect(result.ok).toBe(true);
 expect(result.answer).toBeNull();
 expect(h.writes).toHaveLength(0);
});
