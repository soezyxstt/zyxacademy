import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { submissions, exams, user, courses, mataKuliah } from "@/db/schema";
import { eq, and, desc, or, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import { GradingClient } from "./grading-client";
import { Reveal } from "@/components/ui/reveal";
import { ApplicationPage } from "@/components/application-page";
import { pageTitle } from "@/lib/site";
import { resolveActorRoles, REVIEWABLE_SUBMISSION_STATUSES } from "@/lib/tutor/assessment-policy";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props) {
  const { courseId } = await params;
  const [mk] = await db
    .select({ title: mataKuliah.title })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);
  const [c] = !mk
    ? await db.select({ title: courses.title }).from(courses).where(eq(courses.id, courseId)).limit(1)
    : [null];
  const title = mk?.title ?? c?.title;
  return {
    title: pageTitle(title ? `Penilaian Tryout: ${title}` : "Penilaian Tryout"),
    description: title
      ? `Nilai dan review jawaban tryout siswa untuk ${title}.`
      : "Nilai dan review jawaban tryout siswa.",
  };
}

export default async function TutorGradingPage({ params }: Props) {
  const { courseId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/");
  }

  const { isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  let access;
  try {
    access = await requireTutorCourseAccess(session.user.id, courseId, { allowAdmin: isAdmin });
  } catch {
    notFound();
  }

  const courseIdsToQuery = [courseId];
  if (access.courseId && !courseIdsToQuery.includes(access.courseId)) {
    courseIdsToQuery.push(access.courseId);
  }
  if (access.legacyCourseId && !courseIdsToQuery.includes(access.legacyCourseId)) {
    courseIdsToQuery.push(access.legacyCourseId);
  }

  const [mk] = await db
    .select({ title: mataKuliah.title })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);

  const [legacyCourse] = !mk
    ? await db
        .select({ title: courses.title })
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1)
    : [null];

  const courseTitle = mk?.title ?? legacyCourse?.title ?? courseId;

  // Load student submissions for tryout exams in this course only
  const submissionsList = await db
    .select({
      id: submissions.id,
      studentName: user.name,
      studentEmail: user.email,
      examTitle: exams.title,
      status: submissions.status,
      score: submissions.score,
      teacherNotes: submissions.teacherNotes,
      answersSnapshot: submissions.answersSnapshot,
      questionsSnapshot: submissions.questionsSnapshot,
      submittedAt: submissions.submittedAt,
    })
    .from(submissions)
    .innerJoin(exams, eq(submissions.examId, exams.id))
    .innerJoin(user, eq(submissions.userId, user.id))
    .where(
      and(
        inArray(exams.courseId, courseIdsToQuery),
        eq(exams.type, "tryout"),
        // Legacy rows exist only after submit; queue the persisted statuses a
        // tutor can grade or re-grade, newest submission first.
        inArray(submissions.status, [...REVIEWABLE_SUBMISSION_STATUSES]),
      ),
    )
    .orderBy(desc(submissions.submittedAt));

  return (
    <ApplicationPage spacing="space-y-8">
      <Reveal>
        <div className="flex flex-col gap-1">
          <h1 className="text-h5 font-heading font-bold text-foreground">
            Penilaian Tryout & Ujian
          </h1>
          <p className="text-body-sm text-muted-foreground">
            {courseTitle} · Periksa jawaban essay siswa, masukkan skor akhir, dan berikan masukan belajar.
          </p>
        </div>
      </Reveal>

      <Reveal>
        <GradingClient courseId={courseId} initialSubmissions={submissionsList} />
      </Reveal>
    </ApplicationPage>
  );
}
