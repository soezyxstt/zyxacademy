import { asc, eq } from "drizzle-orm";
import { courses, enrollments, user } from "@/db/schema";
import type { db } from "@/db";
import type { BroadcastDraft } from "../../packages/academic/admin-broadcast";

type Reader = Pick<typeof db, "select">;

export function adminBroadcastCourses(reader: Reader) {
  return reader.select({ id: courses.id, title: courses.title }).from(courses);
}

export function adminBroadcastCourseEnrollments(reader: Reader, courseId: string) {
  return reader.select({ id: enrollments.userId }).from(enrollments).where(eq(enrollments.courseId, courseId));
}

export async function adminBroadcastRecipientIds(reader: Reader, target: BroadcastDraft["target"], targetId: string) {
  if (target === "course") {
    const rows = await adminBroadcastCourseEnrollments(reader, targetId).orderBy(asc(enrollments.userId));
    return [...new Set(rows.map(({ id }) => id))];
  }
  const rows = await reader.select({ id: user.id }).from(user)
    .where(target === "user" ? eq(user.id, targetId) : undefined).orderBy(asc(user.id));
  return rows.map(({ id }) => id);
}

export async function adminBroadcastAudienceLabel(reader: Reader, draft: BroadcastDraft) {
  if (draft.target === "all") return "Semua pengguna";
  if (draft.target === "course") {
    const [course] = await reader.select({ title: courses.title }).from(courses).where(eq(courses.id, draft.targetId)).limit(1);
    return course?.title ?? null;
  }
  const [recipient] = await reader.select({ name: user.name }).from(user).where(eq(user.id, draft.targetId)).limit(1);
  return recipient ? `${recipient.name} (${draft.targetId})` : null;
}
