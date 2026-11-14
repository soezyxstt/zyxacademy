/** Bounded shared history of displayed notifications, scoped by account. */
export type ShownCelebration = { userId: string; id: string };
export const SHOWN_LIMIT = 100;
export function readShown(raw: string | null): ShownCelebration[] {
  try {
    const entries: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(entries)) return [];
    return entries.filter((entry): entry is ShownCelebration => !!entry && typeof entry.userId === 'string' && typeof entry.id === 'string').slice(-SHOWN_LIMIT);
  } catch { return []; }
}
export function rememberShown(entries: ShownCelebration[], userId: string, id: string): ShownCelebration[] {
  return [...entries.filter(entry => entry.userId !== userId || entry.id !== id), { userId, id }].slice(-SHOWN_LIMIT);
}
export function wasShown(entries: ShownCelebration[], userId: string, id: string): boolean {
  return entries.some(entry => entry.userId === userId && entry.id === id);
}
