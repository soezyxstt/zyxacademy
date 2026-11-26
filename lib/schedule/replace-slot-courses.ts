import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tutorSlotCourses } from "@/db/schedule-extras";
import { normalizeSlotCourseIds } from "./slot-courses";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function writeTutorSlotCourses(tx: Tx, slotId: string, courseIds: readonly string[]) {
  const normalized = normalizeSlotCourseIds(courseIds).slice(0, 50);
  await tx.delete(tutorSlotCourses).where(eq(tutorSlotCourses.slotId, slotId));
  if (normalized.length) await tx.insert(tutorSlotCourses).values(normalized.map(courseId => ({ slotId, courseId })));
}
