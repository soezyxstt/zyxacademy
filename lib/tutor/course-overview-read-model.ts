import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mataKuliah } from "@/db/schema";
import { requireTutorCourseAccess } from "@/lib/auth/request-cache";
import { readCourseSnapshot, getCohortAnalytics, type SnapshotPayload } from "@/lib/cohort-analytics";

function emptySnapshot(base: Awaited<ReturnType<typeof getCohortAnalytics>>): SnapshotPayload {
  return {
    ...base,
    conceptTrends: {},
    mostMissed: {},
    topMisconceptions: [],
    watchlist: [],
    engagement: { quizParticipationPct: 0, flashcardAdherencePct: 0 },
  };
}

export async function getTutorCourseOverview(userId: string, courseId: string) {
  const access = await requireTutorCourseAccess(userId, courseId, { allowAdmin: false });
  const legacyCourseId = access.legacyCourseId ?? courseId;
  const snapshotRow = await readCourseSnapshot(legacyCourseId);
  const analytics: SnapshotPayload = snapshotRow
    ? snapshotRow.payload
    : emptySnapshot(await getCohortAnalytics(legacyCourseId));

  if (!analytics.courseTitle) {
    const mkRows = await db
      .select({ title: mataKuliah.title })
      .from(mataKuliah)
      .where(eq(mataKuliah.id, access.courseId ?? courseId))
      .limit(1);
    if (mkRows[0]?.title) {
      analytics.courseTitle = mkRows[0].title;
    }
  }

  if (!analytics.courseTitle) return null;

  const updatedAt = snapshotRow?.updatedAt.toISOString() ?? null;

  return { analytics, updatedAt, legacyCourseId };
}
