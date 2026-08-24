"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  user,
  pengguna,
  penggunaPeran,
  peran,
} from "@/db/schema";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { eq, inArray, desc } from "drizzle-orm";
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

export async function getAdminUsersData(): Promise<{
  users: AdminUserItem[];
  stats: AdminUserStats;
  currentUserId: string;
}> {
  const { user: currentAdmin } = await assertAdmin();

  // Query all users and left join pengguna
  const [userRows, roleRows] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        emailVerified: user.emailVerified,
        legacyRole: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastActivityAt: user.lastActivityAt,
        penggunaStatus: pengguna.status,
      })
      .from(user)
      .leftJoin(pengguna, eq(user.id, pengguna.id))
      .orderBy(desc(user.createdAt)),
    db
      .select({
        penggunaId: penggunaPeran.penggunaId,
        code: peran.code,
      })
      .from(penggunaPeran)
      .innerJoin(peran, eq(penggunaPeran.peranId, peran.id)),
  ]);

  const rolesByUser = new Map<string, PeranCode[]>();
  for (const row of roleRows) {
    if (PERAN_CODES.includes(row.code as PeranCode)) {
      const list = rolesByUser.get(row.penggunaId) ?? [];
      const code = row.code as PeranCode;
      if (!list.includes(code)) list.push(code);
      rolesByUser.set(row.penggunaId, list);
    }
  }

  const users: AdminUserItem[] = userRows.map((u) => {
    let roles = rolesByUser.get(u.id) ?? [];
    if (roles.length === 0 && u.legacyRole) {
      const mapped = mapLegacyRole(u.legacyRole);
      if (mapped) roles = [mapped];
    }
    if (roles.length === 0) {
      roles = ["murid"];
    }

    const status: "active" | "suspended" = u.penggunaStatus === "suspended" ? "suspended" : "active";

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image ?? null,
      emailVerified: Boolean(u.emailVerified),
      legacyRole: u.legacyRole ?? null,
      roles,
      status,
      createdAt: toIsoTimestamp(u.createdAt),
      updatedAt: toIsoTimestamp(u.updatedAt),
      lastActivityAt: u.lastActivityAt ? toIsoTimestamp(u.lastActivityAt) : null,
    };
  });

  let adminCount = 0;
  let tutorCount = 0;
  let muridCount = 0;
  let activeCount = 0;
  let suspendedCount = 0;

  for (const u of users) {
    if (u.roles.includes("admin")) adminCount++;
    if (u.roles.includes("tutor")) tutorCount++;
    if (u.roles.includes("murid")) muridCount++;
    if (u.status === "active") activeCount++;
    else suspendedCount++;
  }

  return {
    users,
    stats: {
      totalUsers: users.length,
      adminCount,
      tutorCount,
      muridCount,
      activeCount,
      suspendedCount,
    },
    currentUserId: currentAdmin.id,
  };
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
