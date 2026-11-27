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
import { adminUserRolesRevision, lockAdminUserRoles, replaceAdminUserRoles } from "@/lib/admin/user-roles";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  PERAN_CODES,
  mapLegacyRole,
  type PeranCode,
} from "@/lib/auth/peran";
import { toIsoTimestamp } from "@/lib/date-utils";
import { adminUserStatusRevision, assertAdminUserStatusChange, assertWebUserStatusActor, lockAdminUserStatus, lockAdminUserStatusActors, updateAdminUserStatus } from "@/lib/admin/user-status";

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
type AdminUserRow = AdminUserItem & { statusRevision: string; roleSelection: ReturnType<typeof adminUserRolesRevision> };
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
  users: AdminUserRow[];
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
      penggunaUpdatedAt: pengguna.updatedAt, identityId: pengguna.id,
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
  const users = userRows.map((u): AdminUserRow => {
    const roles = rolesByUser.get(u.id) ?? [mapLegacyRole(u.legacyRole) ?? "murid"];
    const { status, revision: statusRevision } = adminUserStatusRevision(u.id, u.penggunaStatus === "suspended" ? "suspended" : "active", u.penggunaUpdatedAt);
    return { id: u.id, name: u.name, email: u.email, image: u.image ?? null,
      emailVerified: Boolean(u.emailVerified), legacyRole: u.legacyRole ?? null, roles,
      status, statusRevision, roleSelection: adminUserRolesRevision(u.id, u.identityId === null ? roles : rolesByUser.get(u.id) ?? []),
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
  const { user: currentAdmin, session } = await assertAdmin();

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
      await lockAdminUserStatusActors(tx, currentAdmin.id, targetUserId);
      await assertWebUserStatusActor(tx, currentAdmin.id, session?.session.id);
      await lockAdminUserRoles(tx, targetUserId);
      await replaceAdminUserRoles(tx, targetUserId, currentAdmin.id, cleanRoles);
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/schedules");
    return { success: true };
  } catch (error: any) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") return { success: false, error: "Pengguna tidak ditemukan." };
    console.error("Error updating user roles:", error);
    return { success: false, error: error.message || "Gagal memperbarui peran pengguna." };
  }
}

export async function updateUserStatusAction(
  targetUserId: string,
  status: "active" | "suspended"
): Promise<{ success: boolean; error?: string }> {
  const { user: currentAdmin, session } = await assertAdmin();

  try {
    assertAdminUserStatusChange(currentAdmin.id, targetUserId, status);
    await db.transaction(async tx => {
      await lockAdminUserStatusActors(tx, currentAdmin.id, targetUserId);
      await assertWebUserStatusActor(tx, currentAdmin.id, session?.session.id);
      const target = await lockAdminUserStatus(tx, targetUserId);
      await updateAdminUserStatus(tx, target, currentAdmin.id, status);
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error: any) {
    if (error.message === "SELF_SUSPENSION") return { success: false, error: "Tidak dapat menangguhkan akun Anda sendiri." };
    if (error.message === "USER_NOT_FOUND") return { success: false, error: "Pengguna tidak ditemukan." };
    if (error.message === "USER_IDENTITY_UNAVAILABLE") return { success: false, error: "Identitas pengguna belum tersedia." };
    console.error("Error updating user status:", error);
    return { success: false, error: error.message || "Gagal memperbarui status pengguna." };
  }
}
