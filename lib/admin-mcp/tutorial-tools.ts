import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { bookings, tutorCourses, tutorSlots } from "@/db/schema";
import { db } from "@/lib/db";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import { adminId, adminPagination, adminToolkit } from "./toolkit";
import { AdminMcpError, revisionOf } from "./mutations";

export function registerTutorialTools(server: McpServer, principal: McpPrincipal) {
  const { read } = adminToolkit(server, principal);
  read("tutorial.bookings.list", "schedules:read", z.object({ ...adminPagination, groupId: adminId }), "Daftar sesi tutorial kelompok tanpa catatan pribadi atau tautan pertemuan.", async ({ groupId, limit, offset }) =>
    db.select({ id: bookings.id, slotId: bookings.slotId, groupId: bookings.groupId, courseId: bookings.courseId, status: bookings.status, sessionDate: bookings.sessionDate, startTime: bookings.startTime, endTime: bookings.endTime, mode: bookings.mode }).from(bookings).where(eq(bookings.groupId, groupId)).orderBy(asc(bookings.id)).limit(limit).offset(offset));
  read("tutorial.bookings.get", "schedules:read", z.object({ id: adminId }), "Lihat metadata sesi tutorial dan revisinya tanpa catatan pribadi.", async ({ id }) => {
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!row) throw new AdminMcpError("NOT_FOUND");
    return { id: row.id, slotId: row.slotId, groupId: row.groupId, courseId: row.courseId, status: row.status, sessionDate: row.sessionDate, startTime: row.startTime, endTime: row.endTime, mode: row.mode, revision: revisionOf(row) };
  });
  read("tutorial.slots.list", "schedules:read", z.object({ ...adminPagination, tutorId: adminId }), "Daftar slot tutor.", async ({ tutorId, limit, offset }) =>
    db.select().from(tutorSlots).where(eq(tutorSlots.tutorId, tutorId)).orderBy(asc(tutorSlots.id)).limit(limit).offset(offset));
  read("tutorial.assignments.list", "schedules:read", z.object({ ...adminPagination, tutorId: adminId, courseId: adminId.optional() }), "Daftar penugasan mata kuliah tutor.", async ({ tutorId, courseId, limit, offset }) =>
    db.select().from(tutorCourses).where(and(eq(tutorCourses.tutorId, tutorId), courseId ? eq(tutorCourses.courseId, courseId) : undefined)).orderBy(asc(tutorCourses.id)).limit(limit).offset(offset));
}
