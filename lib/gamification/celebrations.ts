import 'server-only';
import { createHash } from 'node:crypto';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import type { BadgeFamily, RankKey } from './contracts';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
function notificationId(parts: string[]) {
 const hash = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
 return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${((parseInt(hash[16], 16) & 3) | 8).toString(16)}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
const badgeNames: Record<BadgeFamily, string> = {
 warrior_reader: 'Warrior reader', practice_knight: 'Practice knight', memory_guardian: 'Memory guardian', steady_scholar: 'Steady scholar', comeback_champion: 'Comeback champion', consistency_captain: 'Consistency captain',
};
export async function announceBadge(tx: Tx, userId: string, family: BadgeFamily, tier: number, lp: number) {
 await tx.insert(notifications).values({ id: notificationId([userId, 'badge', family, String(tier)]), userId, type: 'announcement', title: 'Lencana baru', body: `${badgeNames[family]} tingkat ${tier}, +${lp} LP`, metadata: { namespace: 'gamification', kind: 'badge', family, tier, lp } }).onConflictDoNothing();
}
export async function announceRank(tx: Tx, userId: string, rank: RankKey) {
 await tx.insert(notifications).values({ id: notificationId([userId, 'rank', rank]), userId, type: 'announcement', title: 'Peringkat naik', body: `Peringkat ${rank.charAt(0).toUpperCase() + rank.slice(1)} tercapai`, metadata: { namespace: 'gamification', kind: 'rank', rank } }).onConflictDoNothing();
}
