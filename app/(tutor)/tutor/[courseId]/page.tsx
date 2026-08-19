import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { tutorCourses } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  readCourseSnapshot,
  getCohortAnalytics,
  type SnapshotPayload,
} from "@/lib/cohort-analytics";
import { AnalyticsClient } from "@/components/tutor/analytics-client";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { ZyraProposalPanel } from "@/components/zyra/zyra-proposal-panel";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  const snapshot = await readCourseSnapshot(courseId);
  const title = snapshot?.payload.courseTitle;
  return {
    title: pageTitle(title ? `Analytics: ${title}` : "Analytics"),
    description: title
      ? `Analitik cohort dan performa siswa untuk ${title}.`
      : "Analitik cohort dan performa siswa.",
  };
}

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

export default async function TutorCoursePage({ params }: Props) {
  const { courseId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/tutor");

  const role = (session.user as { role?: string | null }).role;

  if (role === "teacher") {
    const [assigned] = await db
      .select({ id: tutorCourses.id })
      .from(tutorCourses)
      .where(
        and(eq(tutorCourses.tutorId, session.user.id), eq(tutorCourses.courseId, courseId))
      )
      .limit(1);
    if (!assigned) redirect("/tutor");
  }

  const snapshotRow = await readCourseSnapshot(courseId);
  const analytics: SnapshotPayload = snapshotRow
    ? snapshotRow.payload
    : emptySnapshot(await getCohortAnalytics(courseId));

  if (!analytics.courseTitle) notFound();

  const updatedAt = snapshotRow?.updatedAt.toISOString() ?? null;

  return (
    <div className="px-6 py-8 max-w-3xl space-y-10">
      {/* Section 1: headline stats */}
      <Reveal>
        <section aria-labelledby="course-title">
          <h1 id="course-title" className="text-h5 font-heading font-bold mb-4">
            {analytics.courseTitle}
          </h1>
          <div className="flex gap-8">
            <div>
              <p className="font-heading text-h3 font-bold tabular-nums">
                {analytics.enrolledCount}
              </p>
              <p className="text-body-sm text-muted-foreground">enrolled</p>
            </div>
            <div>
              <p className="font-heading text-h3 font-bold tabular-nums">
                {analytics.activeCount}
              </p>
              <p className="text-body-sm text-muted-foreground">active this week</p>
            </div>
            {analytics.engagement.quizParticipationPct > 0 && (
              <div>
                <p className="font-heading text-h3 font-bold tabular-nums">
                  {analytics.engagement.quizParticipationPct}%
                </p>
                <p className="text-body-sm text-muted-foreground">quiz participation</p>
              </div>
            )}
          </div>
        </section>
      </Reveal>

      {/* Interactive sections (sparklines, drill-down, watchlist, refresh) */}
      <AnalyticsClient
        courseId={courseId}
        analytics={analytics}
        updatedAt={updatedAt}
      />
      <ZyraProposalPanel courseId={courseId} role="tutor" />
    </div>
  );
}
