import { CoursePricingLabel } from "@/components/course/course-pricing-label";
import type { CoursePricing } from "@/lib/student/course-pricing";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Award,
  BookOpen,
  ClipboardList,
  Compass,
  Layers,
  Target,
  Terminal,
  TrendingUp,
  Trophy,
  Video,
} from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";

export function StudentCourseOverviewView({ href = (path: string) => path, course, hasFullContentAccess, highlights, chapterOutline }: { href?: (path: string) => string;
  course: { id: string; title: string; description: string | null; pricing?: CoursePricing };
  hasFullContentAccess: boolean;
  highlights: ReactNode;
  chapterOutline: ReactNode;
}) {
  const mobileQuickLinks = [
    {
      id: "video",
      href: href(`/courses/${course.id}/video`),
      icon: Video,
      label: <TranslatedText namespace="student.navigation" messageKey="video" />,
    },
    {
      id: "flashcard",
      href: href(`/courses/${course.id}/flashcard`),
      icon: Layers,
      label: <TranslatedText namespace="student.navigation" messageKey="flashcard" />,
    },
    {
      id: "tryout",
      href: href(`/courses/${course.id}/tryout`),
      icon: ClipboardList,
      label: <TranslatedText namespace="student.navigation" messageKey="tryout" />,
    },
    {
      id: "path",
      href: href(`/courses/${course.id}/path`),
      icon: Compass,
      label: <TranslatedText namespace="student.mobile" messageKey="studyPathShort" />,
    },
    {
      id: "mastery",
      href: href(`/courses/${course.id}/mastery`),
      icon: Target,
      label: <TranslatedText namespace="student.navigation" messageKey="mastery" />,
    },
    {
      id: "progress",
      href: href(`/courses/${course.id}/progress`),
      icon: TrendingUp,
      label: <TranslatedText namespace="student.navigation" messageKey="progress" />,
    },
    {
      id: "leaderboard",
      href: href(`/courses/${course.id}/leaderboard`),
      icon: Trophy,
      label: <TranslatedText namespace="student.navigation" messageKey="leaderboard" />,
    },
    {
      id: "results",
      href: href(`/courses/${course.id}/my-results`),
      icon: Award,
      label: <TranslatedText namespace="student.mobile" messageKey="examResultsShort" />,
    },
    {
      id: "playground",
      href: href(`/courses/${course.id}/playground`),
      icon: Terminal,
      label: "Playground",
    },
  ];

  return (
      <CoursePageShell title={course.title} description={course.description ?? ""} icon={BookOpen} maxWidth="7xl" hideMobileTitle>
        <Reveal>
          {course.pricing && <div className="mb-3"><CoursePricingLabel pricing={course.pricing} /></div>}
          {!hasFullContentAccess && (
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
          {hasFullContentAccess && highlights}
          <div className="mb-6">{chapterOutline}</div>
          {hasFullContentAccess && (
            <nav aria-label={course.title} className="grid grid-cols-2 gap-2 border-t border-border/50 pt-5 md:hidden">
              {mobileQuickLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex min-h-11 items-center gap-2.5 rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-body-sm font-medium text-foreground transition-colors hover:border-border hover:bg-muted/50 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/80 text-muted-foreground">
                      <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
        </Reveal>
      </CoursePageShell>
  );
}
