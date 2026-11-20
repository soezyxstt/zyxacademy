import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pengguna, penggunaPeran, peran, user } from "@/db/schema";
import { mapLegacyRole, membershipIdFor } from "./peran";

// Only the identity creation winner can copy a legacy role, never an existing roleless identity.
export const ensureLegacyIdentity = cache(async (userId: string) => {
 const [identity] = await db.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, userId)).limit(1);
 if (identity) return;
 await db.transaction(async tx => {
  const [legacy] = await tx.select({ role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt }).from(user).where(eq(user.id, userId)).limit(1);
  const role = mapLegacyRole(legacy?.role ?? "student");
  if (!legacy || !role) return;
  const [seed] = await tx.select({ id: peran.id }).from(peran).where(eq(peran.code, role)).limit(1);
  if (!seed) return;
  const [created] = await tx.insert(pengguna).values({ id: userId, status: "active", createdAt: legacy.createdAt, updatedAt: legacy.updatedAt }).onConflictDoNothing().returning({ id: pengguna.id });
  if (created) await tx.insert(penggunaPeran).values({ id: membershipIdFor(userId, role), penggunaId: userId, peranId: seed.id,
   source: "better_auth_user_create", createdAt: legacy.createdAt }).onConflictDoNothing();
 });
});
