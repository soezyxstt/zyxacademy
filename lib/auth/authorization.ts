import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pengguna, penggunaPeran, peran } from "@/db/schema";
import {
 mapLegacyRole,
 membershipIdFor,
 PERAN_CODES,
 PERAN_SEEDS,
 peranIdFor,
 type PeranCode,
 normalizePeranCodes,
} from "@/lib/auth/peran";

export type AuthorizationOptions = {
 allowAdmin?: boolean;
};

export function hasPeranFromCodes(
 codes: readonly string[],
 required: PeranCode,
 options: AuthorizationOptions = {},
): boolean {
 const normalized = normalizePeranCodes(codes);
 return normalized.includes(required) || (options.allowAdmin === true && normalized.includes("admin"));
}

export function hasAnyPeranFromCodes(
 codes: readonly string[],
 required: readonly PeranCode[],
 options: AuthorizationOptions = {},
): boolean {
 const normalized = normalizePeranCodes(codes);
 return required.some((code) => normalized.includes(code))
  || (options.allowAdmin === true && normalized.includes("admin"));
}

export async function getPeranCodes(penggunaId: string): Promise<PeranCode[]> {
 const rows = await db
  .select({ code: peran.code })
  .from(penggunaPeran)
  .innerJoin(pengguna, eq(penggunaPeran.penggunaId, pengguna.id))
  .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
  .where(and(
   eq(pengguna.id, penggunaId),
   eq(pengguna.status, "active"),
   inArray(peran.code, [...PERAN_CODES]),
  ));

 return normalizePeranCodes(rows.map((row) => row.code));
}

export async function hasPeran(
 penggunaId: string,
 required: PeranCode,
 options: AuthorizationOptions = {},
): Promise<boolean> {
 return hasPeranFromCodes(await getPeranCodes(penggunaId), required, options);
}

export async function hasAnyPeran(
 penggunaId: string,
 required: readonly PeranCode[],
 options: AuthorizationOptions = {},
): Promise<boolean> {
 return hasAnyPeranFromCodes(await getPeranCodes(penggunaId), required, options);
}

export async function provisionPenggunaForNewUser(input: {
 id: string;
 role?: unknown;
 createdAt?: Date;
 updatedAt?: Date;
}): Promise<void> {
 const mappedRole = input.role === undefined ? "murid" : mapLegacyRole(input.role);
 if (!mappedRole) throw new Error("New user has an unsupported legacy role");

 await db.transaction(async (tx) => {
  for (const seed of PERAN_SEEDS) {
   const existing = await tx.select({ id: peran.id }).from(peran).where(eq(peran.code, seed.code)).limit(1);
   if (existing.length === 0) {
    await tx.insert(peran).values(seed);
   } else if (existing[0].id !== seed.id) {
    throw new Error(`Peran id mismatch for ${seed.code}`);
   }
  }

  const identity = await tx.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, input.id)).limit(1);
  if (identity.length === 0) {
   await tx.insert(pengguna).values({
    id: input.id,
    status: "active",
    createdAt: input.createdAt ?? new Date(),
    updatedAt: input.updatedAt ?? new Date(),
   });
  }

  const membershipId = membershipIdFor(input.id, mappedRole);
  const roleId = peranIdFor(mappedRole);
  const membership = await tx.select({ id: penggunaPeran.id })
   .from(penggunaPeran)
   .where(eq(penggunaPeran.id, membershipId))
   .limit(1);
  if (membership.length === 0) {
   await tx.insert(penggunaPeran).values({
    id: membershipId,
    penggunaId: input.id,
    peranId: roleId,
    source: "better_auth_user_create",
    auditActorPenggunaId: null,
   });
  }
 });
}
