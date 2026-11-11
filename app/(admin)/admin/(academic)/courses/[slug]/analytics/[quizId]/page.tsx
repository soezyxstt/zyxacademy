import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { db } from "@/db";
import { quizTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { QuizInsightDetailClient } from "@/app/(admin)/admin/(eval)/quiz-insights/quiz-insight-detail-client";
import { resolveCourseIdentity, matchesCourseIdentity } from "@/lib/admin/course-identity";

type Props = {
  params: Promise<{ slug: string; quizId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  const { slug, quizId } = await params;
  try {
    const [courseIdentity, template] = await Promise.all([
      resolveCourseIdentity(slug),
      db
        .select({ id: quizTemplates.id, title: quizTemplates.title, courseId: quizTemplates.courseId })
        .from(quizTemplates)
        .where(eq(quizTemplates.id, quizId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);

    if (!courseIdentity || !template || !matchesCourseIdentity(template.courseId, courseIdentity)) {
      return { title: pageTitle(t("metadata.pages.quizAnalyticsNotFound")) };
    }

    return {
      title: pageTitle(t("metadata.pages.quizAnalyticsTitle", { quiz: template.title })),
      description: t("metadata.pages.quizAnalyticsDescription", { quiz: template.title, course: courseIdentity.title }),
    };
  } catch {
    return { title: pageTitle(t("metadata.pages.quizAnalyticsFallbackTitle")) };
  }
}

export default async function AdminCourseQuizAnalyticsDetailPage({ params }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug, quizId } = await params;
  const courseIdentity = await resolveCourseIdentity(slug);
  if (!courseIdentity) {
    notFound();
  }

  // Fetch quiz template to validate ownership
  const [template] = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      courseId: quizTemplates.courseId,
    })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, quizId))
    .limit(1);

  if (!template) {
    notFound();
  }

  // Validate ownership against both canonical and legacy course identities
  if (!matchesCourseIdentity(template.courseId, courseIdentity)) {
    notFound();
  }

  return (
    <div className="space-y-6 font-sans">
      <QuizInsightDetailClient
        quizId={quizId}
        lockedCourse={{
          id: courseIdentity.primaryId,
          slug,
          title: courseIdentity.title,
        }}
        backHref={`/admin/courses/${encodeURIComponent(slug)}/analytics`}
        backLabel={`Kembali ke Analitik ${courseIdentity.title}`}
      />
    </div>
  );
}
