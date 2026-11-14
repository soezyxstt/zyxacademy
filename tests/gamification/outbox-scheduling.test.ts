import { expect, test } from 'bun:test';
import { scheduleOutboxUsers } from '../../lib/gamification/outbox-scheduling';

test('processes older occurrences outside the creation window within its global budget', async () => {
 const rows = [
  { id: 'a-new', userId: 'a', created: 1, occurred: 9 },
  { id: 'b', userId: 'b', created: 2, occurred: 2 },
  { id: 'a-mid', userId: 'a', created: 3, occurred: 5 },
  { id: 'a-old', userId: 'a', created: 4, occurred: 1 },
 ];
 const candidates = rows.slice(0, 3);
 const seen: string[] = [];
 const result = await scheduleOutboxUsers(candidates, async (userId, budget) => {
  const pending = rows.filter(row => row.userId === userId).sort((a, b) => a.occurred - b.occurred).slice(0, budget);
  seen.push(...pending.map(row => row.id));
  return { done: pending.length, denied: 0 };
 });
 expect(seen).toEqual(['a-old', 'a-mid', 'b']);
 expect(result).toEqual({ processed: 3, rejected: 0, failed: 0 });
});

test('concurrent runs recheck pending under a user lock and isolate a failure', async () => {
 const pending = new Set(['a1', 'a2', 'b1']);
 const locks = new Map<string, Promise<void>>();
 const calls: string[] = [];
 const processUser = async (userId: string, budget: number) => {
  const previous = locks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  locks.set(userId, current);
  await previous;
  try {
   if (userId === 'bad') throw new Error('infrastructure');
   const selected = [...pending].filter(id => id.startsWith(userId)).slice(0, budget);
   await Promise.resolve();
   for (const id of selected) { calls.push(id); pending.delete(id); }
   return { done: selected.length, denied: 0 };
  } finally { release(); }
 };
 const candidates = [{ userId: 'a' }, { userId: 'bad' }, { userId: 'b' }];
 const results = await Promise.all([scheduleOutboxUsers(candidates, processUser), scheduleOutboxUsers(candidates, processUser)]);
 expect(calls.sort()).toEqual(['a1', 'a2', 'b1']);
 expect(results.map(result => result.failed)).toEqual([1, 1]);
 expect(results.every(result => result.processed + result.rejected <= candidates.length)).toBe(true);
});
