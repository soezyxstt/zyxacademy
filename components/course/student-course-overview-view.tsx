
import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";

export function StudentCourseOverviewView({ href = (path: string) => path,  course, isEnrolled, highlights, chapterOutline }: { href?: (path: string) => string; 
  course: { id: string; title: string; description: string | null };
  isEnrolled: boolean;
  highlights: ReactNode;
  chapterOutline: ReactNode;
}) {

  return (
      <CoursePageShell title={course.title} description={course.description ?? ""} icon={BookOpen} maxWidth="7xl" hideMobileTitle>
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
          {isEnrolled && highlights}
          <div className="mb-6">{chapterOutline}</div>
          {isEnrolled && (
            <div className="mt-6 flex items-center justify-between border-t border-border/40 pt-4">
              <Link href={href(`/courses/${course.id}/progress`)} className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-brand-primary hover:underline">
                <span><TranslatedText namespace="learning" messageKey="courseOverview.viewProgress" /></span>
                <ArrowRight className="size-4" />
              </Link>
            </div>
          )}
        </Reveal>
      </CoursePageShell>
  );
}
