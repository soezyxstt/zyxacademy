import type { Metadata } from "next";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { TryoutsClient } from "@/app/(tutor)/tutor/[courseId]/tryouts/tryouts-client";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { db } from "@/db";
import { recordAuthorizedGlobalDisclosures, authorizedSnapshotDisclosures } from "@/lib/gamification/question-exposure";
import { aiQuestionBank, exams, questions } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import { getCourse } from "@/lib/course-utils";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { getCourseDetailData } from "../../actions";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  return { title: pageTitle(t("metadata.pages.tryoutsTitle")) };
}

export default async function AdminCourseTryoutsPage({ params }: Props) {
  let actor: Awaited<ReturnType<typeof assertAdmin>>;
  try {
    actor = await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug } = await params;
  const [data, resolvedCourse] = await Promise.all([
    getCourseDetailData(slug),
    getCourse(slug),
  ]);
  if (!data || !resolvedCourse) notFound();

  const courseId = resolvedCourse.legacyId ?? resolvedCourse.id;
  const courseIds = [
    ...new Set(
      [resolvedCourse.canonicalId, resolvedCourse.legacyId, courseId].filter(
        (id): id is string => typeof id === "string",
      ),
    ),
  ];
  const [initialTryouts, bankRows] = await Promise.all([
    db
      .select()
      .from(exams)
      .where(and(eq(exams.courseId, courseId), eq(exams.type, "tryout")))
      .orderBy(desc(exams.createdAt)),
    db
      .select({
        id: aiQuestionBank.id,
        prompt: aiQuestionBank.prompt,
        questionType: aiQuestionBank.questionType,
        difficulty: aiQuestionBank.difficulty,
        origin: aiQuestionBank.origin,
        sourceEventName: aiQuestionBank.sourceEventName,
      })
      .from(aiQuestionBank)
      .where(
        and(
          inArray(aiQuestionBank.courseId, courseIds),
          eq(aiQuestionBank.reviewStatus, "published"),
          or(
            eq(aiQuestionBank.origin, "zyx_original"),
            eq(aiQuestionBank.origin, "itb_example"),
          ),
        ),
      )
      .orderBy(desc(aiQuestionBank.createdAt)),
  ]);
  const initialQuestions = initialTryouts.length
    ? await db
        .select()
        .from(questions)
        .where(inArray(questions.examId, initialTryouts.map((exam) => exam.id)))
        .orderBy(asc(questions.order))
    : [];
  const questionBank = bankRows.flatMap((question) =>
    question.origin === "zyx_original" || question.origin === "itb_example"
      ? [{ ...question, origin: question.origin }]
      : [],
  );
  const bankIds: { questionId: string; courseId: string }[] = [];
  let unmapped = false;
  for (const question of initialQuestions) {
    let content: unknown = question.content;
    if (typeof content === "string") {
      try { content = JSON.parse(content); } catch { content = null; }
    }
    if (!content || typeof content !== "object" || Array.isArray(content)) { unmapped = true; continue; }
    const bankId = (content as Record<string, unknown>).bankQuestionId;
    if (typeof bankId === "string" && bankId) bankIds.push({ questionId: bankId, courseId });
  }
  if (unmapped) bankIds.push(...authorizedSnapshotDisclosures(courseId, [null]));
  await db.transaction(tx => recordAuthorizedGlobalDisclosures(tx, { userId: actor.user.id, questions: bankIds, requestId: crypto.randomUUID() }));

  return (
    <div className="space-y-4 font-sans">
      <CourseDetailHeader course={data.course} />
      <TryoutsClient
        courseId={courseId}
        initialTryouts={initialTryouts}
        initialQuestions={initialQuestions}
        questionBank={questionBank}
      />
    </div>
  );
}
