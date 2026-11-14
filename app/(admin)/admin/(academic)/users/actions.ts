"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  user,
  pengguna,
  penggunaPeran,
  peran,
} from "@/db/schema";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { lockAuthoringIdentityChange } from "@/lib/auth/authoring-actor";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  PERAN_CODES,
  PERAN_SEEDS,
  membershipIdFor,
  peranIdFor,
  mapLegacyRole,
  type PeranCode,
} from "@/lib/auth/peran";
import { toIsoTimestamp } from "@/lib/date-utils";

export type AdminUserItem = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
  legacyRole: string | null;
  roles: PeranCode[];
  status: "active" | "suspended";
  createdAt: string | null;
  updatedAt: string | null;
  lastActivityAt: string | null;
};

export type AdminUserStats = {
  totalUsers: number;
  adminCount: number;
  tutorCount: number;
  muridCount: number;
  activeCount: number;
  suspendedCount: number;
};

export type AdminUsersQuery = { page?: number; search?: string; role?: string; status?: string };
const USERS_PAGE_SIZE = 30;

// Match the compatibility projection: canonical recognized roles win, then the
// legacy role, and finally the student fallback.
function hasRole(code: PeranCode) {
  const canonical = sql`exists (select 1 from ${penggunaPeran} inner join ${peran} on ${penggunaPeran.peranId} = ${peran.id} where ${penggunaPeran.penggunaId} = ${user.id} and ${peran.code} = ${code})`;
  const anyCanonical = sql`exists (select 1 from ${penggunaPeran} inner join ${peran} on ${penggunaPeran.peranId} = ${peran.id} where ${penggunaPeran.penggunaId} = ${user.id} and ${peran.code} in ('admin', 'tutor', 'murid'))`;
  const fallback = code === "admin" ? sql`${user.role} = 'admin'`
    : code === "tutor" ? sql`${user.role} = 'teacher'`
      : sql`coalesce(${user.role}, 'student') not in ('admin', 'teacher')`;
  return sql`(${canonical} or (not ${anyCanonical} and ${fallback}))`;
}

