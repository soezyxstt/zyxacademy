import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// Exercise the real batch writer with its database boundary isolated.
test('version-checked quiz events retain legacy records without a second Idea mirror', async () => {
 const source = readFileSync('lib/learning-events.ts', 'utf8');
 const body = source.slice(source.indexOf('export async function recordLearningEvents(')).replace('export ', '');
 const written: any[] = [], mirrored: any[] = [];
 const tx = { insert: () => ({ values: (rows: any[]) => ({ onConflictDoNothing: async () => { written.push(...rows); } }) }) };
 const db = { transaction: async (fn: (tx: unknown) => Promise<void>) => fn(tx) };
 const transform = new Bun.Transpiler({ loader: 'ts' });
 const run = Function('db', 'learningEvents', 'randomUUID', 'dualWriteLearningEvent', transform.transformSync(`${body}\nreturn recordLearningEvents;`))(
  db, {}, () => 'generated', async (_tx: unknown, row: unknown) => { mirrored.push(row); },
 );
 await run([
  { id: 'quiz', studentId: 'u', courseId: 'c', eventType: 'quiz_answer', koId: 'old-idea', correctness: 0, canonicalIdeaEvidenceHandled: true },
  { id: 'other', studentId: 'u', courseId: 'c', eventType: 'material_completed', koId: 'idea', correctness: 1 },
 ]);
 expect(written.map(row => row.id)).toEqual(['quiz', 'other']);
 expect(mirrored.map(row => row.id)).toEqual(['other']);
});
