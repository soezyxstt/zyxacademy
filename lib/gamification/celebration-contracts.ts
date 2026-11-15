import type { BadgeFamily, RankKey } from './contracts';

export interface Celebration {
 id: string;
 kind: 'badge' | 'rank';
 family?: BadgeFamily;
 tier?: number;
 rank?: RankKey;
 lp?: number;
}

const families: readonly string[] = ['warrior_reader', 'practice_knight', 'memory_guardian', 'steady_scholar', 'comeback_champion', 'consistency_captain'];
const ranks: readonly string[] = ['kades', 'camat', 'bupati', 'gubernur', 'presiden'];

export function parseCelebration(id: string, value: unknown): Celebration | null {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 const m = value as Record<string, unknown>;
 if (m.namespace !== 'gamification') return null;
 if (m.kind === 'badge' && typeof m.family === 'string' && families.includes(m.family) && Number.isInteger(m.tier) && (m.tier as number) >= 1 && (m.tier as number) <= 5 && Number.isInteger(m.lp) && (m.lp as number) >= 0 && (m.lp as number) <= 400) return { id, kind: 'badge', family: m.family as BadgeFamily, tier: m.tier as number, lp: m.lp as number };
 if (m.kind === 'rank' && typeof m.rank === 'string' && ranks.includes(m.rank)) return { id, kind: 'rank', rank: m.rank as RankKey };
 return null;
}

export function parseCelebrationAck(value: unknown): string[] | null {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1) return null;
 const ids = (value as Record<string, unknown>).ids;
 if (!Array.isArray(ids) || ids.length < 1 || ids.length > 10 || ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 200) || new Set(ids).size !== ids.length) return null;
 return ids;
}
