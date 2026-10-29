import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { ChapterOutline } from "@/components/course/chapter-outline";
import { CoursePrimaryActions } from "@/components/course/course-primary-actions";
import { CourseAttentionStrip } from "@/components/course/course-attention-strip";
import {
  CourseOverviewPrimaryActionsSkeleton,
  CourseChapterOutlineSkeleton,
} from "@/components/course/course-skeletons";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata } from "@/lib/site";
import { getCourse, getCourseChapterOutline, getStudentCourseAccess } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { getCourseOverviewData } from "@/lib/learning-analytics";
import { redirect } from "next/navigation";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");
  return createMetadata({
    title: course?.title ?? t("courseCatalog.genericCourse"),
    description: course?.description ?? t("metadata.courseDescription"),
    path: `/courses/${id}`,
  });
}

async function CourseOverviewHighlights({
  studentId,
  courseId,
  chapterOutline,
}: {
  studentId: string;
  courseId: string;
  chapterOutline: Awaited<ReturnType<typeof getCourseChapterOutline>>;
}) {
  const overviewData = await getCourseOverviewData(studentId, courseId, chapterOutline);
  if (!overviewData) return null;

  return (
    <>
      <CoursePrimaryActions
        reading={overviewData.reading}
        quiz={overviewData.quiz}
        schedule={overviewData.schedule}
        className="mb-6"
      />
      {overviewData.attention && (
        <CourseAttentionStrip
          attention={overviewData.attention}
          className="mb-6"
        />
      )}
    </>
  );
}

async function CourseChapterOutlineSection({
  courseId,
  studentId,
  isEnrolled,
  initialChapters,
}: {
  courseId: string;
  studentId: string;
  isEnrolled: boolean;
  initialChapters?: Awaited<ReturnType<typeof getCourseChapterOutline>>;
}) {
  const chapters = initialChapters ?? (await getCourseChapterOutline(courseId, studentId));
  return <ChapterOutline courseId={courseId} chapters={chapters} isEnrolled={isEnrolled} />;
}

export default async function CourseOverviewPage({ params }: Props) {
  const { id } = await params;

  // Run session check and course lookup concurrently while preserving strict auth priority.
  const sessionPromise = getAuthSession();
  const coursePromise = getCourse(id).then(
    (data) => ({ ok: true as const, data }),
    (err: unknown) => ({ ok: false as const, error: err }),
  );

  const session = await sessionPromise;
  const studentId = session?.user?.id;
  if (!studentId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}`)}`);
  }

  const courseResult = await coursePromise;
  if (!courseResult.ok) {
    throw courseResult.error;
  }
  const course = courseResult.data;
  if (!course) return null;

  // Independent reads run together to keep TTFB low.
  const [studentAccess, chapterOutline] = await Promise.all([
    getStudentCourseAccess(studentId, id),
    getCourseChapterOutline(id, studentId),
  ]);
  const isEnrolled = studentAccess?.tier === "standard";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Course",
        name: course.title,
        description: course.description ?? undefined,
        provider: {
          "@type": "Organization",
          name: "Zyx Academy",
          sameAs: "https://www.zyxacademy.com",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Beranda", item: "https://www.zyxacademy.com" },
          { "@type": "ListItem", position: 2, name: "Courses", item: "https://www.zyxacademy.com/courses" },
          { "@type": "ListItem", position: 3, name: course.title },
        ],
      },
    ],
  };

  // Strip the dash-separated suffix list from the description copy
  const shortDescription = course.description ? course.description.split(" - ")[0] : "";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CoursePageShell title={course.title} description={shortDescription} icon={BookOpen} maxWidth="7xl">
        <Reveal>
          {!isEnrolled && (
            <div className="mb-6 rounded-lg border border-brand-secondary/25 bg-brand-secondary/5 p-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-center">
                <div>
                  <h3 className="font-heading text-body-base font-bold text-brand-secondary"><TranslatedText namespace="learning" messageKey="quizPage.activationTitle" /></h3>
                  <p className="mt-1 max-w-2xl text-body-sm text-muted-foreground"><TranslatedText namespace="learning" messageKey="courseOverview.activationDescription" /></p>
                </div>
                <EnrollmentForm className="w-full" />
              </div>
            </div>
          )}
          {/* Primary learning actions and attention strip streamed via Suspense */}
          {isEnrolled && (
            <Suspense fallback={<CourseOverviewPrimaryActionsSkeleton />}>
              <CourseOverviewHighlights studentId={studentId} courseId={id} chapterOutline={chapterOutline} />
            </Suspense>
          )}
          <div className="mb-6">
            <Suspense fallback={<CourseChapterOutlineSkeleton />}>
              <CourseChapterOutlineSection
                courseId={id}
                studentId={studentId}
                isEnrolled={isEnrolled}
                initialChapters={chapterOutline}
              />
            </Suspense>
          </div>
          {isEnrolled && (
            <div className="mt-6 flex items-center justify-between border-t border-border/40 pt-4">
              <Link href={`/courses/${id}/progress`} className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-brand-primary hover:underline">
                <span><TranslatedText namespace="learning" messageKey="courseOverview.viewProgress" /></span>
                <ArrowRight className="size-4" />
              </Link>
            </div>
          )}
        </Reveal>
      </CoursePageShell>
    </>
  );
}
