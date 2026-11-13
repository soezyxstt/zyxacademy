import { StudentCourseLeaderboardContent } from "@/components/course/student-course-leaderboard-content";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Trophy } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { CourseLeaderboardContentSkeleton } from "@/components/course/course-skeletons";
import { studentCardClass } from "@/components/course/course-surfaces";
import { createMetadata } from "@/lib/site";
import { getCourse, getCourseLeaderboard } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { checkFullCourseContentAccess } from "@/app/(student)/dashboard/actions";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { tabListClassName, tabTriggerClassName, tabTriggerActiveClassName } from "@/components/ui/tab-styles";
import { cn } from "@/lib/utils";
import { TranslatedText } from "@/components/i18n/translated-text";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { getTranslations } from "@/lib/i18n/server";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");
  return createMetadata({
    title: course ? t("metadata.leaderboardTitle", { course: course.title }) : t("metadata.leaderboardTitleFallback"),
    description: t("metadata.leaderboardDescription"),
    path: `/courses/${id}/leaderboard`,
  });
}

async function CourseLeaderboardContent({
  id,
  activeType,
  userId,
}: {
  id: string;
  activeType: "quiz" | "simulation";
  userId?: string;
}) {
  const hasFullContentAccess = await checkFullCourseContentAccess(id);

  if (!hasFullContentAccess) {
    return (
      <div className={studentCardClass()}>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
            <Lock className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="courseAccess.needToken" /></h3>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Aktifkan kelas untuk melihat peringkat dan skor gabungan.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <EnrollmentForm />
        </div>
      </div>
    );
  }

  let rankedRows: Awaited<ReturnType<typeof getCourseLeaderboard>> = [];
  try {
    rankedRows = await getCourseLeaderboard(id, activeType);
  } catch (err) {
    console.error("Error fetching course leaderboard:", err);
    rankedRows = [];
  }
  return <StudentCourseLeaderboardContent rankedRows={rankedRows} userId={userId} activeType={activeType} isPka={id === PKA_COURSE_ID} />;
}

export default async function CourseLeaderboardPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { type } = await searchParams;
  const activeType = type === "simulation" ? "simulation" : "quiz";

  const [course, session] = await Promise.all([
    getCourse(id),
    getAuthSession(),
  ]);
  if (!course) return null;

  const userId = session?.user?.id;
  const simulationLabelKey = id === PKA_COURSE_ID ? "simulation" : "tryout";

  return (
    <CoursePageShell
      title={<TranslatedText namespace="learning" messageKey="leaderboard.title" values={{ course: course.title }} />}
      icon={Trophy}
    >
      <Reveal>
        <nav aria-labelledby="leaderboard-type-label" className="mb-4">
          <span id="leaderboard-type-label" className="sr-only"><TranslatedText namespace="learning" messageKey="leaderboard.typeLabel" /></span>
          <div className={tabListClassName}>
            <Link href={`/courses/${id}/leaderboard?type=quiz`} aria-current={activeType === "quiz" ? "page" : undefined} className={cn(tabTriggerClassName, activeType === "quiz" && tabTriggerActiveClassName)}><TranslatedText namespace="learning" messageKey="leaderboard.quiz" /></Link>
            <Link href={`/courses/${id}/leaderboard?type=simulation`} aria-current={activeType === "simulation" ? "page" : undefined} className={cn(tabTriggerClassName, activeType === "simulation" && tabTriggerActiveClassName)}><TranslatedText namespace="learning" messageKey={`leaderboard.${simulationLabelKey}`} /></Link>
          </div>
        </nav>

        <Suspense fallback={<CourseLeaderboardContentSkeleton />}>
          <CourseLeaderboardContent id={id} activeType={activeType} userId={userId} />
        </Suspense>
      </Reveal>
    </CoursePageShell>
  );
}
