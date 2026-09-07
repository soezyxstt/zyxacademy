import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { quizTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { QuizInsightDetailClient } from "@/app/(admin)/admin/(eval)/quiz-insights/quiz-insight-detail-client";
import { resolveCourseIdentity, matchesCourseIdentity } from "@/lib/admin/course-identity";

type Props = {
  params: Promise<{ slug: string; quizId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
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
      return { title: pageTitle("Analisis Kuis Tidak Ditemukan") };
    }

    return {
      title: pageTitle(`Analisis: ${template.title}`),
      description: `Analisis performa mendalam kuis ${template.title} untuk mata kuliah ${courseIdentity.title}.`,
    };
  } catch {
    return { title: pageTitle("Analisis Kuis") };
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
