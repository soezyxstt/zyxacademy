"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { groupNameChangeAudit } from "@/db/schedule-extras";
import { groupMembers, groups } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  getGroupNameChangePolicy,
  normalizeGroupName,
  validateGroupName,
} from "@/lib/groups/group-name-policy";

async function requireStudentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user;
}

async function getLeaderMembership(userId: string, groupId: string) {
  return db.query.groupMembers.findFirst({
    where: and(eq(groupMembers.userId, userId), eq(groupMembers.groupId, groupId)),
    with: { group: true },
  });
}

async function getLatestNameChange(groupId: string) {
  const rows = await db
    .select({ changedAt: groupNameChangeAudit.changedAt })
    .from(groupNameChangeAudit)
    .where(eq(groupNameChangeAudit.groupId, groupId))
    .orderBy(desc(groupNameChangeAudit.changedAt))
    .limit(1);
  return rows[0]?.changedAt ?? null;
}

export async function getGroupRenameStatus(groupId: string) {
  const currentUser = await requireStudentUser();
  const membership = await getLeaderMembership(currentUser.id, groupId);

  if (!membership?.group) {
    return { success: false as const, error: "Kelompok tidak ditemukan." };
  }

  if (membership.role !== "leader") {
    return {
      success: false as const,
      error: "Hanya ketua kelompok yang dapat mengganti nama kelompok.",
    };
  }

  const lastChangedAt = await getLatestNameChange(groupId);
  const policy = getGroupNameChangePolicy(lastChangedAt);

  return {
    success: true as const,
    currentName: membership.group.name,
    canRename: policy.canRename,
    lastChangedAt: lastChangedAt?.toISOString() ?? null,
    nextRenameAt: policy.nextRenameAt?.toISOString() ?? null,
  };
}

export async function renameStudentGroup(groupId: string, proposedName: string) {
  const currentUser = await requireStudentUser();
  const normalizedName = normalizeGroupName(proposedName);
  const validationError = validateGroupName(normalizedName);

  if (validationError) {
    return { success: false as const, error: validationError };
  }

  const membership = await getLeaderMembership(currentUser.id, groupId);
  if (!membership?.group) {
    return { success: false as const, error: "Kelompok tidak ditemukan." };
  }

  if (membership.role !== "leader") {
    return {
      success: false as const,
      error: "Hanya ketua kelompok yang dapat mengganti nama kelompok.",
    };
  }

  if (membership.group.name === normalizedName) {
    return {
      success: true as const,
      changed: false,
      name: membership.group.name,
      nextRenameAt: null,
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const latestRows = await tx
        .select({ changedAt: groupNameChangeAudit.changedAt })
        .from(groupNameChangeAudit)
        .where(eq(groupNameChangeAudit.groupId, groupId))
        .orderBy(desc(groupNameChangeAudit.changedAt))
        .limit(1);
      const latestChangedAt = latestRows[0]?.changedAt ?? null;
      const now = new Date();
      const policy = getGroupNameChangePolicy(latestChangedAt, now);

      if (!policy.canRename) {
        return {
          success: false as const,
          error: "Nama kelompok hanya dapat diganti satu kali setiap 30 hari.",
          nextRenameAt: policy.nextRenameAt?.toISOString() ?? null,
        };
      }

      const currentRows = await tx
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);
      const currentGroup = currentRows[0];

      if (!currentGroup) {
        return { success: false as const, error: "Kelompok tidak ditemukan." };
      }

      if (currentGroup.name === normalizedName) {
        return {
          success: true as const,
          changed: false,
          name: currentGroup.name,
          nextRenameAt: policy.nextRenameAt?.toISOString() ?? null,
        };
      }

      await tx
        .update(groups)
        .set({ name: normalizedName, updatedAt: now })
        .where(eq(groups.id, groupId));

      await tx.insert(groupNameChangeAudit).values({
        id: randomUUID(),
        groupId,
        changedById: currentUser.id,
        oldName: currentGroup.name,
        newName: normalizedName,
        changedAt: now,
      });

      const nextPolicy = getGroupNameChangePolicy(now, now);
      return {
        success: true as const,
        changed: true,
        name: normalizedName,
        nextRenameAt: nextPolicy.nextRenameAt?.toISOString() ?? null,
      };
    });

    if (result.success && result.changed) {
      revalidatePath("/dashboard/groups");
      revalidatePath("/dashboard/schedule");
      revalidatePath("/tutor/schedule");
      revalidatePath("/admin/groups");
      revalidatePath("/admin/schedules");
    }

    return result;
  } catch (error) {
    console.error("Failed to rename study group", error);
    return {
      success: false as const,
      error: "Gagal mengganti nama kelompok. Coba lagi.",
    };
  }
}
