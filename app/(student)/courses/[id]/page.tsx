import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { ChapterOutline } from "@/components/course/chapter-outline";
import { CoursePrimaryActions } from "@/components/course/course-primary-actions";
import { CourseAttentionStrip } from "@/components/course/course-attention-strip";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { getCourse, getCourseChapterOutline, getStudentCourseAccess } from "@/lib/course-utils";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getCourseOverviewData } from "@/lib/learning-analytics";
import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  return {
    title: pageTitle(course ? course.title : "Kelas"),
    description: course?.description ?? "Ringkasan kelas",
  };
}

export default async function CourseOverviewPage({ params }: Props) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) return null;

  const session = await auth.api.getSession({ headers: await headers() });
  const studentId = session?.user?.id;
  if (!studentId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}`)}`);
  }

  // Independent reads run together to keep TTFB low.
  const [studentAccess, chapterOutline] = await Promise.all([
    studentId ? getStudentCourseAccess(studentId, id) : Promise.resolve(null),
    getCourseChapterOutline(id, studentId),
  ]);
  const isEnrolled = studentAccess?.tier === "standard";
  const hasCourseAccess = Boolean(studentAccess);

  const overviewData =
    studentId && isEnrolled
      ? await getCourseOverviewData(studentId, id, chapterOutline)
      : null;

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
          {/* Enrollment banner (unenrolled only) */}
          {!isEnrolled && (
            <div className="mb-6 rounded-lg border border-brand-secondary/25 bg-brand-secondary/5 p-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-center">
                <div>
                  <h3 className="font-heading text-body-base font-bold text-brand-secondary">
                    Aktivasi token kelas
                  </h3>
                  <p className="mt-1 max-w-2xl text-body-sm text-muted-foreground">
                    Dokumen dan berkas PDF materi terbuka gratis. Masukkan token kelas untuk membuka kuis interaktif, tryout, artikel lengkap, flashcard, dan diktat.
                  </p>
                </div>
                <EnrollmentForm className="w-full" />
              </div>
            </div>
          )}

          {/* Primary learning actions: Dokumen, Kuis, Jadwal */}
          {isEnrolled && overviewData && (
            <CoursePrimaryActions
              reading={overviewData.reading}
              quiz={overviewData.quiz}
              schedule={overviewData.schedule}
              className="mb-6"
            />
          )}

          {/* Attention strip: flashcards due or weak concepts needing practice */}
          {isEnrolled && overviewData?.attention && (
            <CourseAttentionStrip
              attention={overviewData.attention}
              className="mb-6"
            />
          )}

          {/* Syllabus: the chapters and their materials, with progress */}
          <div className="mb-6">
            <ChapterOutline courseId={id} chapters={chapterOutline} isEnrolled={isEnrolled} />
          </div>

          {/* Link to detailed learning progress */}
          {isEnrolled && (
            <div className="mt-6 flex items-center justify-between border-t border-border/40 pt-4">
              <Link
                href={`/courses/${id}/progress`}
                className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-brand-primary hover:underline"
              >
                <span>Lihat progres belajar</span>
                <ArrowRight className="size-4" />
              </Link>
            </div>
          )}
        </Reveal>
      </CoursePageShell>
    </>
  );
}
