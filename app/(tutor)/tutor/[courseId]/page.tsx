import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import {
  readCourseSnapshot,
  getCohortAnalytics,
  type SnapshotPayload,
} from "@/lib/cohort-analytics";
import { AnalyticsClient } from "@/components/tutor/analytics-client";
import { Reveal } from "@/components/ui/reveal";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Button } from "@/components/ui/button";
import { pageTitle } from "@/lib/site";
import { ZyraProposalPanel } from "@/components/zyra/zyra-proposal-panel";
import { CheckSquare, ClipboardList, Radio, Users } from "lucide-react";

import { db } from "@/db";
import { mataKuliah } from "@/db/schema";
import { eq } from "drizzle-orm";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  const mkRows = await db
    .select({ title: mataKuliah.title, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(eq(mataKuliah.id, courseId))
    .limit(1);

  const legacyCourseId = mkRows[0]?.legacyCourseId ?? courseId;
  const snapshot = await readCourseSnapshot(legacyCourseId);
  const title = mkRows[0]?.title ?? snapshot?.payload.courseTitle;
  return {
    title: pageTitle(title ? `Analitik: ${title}` : "Analitik"),
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

  let access;
  try {
    access = await requireTutorCourseAccess(session.user.id, courseId, { allowAdmin: false });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TUTOR_ACCESS_DENIED")) {
      redirect("/tutor");
    }
    throw error;
  }

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

  if (!analytics.courseTitle) notFound();

  const updatedAt = snapshotRow?.updatedAt.toISOString() ?? null;

  return (
    <ApplicationPage spacing="space-y-10">
      {/* Section 1: headline stats */}
      <Reveal>
        <section aria-labelledby="course-title">
          <PageHeader
            title={analytics.courseTitle}
            backHref="/tutor"
            backLabel="Pengajaran"
            divider={false}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild className="h-8 rounded-lg">
              <Link href={`/tutor/${courseId}/quizzes`}>
                <ClipboardList className="size-4 mr-1.5" />
                Kelola Kuis
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="h-8 rounded-lg">
              <Link href={`/tutor/${courseId}/live`}>
                <Radio className="size-4 mr-1.5" />
                Kuis Langsung
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="h-8 rounded-lg">
              <Link href={`/tutor/${courseId}/grading`}>
                <CheckSquare className="size-4 mr-1.5" />
                Penilaian
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="h-8 rounded-lg">
              <Link href={`/tutor/${courseId}/participants`}>
                <Users className="size-4 mr-1.5" />
                Peserta & Kelompok
              </Link>
            </Button>
          </div>
          <div className="flex gap-8 mt-4">
            <div>
              <p className="font-heading text-h3 font-bold tabular-nums">
                {analytics.enrolledCount}
              </p>
              <p className="text-body-sm text-muted-foreground">terdaftar</p>
            </div>
            <div>
              <p className="font-heading text-h3 font-bold tabular-nums">
                {analytics.activeCount}
              </p>
              <p className="text-body-sm text-muted-foreground">aktif minggu ini</p>
            </div>
            {analytics.engagement.quizParticipationPct > 0 && (
              <div>
                <p className="font-heading text-h3 font-bold tabular-nums">
                  {analytics.engagement.quizParticipationPct}%
                </p>
                <p className="text-body-sm text-muted-foreground">partisipasi kuis</p>
              </div>
            )}
          </div>
        </section>
      </Reveal>

      {/* Interactive sections (sparklines, drill-down, watchlist, refresh) */}
      <AnalyticsClient
        courseId={legacyCourseId}
        analytics={analytics}
        updatedAt={updatedAt}
      />
      <ZyraProposalPanel courseId={legacyCourseId} role="tutor" />
    </ApplicationPage>
  );
}
