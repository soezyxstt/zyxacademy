import { RANKS } from './catalog';

/** Applies the catalog bonus once to the unmodified base provider-turn limit. */
export function rankProviderTurnLimit(base: number, rankKey: string | null, hardCap?: number): number {
  if (base <= 0) return 0;
  const maxPercent = Math.max(...RANKS.map((rank) => rank.zyraPercent));
  const percent = RANKS.find((rank) => rank.key === rankKey)?.zyraPercent ?? 0;
  const catalogCap = Math.floor(base * (100 + maxPercent) / 100);
  const limit = Math.floor(base * (100 + percent) / 100);
  return Math.max(0, Math.min(limit, catalogCap, hardCap ?? catalogCap));
}

/** Read the winning immutable snapshot after a conflict-safe insert. */
export async function getDailyRankSnapshot(
  read: () => Promise<string | null>,
  insertIfAbsent: () => Promise<void>,
): Promise<string> {
  const existing = await read();
  if (existing !== null) return existing;
  await insertIfAbsent();
  const saved = await read();
  if (saved === null) throw new Error("Daily rank snapshot unavailable");
  return saved;
}
