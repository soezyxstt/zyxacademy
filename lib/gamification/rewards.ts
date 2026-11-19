import 'server-only';
import { COSMETIC_CATALOG } from './catalog';
import { COSMETIC_FIELDS, cosmeticProfilePatch } from './cosmetic-slots';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { gamificationAccounts, gamificationCosmetics, gamificationInventory, gamificationLpLedger, gamificationProfiles } from '@/db/schema';
import type { EquipGamificationCosmeticsInput } from './contracts';

/** Caller must authorize studentId before invoking these operations. */
export async function purchaseGamificationCosmetic(studentId: string, cosmeticId: string) {
 if (cosmeticId === "zyra-avatar-studio-cat" || !COSMETIC_CATALOG.some(item => item.id === cosmeticId)) throw new Error('COSMETIC_UNAVAILABLE');
 return db.transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${studentId}, 0))`);
  const [existing] = await tx.select().from(gamificationInventory).where(and(eq(gamificationInventory.userId, studentId), eq(gamificationInventory.cosmeticId, cosmeticId))).limit(1);
  if (existing) return { owned: true };
  const [item] = await tx.select().from(gamificationCosmetics).where(and(eq(gamificationCosmetics.id, cosmeticId), eq(gamificationCosmetics.active, true))).limit(1);
  if (!item || item.priceLp < 0) throw new Error('COSMETIC_UNAVAILABLE');
  const [account] = await tx.select().from(gamificationAccounts).where(eq(gamificationAccounts.userId, studentId)).limit(1);
  if (!account || account.lpBalance < item.priceLp) throw new Error('INSUFFICIENT_LP');
  await tx.update(gamificationAccounts).set({ lpBalance: account.lpBalance - item.priceLp, updatedAt: new Date() }).where(eq(gamificationAccounts.userId, studentId));
  await tx.insert(gamificationInventory).values({ userId: studentId, cosmeticId });
  await tx.insert(gamificationLpLedger).values({ id: crypto.randomUUID(), userId: studentId, rewardKey: `purchase:${cosmeticId}`, amount: -item.priceLp, reason: 'purchase' });
  return { owned: true };
 });
}
export async function equipGamificationCosmetics(studentId: string, input: EquipGamificationCosmeticsInput) {
 const patch = cosmeticProfilePatch(input);
 return db.transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${studentId}, 0))`);
  const [profile] = await tx.select().from(gamificationProfiles).where(eq(gamificationProfiles.userId, studentId)).limit(1);
  if (!profile) throw new Error('PROFILE_UNAVAILABLE');
  for (const { input: field, slot } of COSMETIC_FIELDS) {
   const id = input[field];
   if (id == null) continue;
   const [item] = await tx.select({ id: gamificationInventory.cosmeticId }).from(gamificationInventory).innerJoin(gamificationCosmetics, eq(gamificationInventory.cosmeticId, gamificationCosmetics.id)).where(and(eq(gamificationInventory.userId, studentId), eq(gamificationCosmetics.id, id), eq(gamificationCosmetics.slot, slot))).limit(1);
   if (!item) throw new Error('COSMETIC_NOT_OWNED');
  }
  await tx.update(gamificationProfiles).set({ ...patch, updatedAt: new Date() }).where(eq(gamificationProfiles.userId, studentId));
 });
}

/** Explicit post-migration initialization; never invoked by a read. */
export async function seedGamificationCosmetics() {
 const { COSMETIC_CATALOG } = await import('./catalog');
 await db.insert(gamificationCosmetics).values([...COSMETIC_CATALOG]).onConflictDoNothing();
}
