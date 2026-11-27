import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { academicSchedules } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";

type Executor = Pick<typeof db, "insert" | "update" | "delete">;
type Fields = Pick<typeof academicSchedules.$inferInsert, "title" | "type" | "courseId" | "description" | "startDate" | "endDate" | "location" | "status">;
export function academicEventView(row: typeof academicSchedules.$inferSelect) {
  const { type, title, courseId, description, location, startDate, endDate, updatedAt, status, id } = row;
  const fields = { type, title, courseId, description, location, startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? null };
  return { ...fields, revision: revisionOf({ id, ...fields, updatedAt, status }) };
}
function clean(fields: Partial<Fields>) {
  return {
    ...fields, title: fields.title?.trim(), courseId: fields.courseId === "" ? null : fields.courseId,
    location: fields.location === undefined ? undefined : fields.location?.trim() || null,
    description: fields.description === undefined ? undefined : fields.description?.trim() || null,
  };
}
export async function insertAcademicEvent(tx: Executor, actorId: string, fields: Fields) {
  const id = crypto.randomUUID();
  await tx.insert(academicSchedules).values({ ...clean(fields), id, title: fields.title.trim(),
    startDate: fields.startDate, createdById: actorId, status: fields.status || "published" });
  return id;
}
export async function updateAcademicEvent(tx: Executor, id: string, fields: Partial<Fields>) {
  await tx.update(academicSchedules).set({ ...clean(fields), updatedAt: new Date() }).where(eq(academicSchedules.id, id));
}
export async function deleteAcademicEvent(tx: Executor, id: string) {
  await tx.delete(academicSchedules).where(eq(academicSchedules.id, id));
}
