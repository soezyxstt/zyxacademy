import { CATEGORY_POOLS, MICRO, RANKS } from './catalog';
import type { ChecklistCategory } from './contracts';

export function rankForTotals(totalXpMicro: number, courseCreditsMicro: number) {
 return [...RANKS].reverse().find(rank => totalXpMicro >= rank.xp * MICRO && courseCreditsMicro >= rank.courses * MICRO)!;
}
/** Allocate the exact capped pool by stable item ID, independent of input order. */
export function allocateChecklistXp(category: ChecklistCategory, ids: readonly string[]): Map<string, number> {
 const sorted = [...ids].sort();
 if (new Set(sorted).size !== sorted.length) throw new Error('DUPLICATE_CHECKLIST_ITEM');
 if (!sorted.length) return new Map();
 const { reference, xp } = CATEGORY_POOLS[category];
 const pool = Math.floor(xp * MICRO * Math.min(sorted.length, reference) / reference);
 const base = Math.floor(pool / sorted.length);
 const remainder = pool % sorted.length;
 return new Map(sorted.map((id, i) => [id, base + (i < remainder ? 1 : 0)]));
}
export function courseCreditMicro(totalPossibleXpMicro: number): number {
 return Math.min(MICRO, Math.floor(totalPossibleXpMicro / 10000));
}
