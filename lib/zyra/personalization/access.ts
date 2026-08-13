import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { enrollments } from "@/db/schema";

export function isPersonalizationScopeOwned(
  actorId: string | null | undefined,
  ownerId: string | null | undefined,
): boolean {
  return Boolean(actorId && ownerId && actorId === ownerId);
}

export async function canAccessZyraPersonalizationCourse(input: {
  studentId: string;
  courseId: string;
  role?: string | null;
  actorId?: string | null;
}): Promise<boolean> {
  if (input.actorId !== undefined && !isPersonalizationScopeOwned(input.actorId, input.studentId)) {
    return false;
  }
  if (input.role === "admin") return true;
  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(
      eq(enrollments.userId, input.studentId),
      eq(enrollments.courseId, input.courseId),
      gt(enrollments.expiresAt, new Date()),
    ))
    .limit(1);
  return Boolean(enrollment);
}
