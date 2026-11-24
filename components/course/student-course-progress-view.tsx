
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
    <div className="space-y-(--major-gap) md:space-y-10">
      <StudyStatisticsCard data={statistics} />
      <div className="grid min-w-0 gap-y-(--major-gap) lg:grid-cols-12 lg:gap-x-(--reading-section-gap)">
        <div className="min-w-0 lg:col-span-7">
          <RecentActivityCard data={activities} />
        </div>

        <section className="min-w-0 text-left lg:col-span-5">
          <h2 className="mb-1 font-heading text-body-base font-bold text-foreground">
            <TranslatedText namespace="learning" messageKey="progress.moreAnalysis" />
          </h2>
          <ul className="divide-y divide-border/30">
            {[
              { path: "mastery", icon: Target, label: "progress.masteryMap" },
              { path: "my-results", icon: History, label: "progress.quizResults" },
            ].map(({ path, icon: Icon, label }) => (
              <li key={path}>
                <Link href={href(`/courses/${courseId}/${path}`)} className={courseListRowClass("min-h-11 items-center")}>
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 wrap-anywhere text-body-sm font-semibold text-foreground">
                    <TranslatedText namespace="learning" messageKey={label} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
