/** Reserve one event of the global budget for each candidate row, grouped in first-seen order. */
export async function scheduleOutboxUsers(
 candidates: readonly { userId: string }[],
 processUser: (userId: string, budget: number) => Promise<{ done: number; denied: number }>,
) {
 const budgets = new Map<string, number>();
 for (const { userId } of candidates) budgets.set(userId, (budgets.get(userId) ?? 0) + 1);
 let processed = 0, rejected = 0, failed = 0;
 for (const [userId, budget] of budgets) {
  try {
   const result = await processUser(userId, budget);
   processed += result.done; rejected += result.denied;
  } catch { failed++; }
 }
 return { processed, rejected, failed };
}
