
import type { ComponentProps } from "react";
import Link from "next/link";
import { Target, History, ArrowRight } from "lucide-react";
import { StudyStatisticsCard } from "@/components/course/study-statistics-card";
import { RecentActivityCard } from "@/components/course/recent-activity-card";
import { TranslatedText } from "@/components/i18n/translated-text";

export function StudentCourseProgressView({ href = (path: string) => path,  courseId, statistics, activities }: { href?: (path: string) => string; 
  courseId: string;
  statistics: ComponentProps<typeof StudyStatisticsCard>["data"];
  activities: ComponentProps<typeof RecentActivityCard>["data"];
}) {

  return (
    <div className="space-y-6">
      <StudyStatisticsCard data={statistics} />
      <RecentActivityCard data={activities} />

      <section className="text-left">
        <h3 className="mb-3 font-heading text-body-base font-bold text-foreground">
          <TranslatedText namespace="learning" messageKey="progress.moreAnalysis" />
        </h3>
        <div className="divide-y divide-border/40">
          <Link
            href={href(`/courses/${courseId}/mastery`)}
            className="group flex items-center justify-between py-3 transition-colors hover:text-brand-primary"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <Target className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-body-sm font-semibold text-foreground group-hover:text-brand-primary">
                  <TranslatedText namespace="learning" messageKey="progress.masteryMap" />
                </p>
              </div>
            </div>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary" />
          </Link>

          <Link
            href={href(`/courses/${courseId}/my-results`)}
            className="group flex items-center justify-between py-3 transition-colors hover:text-brand-primary"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-secondary/10 text-brand-secondary">
                <History className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-body-sm font-semibold text-foreground group-hover:text-brand-primary">
                  <TranslatedText namespace="learning" messageKey="progress.quizResults" />
                </p>
              </div>
            </div>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary" />
          </Link>
        </div>
      </section>
    </div>
  );
}
