import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, asc, eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { courses, groups, groupCourses, groupMembers, enrollmentTokens, enrollmentTokenCourses, enrollments, pengguna } from "@/db/schema";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import { dualWriteEnrollment } from "@/lib/migrasi/repository-kompatibilitas";
import { PACKAGE_PRESETS } from "@/lib/group-constants";
import { normalizeGroupName, validateGroupName } from "@/lib/groups/group-name-policy";
import { minutesAgo, normalizeDate } from "@/lib/date-utils";
import { adminToolkit, adminId, adminRevision } from "./toolkit";
import { AdminMcpError, revisionOf, type AdminTransaction } from "./mutations";
type Source = typeof db | AdminTransaction;
const uniqueCourses = z.array(adminId).min(1).max(100).refine(v => new Set(v).size === v.length);
const groupDefinition = z.object({ name: z.string().transform(normalizeGroupName).refine(v => !validateGroupName(v)), packageType: z.enum(["reguler_15", "intensif_30", "super_intensif_45", "custom"]), totalQuotaSessions: z.number().int().min(0).max(100000).optional(), weeklyQuotaSessions: z.number().int().min(0).max(100000).optional(), academicYear: z.string().regex(/^\d{4}\/\d{4}$/), semester: z.string().trim().min(1).max(50), startDate: z.iso.datetime({ offset: true }), endDate: z.iso.datetime({ offset: true }), courseIds: uniqueCourses }).strict();
function packageValues(input: z.infer<typeof groupDefinition>) {
  if (Date.parse(input.startDate) >= Date.parse(input.endDate)) throw new AdminMcpError("INVALID_DATE_RANGE");
  const preset = PACKAGE_PRESETS[input.packageType];
  const total = input.totalQuotaSessions ?? preset.quota;
  const weekly = total === 0 ? 0 : input.weeklyQuotaSessions ?? preset.weeklySessions;
  if (weekly > total) throw new AdminMcpError("INVALID_WEEKLY_QUOTA");
  const packageType: z.infer<typeof groupDefinition>["packageType"] = input.packageType === "custom" || total !== preset.quota || weekly !== preset.weeklySessions ? "custom" : input.packageType;
  return { name: input.name, packageType, packageName: packageType === "custom" ? `Paket Kustom (${total} Sesi)` : preset.name, totalQuotaSessions: total, weeklyQuotaSessions: weekly, academicYear: input.academicYear, semester: input.semester, startDate: new Date(input.startDate), endDate: new Date(input.endDate) };
}
export function redactActivationToken(text: string) { return text.replace(/Zyx-[A-Za-z0-9]{8}-\d+-\d+/g, "Token aktivasi"); }
export async function inspectGroup(id: string, source: Source = db) {
  const [group] = await source.select().from(groups).where(eq(groups.id, id)).limit(1); if (!group) throw new AdminMcpError("NOT_FOUND");
  const assigned = await source.select({ courseId: groupCourses.courseId }).from(groupCourses).where(eq(groupCourses.groupId, id)).orderBy(asc(groupCourses.courseId));
  const members = await source.select({ id: groupMembers.id, userId: groupMembers.userId, role: groupMembers.role }).from(groupMembers).where(eq(groupMembers.groupId, id)).orderBy(asc(groupMembers.id));
  const tokens = await source.select({ id: enrollmentTokens.id, capacity: enrollmentTokens.capacity, expiresAt: enrollmentTokens.expiresAt }).from(enrollmentTokens).where(eq(enrollmentTokens.groupId, id)).orderBy(asc(enrollmentTokens.id));
  return { group: { ...group, name: redactActivationToken(group.name) }, courses: assigned, memberCount: members.length, capacity: tokens.length ? Math.min(...tokens.map(t => t.capacity)) : 1000, revision: revisionOf({ group, assigned, members, tokens }) };
}
async function validCourses(tx: AdminTransaction, ids: string[]) {
  const rows = await tx.select({ id: courses.id }).from(courses).where(inArray(courses.id, ids)); if (rows.length !== ids.length) throw new AdminMcpError("COURSE_NOT_FOUND");
}
async function enrollMember(tx: AdminTransaction, userId: string, courseIds: string[], expiresAt: Date, actorId: string) {
  for (const courseId of courseIds) {
    const [old] = await tx.select().from(enrollments).where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))).limit(1);
    if (old && normalizeDate(old.expiresAt).getTime() >= expiresAt.getTime()) continue;
    const row = { id: old?.id ?? crypto.randomUUID(), userId, courseId, enrolledAt: old?.enrolledAt ? normalizeDate(old.enrolledAt) : new Date(), expiresAt };
    if (old) await tx.update(enrollments).set({ expiresAt }).where(eq(enrollments.id, old.id)); else await tx.insert(enrollments).values(row);
    await dualWriteEnrollment(tx, row, actorId);
  }
}
export function registerGroupTools(server: McpServer, principal: McpPrincipal) {
  const { read, write } = adminToolkit(server, principal);
  read("groups.inspect", "groups:read", z.object({ id: adminId }), "Periksa kuota, course, jumlah anggota, kapasitas, dan revisi kelompok untuk mutasi.", ({ id }) => inspectGroup(id));
  write("groups.create", "groups:write", groupDefinition, "Buat kelompok belajar beserta paket dan course yang valid.", async (tx, input) => {
    await validCourses(tx, input.courseIds); const id = crypto.randomUUID(); const now = new Date();
    await tx.insert(groups).values({ ...packageValues(input), id, status: "active", usedQuotaSessions: 0, createdAt: now, updatedAt: now });
    for (const courseId of input.courseIds) await tx.insert(groupCourses).values({ id: crypto.randomUUID(), groupId: id, courseId, createdAt: now });
    return { id, ...await inspectGroup(id, tx) };
  });
  write("groups.update", "groups:write", groupDefinition.extend({ id: adminId, expectedRevision: adminRevision }), "Ubah paket dan course memakai revisi groups.inspect. Penambahan course memberi enrollment kepada anggota yang ada.", async (tx, { id, expectedRevision, ...input }) => {
    const old = await inspectGroup(id, tx); if (old.revision !== expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    const values = packageValues(input); if (values.totalQuotaSessions < old.group.usedQuotaSessions) throw new AdminMcpError("QUOTA_BELOW_USAGE");
    await validCourses(tx, input.courseIds);
    await tx.update(groups).set({ ...values, updatedAt: new Date() }).where(eq(groups.id, id));
    await tx.delete(groupCourses).where(eq(groupCourses.groupId, id));
    for (const courseId of input.courseIds) await tx.insert(groupCourses).values({ id: crypto.randomUUID(), groupId: id, courseId, createdAt: new Date() });
    const members = await tx.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, id));
    for (const member of members) await enrollMember(tx, member.userId, input.courseIds, values.endDate, principal.actorId);
    return { id, ...await inspectGroup(id, tx) };
  });
  write("groups.set_status", "groups:write", z.object({ id: adminId, expectedRevision: adminRevision, status: z.enum(["active", "completed", "inactive", "archived"]) }), "Ubah status kelompok tanpa menghapus riwayat belajar atau enrollment.", async (tx, input) => {
    if ((await inspectGroup(input.id, tx)).revision !== input.expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    await tx.update(groups).set({ status: input.status, updatedAt: new Date() }).where(eq(groups.id, input.id)); return { id: input.id, ...await inspectGroup(input.id, tx) };
  });
  write("groups.members.add", "groups:write", z.object({ id: adminId, expectedRevision: adminRevision, userId: adminId, role: z.enum(["leader", "member"]).default("member") }), "Tambahkan anggota dan enrollment course. Kapasitas dan status kelompok diperiksa dalam transaksi.", async (tx, input) => {
    const group = await inspectGroup(input.id, tx); if (group.revision !== input.expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    if (group.group.status !== "active" || !group.group.endDate || normalizeDate(group.group.endDate).getTime() <= Date.now()) throw new AdminMcpError("GROUP_NOT_ACTIVE");
    if (group.memberCount >= group.capacity) throw new AdminMcpError("GROUP_CAPACITY_REACHED");
    const [person] = await tx.select().from(pengguna).where(and(eq(pengguna.id, input.userId), eq(pengguna.status, "active"))).limit(1); if (!person) throw new AdminMcpError("ACTIVE_USER_REQUIRED");
    const existing = await tx.select({ id: groupMembers.id }).from(groupMembers).where(and(eq(groupMembers.groupId, input.id), eq(groupMembers.userId, input.userId))).limit(1); if (existing.length) throw new AdminMcpError("ALREADY_MEMBER");
    if (input.role === "leader" && (await tx.select({ id: groupMembers.id }).from(groupMembers).where(and(eq(groupMembers.groupId, input.id), eq(groupMembers.role, "leader"))).limit(1)).length) throw new AdminMcpError("LEADER_ALREADY_EXISTS");
    await tx.insert(groupMembers).values({ id: crypto.randomUUID(), groupId: input.id, userId: input.userId, role: input.role, joinedAt: new Date() });
    await enrollMember(tx, input.userId, group.courses.map(c => c.courseId), normalizeDate(group.group.endDate), principal.actorId);
    return { id: input.id, ...await inspectGroup(input.id, tx) };
  });
  write("groups.members.remove", "groups:write", z.object({ id: adminId, expectedRevision: adminRevision, userId: adminId }), "Keluarkan anggota dari kelompok. Enrollment course tetap mengikuti masa akses yang tersimpan.", async (tx, input) => {
    if ((await inspectGroup(input.id, tx)).revision !== input.expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    const deleted = await tx.delete(groupMembers).where(and(eq(groupMembers.groupId, input.id), eq(groupMembers.userId, input.userId))).returning({ id: groupMembers.id }); if (!deleted.length) throw new AdminMcpError("NOT_FOUND");
    return { id: input.id, ...await inspectGroup(input.id, tx) };
  });
  write("groups.adjust_quota", "groups:write", z.object({ id: adminId, expectedRevision: adminRevision, totalQuotaSessions: z.number().int().min(0).max(100000), usedQuotaSessions: z.number().int().min(0).max(100000), weeklyQuotaSessions: z.number().int().min(0).max(100000), reason: z.string().trim().min(3).max(1000) }), "Koreksi kuota dengan alasan yang tercatat; total tidak boleh di bawah penggunaan.", async (tx, { id, expectedRevision, reason, ...quotas }) => {
    if ((await inspectGroup(id, tx)).revision !== expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    if (quotas.usedQuotaSessions > quotas.totalQuotaSessions || quotas.weeklyQuotaSessions > quotas.totalQuotaSessions) throw new AdminMcpError("INVALID_QUOTA");
    await tx.update(groups).set({ ...quotas, updatedAt: new Date() }).where(eq(groups.id, id)); return { id, reason, ...await inspectGroup(id, tx) };
  });
  const tokenView = (row: typeof enrollmentTokens.$inferSelect) => ({ id: row.id, groupId: row.groupId, capacity: row.capacity, expiresAt: normalizeDate(row.expiresAt), revision: revisionOf({ id: row.id, groupId: row.groupId, capacity: row.capacity, expiresAt: row.expiresAt }) });
  read("tokens.get", "access:read", z.object({ id: adminId }), "Lihat metadata token dan revisinya tanpa string aktivasi.", async ({ id }) => {
    const [row] = await db.select().from(enrollmentTokens).where(eq(enrollmentTokens.id, id)).limit(1); if (!row) throw new AdminMcpError("NOT_FOUND"); return tokenView(row);
  });
  read("tokens.reveal", "access:secrets:read", z.object({ id: adminId }), "Ambil string token aktivasi untuk dibagikan kepada penerima yang diizinkan.", async ({ id }) => {
    const [row] = await db.select().from(enrollmentTokens).where(eq(enrollmentTokens.id, id)).limit(1); if (!row) throw new AdminMcpError("NOT_FOUND"); return { ...tokenView(row), token: row.token };
  });
  write("tokens.create", "access:write", groupDefinition.extend({ capacity: z.number().int().min(1).max(1000) }), "Buat token dan kelompok khusus. String token tersedia melalui tokens.reveal dengan izin terpisah.", async (tx, input) => {
    await validCourses(tx, input.courseIds); const values = packageValues(input);
    if (values.endDate.getTime() <= Date.now()) throw new AdminMcpError("TOKEN_EXPIRY_IN_PAST");
    const groupId = crypto.randomUUID(), id = crypto.randomUUID(); const now = new Date();
    const token = `Zyx-${randomBytes(4).toString("hex").toUpperCase()}-${input.capacity}-${input.courseIds.length}`;
    await tx.insert(groups).values({ ...values, id: groupId, usedQuotaSessions: 0, status: "active", createdAt: now, updatedAt: now });
    const [row] = await tx.insert(enrollmentTokens).values({ id, token, groupId, capacity: input.capacity, expiresAt: values.endDate, createdAt: now }).returning();
    for (const courseId of input.courseIds) { await tx.insert(enrollmentTokenCourses).values({ tokenId: id, courseId }); await tx.insert(groupCourses).values({ id: crypto.randomUUID(), groupId, courseId, createdAt: now }); }
    return tokenView(row);
  });
  write("tokens.revoke", "access:write", z.object({ id: adminId, expectedRevision: adminRevision }), "Cabut token untuk pendaftaran baru. Akses anggota tetap mengikuti enrollment.", async (tx, input) => {
    const [old] = await tx.select().from(enrollmentTokens).where(eq(enrollmentTokens.id, input.id)).limit(1); if (!old) throw new AdminMcpError("NOT_FOUND");
    if (tokenView(old).revision !== input.expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    const [row] = await tx.update(enrollmentTokens).set({ expiresAt: minutesAgo(1) }).where(eq(enrollmentTokens.id, input.id)).returning(); return tokenView(row);
  });
}
