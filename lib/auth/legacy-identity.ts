import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pengguna, penggunaPeran, peran, user } from "@/db/schema";
import { mapLegacyRole, membershipIdFor } from "./peran";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createLegacyIdentity(tx: Transaction, userId: string, options?: {
  status: "active" | "suspended"; updatedAt: Date;
}) {
 const [legacy] = await tx.select({ role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt })
  .from(user).where(eq(user.id, userId)).limit(1).for("update");
 const role = mapLegacyRole(legacy?.role ?? "student");
 if (!legacy || !role) return false;
 const [seed] = await tx.select({ id: peran.id }).from(peran).where(eq(peran.code, role)).limit(1);
 if (!seed) return false;
 const [created] = await tx.insert(pengguna).values({
  id: userId, status: options?.status ?? "active", createdAt: legacy.createdAt, updatedAt: options?.updatedAt ?? legacy.updatedAt,
 }).onConflictDoNothing().returning({ id: pengguna.id });
 if (!created) return false;
 await tx.insert(penggunaPeran).values({ id: membershipIdFor(userId, role), penggunaId: userId, peranId: seed.id,
  source: "better_auth_user_create", createdAt: legacy.createdAt }).onConflictDoNothing();
 return true;
}

// Only the identity creation winner can copy a legacy role, never an existing roleless identity.
export const ensureLegacyIdentity = cache(async (userId: string) => {
 const [identity] = await db.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, userId)).limit(1);
 if (identity) return;
 await db.transaction(tx => createLegacyIdentity(tx, userId));
});
