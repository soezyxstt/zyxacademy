import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { enrollments } from "@/db/schema";
import { db } from "@/lib/db";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import { adminId, adminPagination, adminToolkit } from "./toolkit";
import { AdminMcpError, revisionOf } from "./mutations";

export function registerEnrollmentTools(server: McpServer, principal: McpPrincipal) {
  const { read } = adminToolkit(server, principal);
  read("enrollments.list", "access:read", z.object({ ...adminPagination, userId: adminId, courseId: adminId.optional() }), "Daftar akses mata kuliah pengguna.", async ({ userId, courseId, limit, offset }) =>
    (await db.select().from(enrollments).where(and(eq(enrollments.userId, userId), courseId ? eq(enrollments.courseId, courseId) : undefined)).orderBy(asc(enrollments.id)).limit(limit).offset(offset)).map(row => ({ ...row, revision: revisionOf(row) })));
  read("enrollments.get", "access:read", z.object({ id: adminId }), "Lihat akses mata kuliah dan revisinya.", async ({ id }) => {
    const [row] = await db.select().from(enrollments).where(eq(enrollments.id, id)).limit(1);
    if (!row) throw new AdminMcpError("NOT_FOUND");
    return { ...row, revision: revisionOf(row) };
  });
}