export async function getAdminUsersData(input: AdminUsersQuery = {}): Promise<{
  users: AdminUserItem[];
  stats: AdminUserStats;
  currentUserId: string;
  total: number;
  page: number;
}> {
  const { user: currentAdmin } = await assertAdmin();
  const page = Number.isSafeInteger(input.page) ? Math.max(1, Math.min(input.page!, 100000)) : 1;
  const search = (typeof input.search === "string" ? input.search : "").trim().slice(0, 200).replace(/[\\%_]/g, "\\$&");
  const role = PERAN_CODES.find((code) => code === input.role);
  const condition = and(
    search ? or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`)) : undefined,
    role ? hasRole(role) : undefined,
    input.status === "suspended" ? eq(pengguna.status, "suspended")
      : input.status === "active" ? sql`coalesce(${pengguna.status}, 'active') <> 'suspended'` : undefined,
  );
  const [userRows, [countRow], [summary]] = await Promise.all([
    db.select({ id: user.id, name: user.name, email: user.email, image: user.image,
      emailVerified: user.emailVerified, legacyRole: user.role, createdAt: user.createdAt,
      updatedAt: user.updatedAt, lastActivityAt: user.lastActivityAt, penggunaStatus: pengguna.status,
    }).from(user).leftJoin(pengguna, eq(user.id, pengguna.id)).where(condition)
      .orderBy(desc(user.createdAt), asc(user.id)).limit(USERS_PAGE_SIZE).offset((page - 1) * USERS_PAGE_SIZE),
    db.select({ count: sql<number>`count(*)` }).from(user).leftJoin(pengguna, eq(user.id, pengguna.id)).where(condition),
    db.select({
      totalUsers: sql<number>`count(*)`,
      adminCount: sql<number>`count(*) filter (where ${hasRole("admin")})`,
      tutorCount: sql<number>`count(*) filter (where ${hasRole("tutor")})`,
      muridCount: sql<number>`count(*) filter (where ${hasRole("murid")})`,
      activeCount: sql<number>`count(*) filter (where coalesce(${pengguna.status}, 'active') <> 'suspended')`,
      suspendedCount: sql<number>`count(*) filter (where ${pengguna.status} = 'suspended')`,
    }).from(user).leftJoin(pengguna, eq(user.id, pengguna.id)),
  ]);
  const roleRows = userRows.length ? await db.select({ penggunaId: penggunaPeran.penggunaId, code: peran.code })
    .from(penggunaPeran).innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
    .where(inArray(penggunaPeran.penggunaId, userRows.map((row) => row.id))) : [];
  const rolesByUser = new Map<string, PeranCode[]>();
  for (const row of roleRows) {
    if (PERAN_CODES.includes(row.code as PeranCode)) {
      const list = rolesByUser.get(row.penggunaId) ?? [];
      if (!list.includes(row.code as PeranCode)) list.push(row.code as PeranCode);
      rolesByUser.set(row.penggunaId, list);
    }
  }
  const users = userRows.map((u): AdminUserItem => {
    const roles = rolesByUser.get(u.id) ?? [mapLegacyRole(u.legacyRole) ?? "murid"];
    return { id: u.id, name: u.name, email: u.email, image: u.image ?? null,
      emailVerified: Boolean(u.emailVerified), legacyRole: u.legacyRole ?? null, roles,
      status: u.penggunaStatus === "suspended" ? "suspended" : "active",
      createdAt: toIsoTimestamp(u.createdAt), updatedAt: toIsoTimestamp(u.updatedAt),
      lastActivityAt: u.lastActivityAt ? toIsoTimestamp(u.lastActivityAt) : null };
  });
  return { users, stats: {
    totalUsers: Number(summary.totalUsers), adminCount: Number(summary.adminCount),
    tutorCount: Number(summary.tutorCount), muridCount: Number(summary.muridCount),
    activeCount: Number(summary.activeCount), suspendedCount: Number(summary.suspendedCount),
  }, currentUserId: currentAdmin.id, total: Number(countRow.count), page };
}

export async function updateUserRolesAction(
  targetUserId: string,
  newRoles: PeranCode[]
): Promise<{ success: boolean; error?: string }> {
  const { user: currentAdmin } = await assertAdmin();

  const cleanRoles = Array.from(new Set(newRoles)).filter((r): r is PeranCode =>
    PERAN_CODES.includes(r)
  );

  if (cleanRoles.length === 0) {
    return { success: false, error: "Pengguna harus memiliki minimal satu peran." };
  }

  if (targetUserId === currentAdmin.id && !cleanRoles.includes("admin")) {
    return { success: false, error: "Tidak dapat mencabut peran admin dari akun Anda sendiri." };
  }

  try {
    await db.transaction(async (tx) => {
      if (!(await lockAuthoringIdentityChange(tx, targetUserId))) throw new Error("Pengguna tidak ditemukan.");
      // Ensure seed roles exist
      for (const seed of PERAN_SEEDS) {
        const existing = await tx
          .select({ id: peran.id })
          .from(peran)
          .where(eq(peran.code, seed.code))
          .limit(1);
        if (existing.length === 0) {
          await tx.insert(peran).values(seed);
        }
      }

      // Ensure pengguna row exists
      const existingPengguna = await tx
        .select({ id: pengguna.id })
        .from(pengguna)
        .where(eq(pengguna.id, targetUserId))
        .limit(1);

      const now = new Date();
      if (existingPengguna.length === 0) {
        await tx.insert(pengguna).values({
          id: targetUserId,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      }

      // Remove existing roles
      await tx
        .delete(penggunaPeran)
        .where(eq(penggunaPeran.penggunaId, targetUserId));

      // Insert new roles
      for (const role of cleanRoles) {
        await tx.insert(penggunaPeran).values({
          id: membershipIdFor(targetUserId, role),
          penggunaId: targetUserId,
          peranId: peranIdFor(role),
          source: "admin_role_management",
          auditActorPenggunaId: currentAdmin.id,
          createdAt: now,
        });
      }

      // Synchronize legacy user.role
      const legacyRole = cleanRoles.includes("admin")
        ? "admin"
        : cleanRoles.includes("tutor")
        ? "teacher"
        : "student";

      await tx
        .update(user)
        .set({
          role: legacyRole,
          updatedAt: now,
        })
        .where(eq(user.id, targetUserId));
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/schedules");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating user roles:", error);
    return { success: false, error: error.message || "Gagal memperbarui peran pengguna." };
  }
}

export async function updateUserStatusAction(
  targetUserId: string,
  status: "active" | "suspended"
): Promise<{ success: boolean; error?: string }> {
  const { user: currentAdmin } = await assertAdmin();

  if (targetUserId === currentAdmin.id && status === "suspended") {
    return { success: false, error: "Tidak dapat menangguhkan akun Anda sendiri." };
  }

  try {
    const existing = await db
      .select({ id: pengguna.id })
      .from(pengguna)
      .where(eq(pengguna.id, targetUserId))
      .limit(1);

    const now = new Date();
    if (existing.length === 0) {
      await db.insert(pengguna).values({
        id: targetUserId,
        status,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await db
        .update(pengguna)
        .set({
          status,
          updatedAt: now,
        })
        .where(eq(pengguna.id, targetUserId));
    }

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating user status:", error);
    return { success: false, error: error.message || "Gagal memperbarui status pengguna." };
  }
}
