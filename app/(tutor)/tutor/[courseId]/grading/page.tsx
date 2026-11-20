import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { submissions, exams, user, courses, mataKuliah, questions } from "@/db/schema";
import { recordStaffCourseDisclosures } from "@/lib/gamification/question-exposure";
import { eq, and, desc, or, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireTutorCourseAccess } from "@/lib/auth/request-cache";
import { GradingClient } from "./grading-client";
import { Reveal } from "@/components/ui/reveal";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { pageTitle } from "@/lib/site";
import { resolveActorRoles, REVIEWABLE_SUBMISSION_STATUSES } from "@/lib/tutor/assessment-policy";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props) {
  const { courseId } = await params;
  const t = await getTranslations("tutor.routeTitles");
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
    title: pageTitle(title ? `${t("tryoutGrading")}: ${title}` : t("tryoutGrading")),
    description: title
      ? t("tryoutGradingDescriptionWithCourse", { course: title })
      : t("tryoutGradingDescription"),
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

  // Older tryout snapshots retain the tryout question ID, not its bank ID.
  // Resolve those IDs in one course-scoped query before releasing scores or keys.
  let unmappedCourse = false;
  const snapshotIds = new Set<string>();
  const bankIds = new Set<string>();
  for (const submission of submissionsList) {
    let snapshot: unknown = submission.questionsSnapshot;
    if (typeof snapshot === "string") {
      try { snapshot = JSON.parse(snapshot); } catch { snapshot = null; }
    }
    if (!Array.isArray(snapshot)) { unmappedCourse = true; continue; }
    for (const value of snapshot) {
      if (!value || typeof value !== "object" || typeof value.id !== "string") { unmappedCourse = true; continue; }
      snapshotIds.add(value.id);
      if (typeof value.bankQuestionId === "string") bankIds.add(value.bankQuestionId);
    }
  }
  const sourceQuestions = snapshotIds.size ? await db.select({ id: questions.id, content: questions.content }).from(questions)
    .innerJoin(exams, eq(questions.examId, exams.id))
    .where(and(inArray(questions.id, [...snapshotIds]), inArray(exams.courseId, courseIdsToQuery), eq(exams.type, "tryout"))) : [];
  if (sourceQuestions.length !== snapshotIds.size) unmappedCourse = true;
  for (const question of sourceQuestions) {
    let content: unknown = question.content;
    if (typeof content === "string") {
      try { content = JSON.parse(content); } catch { content = null; }
    }
    if (!content || typeof content !== "object" || Array.isArray(content)) { unmappedCourse = true; continue; }
    const bankId = (content as Record<string, unknown>).bankQuestionId;
    if (typeof bankId === "string" && bankId) bankIds.add(bankId);
  }
  await db.transaction(tx => recordStaffCourseDisclosures(tx, { userId: session.user.id, courseId, questionIds: [...bankIds], contextId: "tryout-grading", requestId: crypto.randomUUID(), unmappedCourse }));

  return (
    <ApplicationPage spacing="space-y-(--group-gap)">
      <Reveal>
        <GradingClient
          courseId={courseId}
          initialSubmissions={submissionsList}
          queueHeader={
            <PageHeader title={<><TranslatedText namespace="tutor" messageKey="routeTitles.tryoutGrading" />: {courseTitle}</>} backHref={`/tutor/${courseId}`} backLabel={<TranslatedText namespace="tutor" messageKey="routeTitles.overview" />} />
          }
        />
      </Reveal>
    </ApplicationPage>
  );
}
