import { inngest } from "./client";
import { db } from "@/db";
import { enrollments } from "@/db/schema";
import { gt, sql } from "drizzle-orm";

/**
 * Continuous Improvement: daily content-quality audit cron.
 * Runs once per day at 03:00 UTC.
 */
export const contentQualityAuditCron = inngest.createFunction(
  {
    id: "content-quality-audit-cron",
    name: "Content Quality Audit Cron",
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    const now = new Date();

    const activeCourseIds = await step.run("fetch-active-courses", async () => {
      const rows = await db
        .select({ courseId: enrollments.courseId })
        .from(enrollments)
        .where(gt(enrollments.expiresAt, now))
        .groupBy(enrollments.courseId)
        .having(sql`COUNT(*) > 0`);
      return rows.map((r) => r.courseId);
    });

    const { flagged, failed } = await step.run("audit-active-courses", async () => {
      const { auditCourseContentQuality } = await import("@/lib/content-quality-auditor");
      let totalFlagged = 0;
      let totalFailed = 0;
      for (const courseId of activeCourseIds) {
        try {
          const flags = await auditCourseContentQuality(courseId);
          totalFlagged += flags.length;
        } catch {
          totalFailed++;
        }
      }
      return { flagged: totalFlagged, failed: totalFailed };
    });

    return { activeCourseIds: activeCourseIds.length, flagged, failed };
  }
);
