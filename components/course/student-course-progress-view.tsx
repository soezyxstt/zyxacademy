
import type { ComponentProps } from "react";
import Link from "next/link";
import { Target, History } from "lucide-react";
import { StudyStatisticsCard } from "@/components/course/study-statistics-card";
import { RecentActivityCard } from "@/components/course/recent-activity-card";
import { courseListRowClass } from "./course-surfaces";
import { TranslatedText } from "@/components/i18n/translated-text";

export function StudentCourseProgressView({ href = (path: string) => path,  courseId, statistics, activities }: { href?: (path: string) => string;
  courseId: string;
  statistics: ComponentProps<typeof StudyStatisticsCard>["data"];
  activities: ComponentProps<typeof RecentActivityCard>["data"];
}) {

  return (
    <div className="space-y-8">
      <StudyStatisticsCard data={statistics} />
      <RecentActivityCard data={activities} />

      <section className="text-left">
        <h3 className="mb-1 font-heading text-body-base font-bold text-foreground">
          <TranslatedText namespace="learning" messageKey="progress.moreAnalysis" />
        </h3>
        <ul>
          {[
            { path: "mastery", icon: Target, label: "progress.masteryMap" },
            { path: "my-results", icon: History, label: "progress.quizResults" },
          ].map(({ path, icon: Icon, label }) => (
            <li key={path}>
              <Link href={href(`/courses/${courseId}/${path}`)} className={courseListRowClass("items-center")}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground ring-1 ring-inset ring-border/60">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 wrap-break-word text-body-sm font-semibold text-foreground">
                  <TranslatedText namespace="learning" messageKey={label} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
