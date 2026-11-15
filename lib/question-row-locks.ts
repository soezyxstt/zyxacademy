import { asc, inArray } from 'drizzle-orm';
import type { db } from '@/db';
import { aiQuestionBank, soal } from '@/db/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** When both representations are needed, lock all canonical rows first, then
 * all compatibility rows. Each set is acquired in ID order. */
export async function lockCanonicalQuestionRows(tx: Tx, ids: readonly string[], mode: 'share' | 'update') {
 const unique = [...new Set(ids)].sort();
 if (!unique.length) return [];
 return tx.select().from(soal).where(inArray(soal.id, unique)).orderBy(asc(soal.id)).for(mode);
}

export async function lockQuestionBankRows(tx: Tx, ids: readonly string[]) {
 const unique = [...new Set(ids)].sort();
 if (!unique.length) return;
 await tx.select({ id: aiQuestionBank.id }).from(aiQuestionBank).where(inArray(aiQuestionBank.id, unique)).orderBy(asc(aiQuestionBank.id)).for('update');
}
