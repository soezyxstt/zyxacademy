import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { academicSchedules, courses } from "@/db/schema";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import { adminToolkit, adminId, adminRevision } from "./toolkit";
import { AdminMcpError, revisionOf } from "./mutations";
const fields = z.object({ type: z.enum(["official_exam", "tryout", "quiz", "general"]), title: z.string().trim().min(1).max(500), courseId: adminId.nullable().default(null), description: z.string().max(20000).nullable().default(null), startDate: z.iso.datetime({ offset: true }), endDate: z.iso.datetime({ offset: true }).nullable().default(null), location: z.string().max(1000).nullable().default(null), status: z.enum(["published", "draft", "archived"]).default("draft") }).strict();
const view = <T extends Record<string, unknown>>(row: T) => ({ ...row, revision: revisionOf(row) });
export function registerSchedulingTools(server: McpServer, principal: McpPrincipal) {
  const { read, write } = adminToolkit(server, principal);
  read("schedules.get", "schedules:read", z.object({ id: adminId }), "Lihat jadwal akademik dan revisinya.", async ({ id }) => {
    const [row] = await db.select().from(academicSchedules).where(eq(academicSchedules.id, id)).limit(1); if (!row) throw new AdminMcpError("NOT_FOUND"); return view(row);
  });
  write("schedules.create", "schedules:write", fields, "Buat jadwal akademik dengan waktu absolut dan zona waktu eksplisit.", async (tx, input) => {
    if (input.endDate && Date.parse(input.endDate) <= Date.parse(input.startDate)) throw new AdminMcpError("INVALID_DATE_RANGE");
    if (input.courseId && !(await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, input.courseId)).limit(1)).length) throw new AdminMcpError("COURSE_NOT_FOUND");
    const now = new Date(); const [row] = await tx.insert(academicSchedules).values({ ...input, startDate: new Date(input.startDate), endDate: input.endDate ? new Date(input.endDate) : null, id: crypto.randomUUID(), createdById: principal.userId, createdAt: now, updatedAt: now }).returning(); return view(row);
  });
  write("schedules.update", "schedules:write", fields.extend({ id: adminId, expectedRevision: adminRevision }), "Ubah jadwal akademik setelah memeriksa revisi.", async (tx, { id, expectedRevision, ...input }) => {
    const [old] = await tx.select().from(academicSchedules).where(eq(academicSchedules.id, id)).limit(1); if (!old) throw new AdminMcpError("NOT_FOUND"); if (revisionOf(old) !== expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    if (input.endDate && Date.parse(input.endDate) <= Date.parse(input.startDate)) throw new AdminMcpError("INVALID_DATE_RANGE");
    if (input.courseId && !(await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, input.courseId)).limit(1)).length) throw new AdminMcpError("COURSE_NOT_FOUND");
    const [row] = await tx.update(academicSchedules).set({ ...input, startDate: new Date(input.startDate), endDate: input.endDate ? new Date(input.endDate) : null, updatedAt: new Date() }).where(eq(academicSchedules.id, id)).returning(); return view(row);
  });
  write("schedules.delete", "schedules:write", z.object({ id: adminId, expectedRevision: adminRevision }), "Hapus jadwal akademik dari kalender.", async (tx, input) => {
    const [old] = await tx.select().from(academicSchedules).where(eq(academicSchedules.id, input.id)).limit(1); if (!old) throw new AdminMcpError("NOT_FOUND"); if (revisionOf(old) !== input.expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    await tx.delete(academicSchedules).where(eq(academicSchedules.id, input.id)); return { id: input.id, deleted: true };
  });
}
