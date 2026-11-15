import 'server-only';
import { db } from '@/db';
import { gamificationEventOutbox } from '@/db/schema';
import type { GamificationEventInput } from './contracts';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Only call inside the transaction that persisted the server-owned source evidence. */
export async function enqueueGamificationEventsBatch(tx: Transaction, inputs: GamificationEventInput[]) {
 const rows = inputs.map(input => {
  const occurredAt = new Date(input.occurredAt);
  if (!input.userId || !input.sourceId || !input.evidenceId || !Number.isFinite(occurredAt.getTime()) || !['article', 'explanation', 'question', 'flashcard'].includes(input.source)) throw new Error('INVALID_GAMIFICATION_EVENT');
  return { id: crypto.randomUUID(), ...input, occurredAt };
 });
 if (rows.length) await tx.insert(gamificationEventOutbox).values(rows).onConflictDoNothing();
}
export async function enqueueGamificationEvent(tx: Transaction, input: GamificationEventInput) {
 await enqueueGamificationEventsBatch(tx, [input]);
}
