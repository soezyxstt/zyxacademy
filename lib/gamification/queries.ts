import 'server-only';
import { COSMETIC_FIELDS } from './cosmetic-slots';
import { COSMETIC_CATALOG } from './catalog';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { gamificationAccounts, gamificationBadges, gamificationLpLedger, gamificationCosmetics, gamificationInventory, gamificationMissions, gamificationProfiles } from '@/db/schema';
import { BADGE_THRESHOLDS } from './catalog';
import { gamificationMissionWindows } from '@/lib/date-utils';
import type { AchievementBadge, BadgeFamily, CosmeticSlot, GamificationMission, GamificationReward, GamificationSummary, RankKey } from './contracts';

/** Call only after checking that the caller may read this learner's private data. */
export async function getGamificationSummary(studentId: string): Promise<GamificationSummary> {
 const [row] = await db.select().from(gamificationAccounts).where(eq(gamificationAccounts.userId, studentId)).limit(1);
 return row ? { baseXpMicro: row.baseXpMicro, bonusXpMicro: row.bonusXpMicro, courseCreditsMicro: row.courseCreditsMicro, lpBalance: row.lpBalance, rankKey: row.rankKey as RankKey } : { baseXpMicro: 0, bonusXpMicro: 0, courseCreditsMicro: 0, lpBalance: 0, rankKey: 'rakyat' };
}
export async function getAchievementBadges(studentId: string): Promise<AchievementBadge[]> {
 const families = Object.keys(BADGE_THRESHOLDS) as BadgeFamily[];
 const keys = families.flatMap(family => BADGE_THRESHOLDS[family].map((_, index) => `badge:${family}:${index + 1}`));
 const [rows, awards] = await Promise.all([
  db.select().from(gamificationBadges).where(eq(gamificationBadges.userId, studentId)),
  db.select({ rewardKey: gamificationLpLedger.rewardKey, createdAt: gamificationLpLedger.createdAt }).from(gamificationLpLedger).where(and(eq(gamificationLpLedger.userId, studentId), inArray(gamificationLpLedger.rewardKey, keys))).limit(30),
 ]);
 return (Object.keys(BADGE_THRESHOLDS) as BadgeFamily[]).map(family => {
  const row = rows.find(item => item.family === family); const count = row?.count ?? 0;
  return { family, count, tier: row?.tier ?? 0, nextThreshold: BADGE_THRESHOLDS[family].find(value => value > count) ?? null, earnedTiers: awards.filter(award => award.rewardKey.startsWith(`badge:${family}:`)).map(award => ({ tier: Number(award.rewardKey.split(":")[2]), awardedAt: award.createdAt })) };
 });
}
export async function getGamificationMissions(studentId: string): Promise<GamificationMission[]> {
 const now = new Date();
 const windows = gamificationMissionWindows(now);
 return db.select().from(gamificationMissions).where(and(eq(gamificationMissions.userId, studentId), inArray(gamificationMissions.windowKey, [windows.day.key, windows.week.key]), gt(gamificationMissions.endsAt, now))).limit(4);
}
export async function getGamificationRewards(studentId: string): Promise<GamificationReward[]> {
 const [items, owned, profile] = await Promise.all([
  db.select().from(gamificationCosmetics).where(and(eq(gamificationCosmetics.active, true), inArray(gamificationCosmetics.id, COSMETIC_CATALOG.filter(item => item.active).map(item => item.id)))).limit(COSMETIC_CATALOG.length),
  db.select().from(gamificationInventory).where(and(eq(gamificationInventory.userId, studentId), inArray(gamificationInventory.cosmeticId, COSMETIC_CATALOG.filter(item => item.active).map(item => item.id)))).limit(COSMETIC_CATALOG.length),
  db.select().from(gamificationProfiles).where(eq(gamificationProfiles.userId, studentId)).limit(1),
 ]);
 return items.map(item => ({ id: item.id, name: item.name, slot: item.slot as CosmeticSlot, priceLp: item.priceLp, owned: owned.some(row => row.cosmeticId === item.id), equipped: COSMETIC_FIELDS.map(field => profile[0]?.[field.profile]).includes(item.id) }));
}

/** Private bounded projection; caller authorizes studentId. No initialization on reads. */
export async function getEquippedZyraAppearance(studentId: string) {
 const [profile] = await db.select({ skinId: gamificationProfiles.equippedZyraSkinId, avatarId: gamificationProfiles.equippedZyraAvatarId }).from(gamificationProfiles).where(eq(gamificationProfiles.userId, studentId)).limit(1);
 if (!profile) return { skinId: null, avatarId: null };
 const ids = [profile.skinId, profile.avatarId].filter((id): id is string => !!id);
 if (!ids.length) return { skinId: null, avatarId: null };
 const owned = await db.select({ id: gamificationInventory.cosmeticId, slot: gamificationCosmetics.slot }).from(gamificationInventory).innerJoin(gamificationCosmetics, eq(gamificationInventory.cosmeticId, gamificationCosmetics.id)).where(and(eq(gamificationInventory.userId, studentId), inArray(gamificationInventory.cosmeticId, ids))).limit(2);
 return {
  skinId: owned.some(item => item.id === profile.skinId && item.slot === 'zyra_skin') ? profile.skinId : null,
  avatarId: owned.some(item => item.id === profile.avatarId && item.slot === 'zyra_avatar' && item.id.startsWith('zyra-avatar-studio-')) ? profile.avatarId : null,
 };
}
