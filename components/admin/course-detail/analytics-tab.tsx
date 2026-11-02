"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import {
  BarChart3,
  TrendingUp,
  Award,
  BrainCircuit,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { FormattedDate } from "@/components/ui/formatted-date";
import type { CourseQuiz } from "./quizzes-tab";
import { useTranslations } from "@/lib/i18n/client";

type Props = {
  courseId: string;
  courseSlug?: string;
  courseTitle: string;
  quizzes: CourseQuiz[];
  stats: {
    totalAttempts: number;
    avgScore: number;
    passRate: number;
  };
};

export function AnalyticsTab({
  courseId: _courseId,
  courseSlug,
  courseTitle: _courseTitle,
  quizzes,
  stats,
}: Props) {
  const t = useTranslations("adminAcademic");
  const analyzedWithAiCount = quizzes.filter((q) => q.lastAiInsight !== null && q.lastAiInsight !== undefined).length;

  return (
    <div className="space-y-4">
      {/* KPI Strip */}
      <AdminStatStrip className="lg:grid-cols-4">
        <AdminStatStripItem
          label={t("courseDetail.analytics.totalAttempts")}
          value={stats.totalAttempts}
          caption={t("courseDetail.analytics.acrossQuizzes", { count: quizzes.length })}
          icon={TrendingUp}
          iconClassName="text-brand-primary"
        />
        <AdminStatStripItem
          label={t("courseDetail.analytics.averageScore")}
          value={`${stats.avgScore} / 100`}
          caption={t("courseDetail.analytics.studentScores")}
          icon={Award}
          iconClassName="text-brand-secondary"
        />
        <AdminStatStripItem
          label={t("courseDetail.analytics.passRate")}
          value={`${stats.passRate}%`}
          caption={t("courseDetail.analytics.passingScore")}
          icon={CheckCircle2}
          iconClassName="text-status-success"
        />
        <AdminStatStripItem
          label={t("courseDetail.analytics.analyzed")}
          value={
            <>
              {analyzedWithAiCount}{" "}
              <span className="text-body-xs text-muted-foreground font-normal">/ {quizzes.length}</span>
            </>
          }
          caption={t("courseDetail.analytics.insightCount")}
          icon={BrainCircuit}
          iconClassName="text-brand-primary"
        />
      </AdminStatStrip>

      {/* Per Quiz Performance Table */}
      <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/20 flex items-center justify-between">
          <h3 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="size-4 text-brand-primary" />
            {t("courseDetail.analytics.title")}
          </h3>
        </div>

        {quizzes.length === 0 ? (
          <div className="text-center py-8 px-4">
            <HelpCircle className="size-6 text-muted-foreground/40 mx-auto mb-1.5" />
            <p className="text-body-xs font-medium text-foreground">{t("courseDetail.analytics.emptyTitle")}</p>
            <p className="text-body-xs text-muted-foreground mt-0.5">
              {t("courseDetail.analytics.emptyDescription")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-body-xs">
              <thead className="bg-muted text-body-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-3.5 py-2">{t("courseDetail.analytics.quizName")}</th>
                  <th className="px-3.5 py-2">{t("courseDetail.analytics.category")}</th>
                  <th className="px-3.5 py-2 text-center">{t("courseDetail.analytics.attempts")}</th>
                  <th className="px-3.5 py-2 text-center">{t("courseDetail.analytics.averageScore")}</th>
                  <th className="px-3.5 py-2 text-center">{t("courseDetail.analytics.passRate")}</th>
                  <th className="px-3.5 py-2">{t("courseDetail.analytics.insightStatus")}</th>
                  <th className="px-3.5 py-2 text-right">{t("courseDetail.analytics.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {quizzes.map((quiz) => (
                  <tr key={quiz.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3.5 py-2.5 font-medium text-foreground">
                      <p className="font-semibold">{quiz.title}</p>
                      <p className="text-body-xs text-muted-foreground">ID: {quiz.id}</p>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Badge
                        variant="outline"
                        className="rounded-md text-body-2xs px-1.5 py-0 font-normal capitalize text-muted-foreground border-border/60 bg-muted/20"
                      >
                        {t(`courseDetail.quizzes.categories.${quiz.category}`)}
                      </Badge>
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-medium">
                          {t("courseDetail.analytics.students", { count: quiz.totalAttempts || 0 })}
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-semibold">
                      {(quiz.totalAttempts || 0) > 0 ? (
                        <span className={(quiz.avgScore || 0) >= 70 ? "text-status-success" : "text-status-warning"}>
                          {quiz.avgScore || 0} / 100
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-body-xs">{t("courseDetail.analytics.noData")}</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-medium">
                      {(quiz.totalAttempts || 0) > 0 ? (
                        <span>{quiz.passRate || 0}%</span>
                      ) : (
                        <span className="text-muted-foreground text-body-xs">{t("courseDetail.analytics.noData")}</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">
                      {quiz.lastAiInsight ? (
                        <div className="flex items-center gap-1 text-status-success text-body-xs font-medium">
                          <CheckCircle2 className="size-3.5 shrink-0" />
                          <span>
                            {t("courseDetail.analytics.analyzedAt")}<FormattedDate date={quiz.lastAiInsight.createdAt} options={{ day: "numeric", month: "short" }} />)
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted-foreground text-body-xs">
                          <HelpCircle className="size-3 text-muted-foreground/60 shrink-0" />
                          <span>{t("courseDetail.analytics.notAnalyzed")}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <Button
                        asChild
                        size="sm"
                        variant={quiz.lastAiInsight ? "default" : "outline"}
                        className="gap-1 rounded-md text-body-sm h-8 px-2.5"
                      >
                        <Link
                          href={courseSlug
                            ? `/admin/courses/${encodeURIComponent(courseSlug)}/analytics/${encodeURIComponent(quiz.id)}`
                            : `/admin/quiz-insights/${encodeURIComponent(quiz.id)}`}
                        >
                          <span>{t("courseDetail.analytics.report")}</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
