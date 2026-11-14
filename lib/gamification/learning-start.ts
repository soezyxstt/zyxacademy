import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gamificationChecklists, gamificationCourseStarts } from "@/db/schema";
import { ensureGamificationCourseStart } from "./checklists";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Skip ineligible courses without masking transaction or receipt failures. */
export async function startLearningRewards(tx: Transaction, userId: string, courseId: string, occurredAt?: Date) {
  const [started] = await tx.select({ userId: gamificationCourseStarts.userId }).from(gamificationCourseStarts)
    .where(and(eq(gamificationCourseStarts.userId, userId), eq(gamificationCourseStarts.courseId, courseId))).limit(1);
  if (!started) {
    const [approved] = await tx.select({ id: gamificationChecklists.id }).from(gamificationChecklists)
      .where(and(eq(gamificationChecklists.courseId, courseId), eq(gamificationChecklists.status, "approved"))).limit(1);
    if (!approved) return null;
  }
  return ensureGamificationCourseStart(tx, userId, courseId, occurredAt);
}
