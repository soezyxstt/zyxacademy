"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminTableHead } from "@/components/admin/table";
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
    <div className="space-y-(--related-gap)">
      {/* KPI Strip */}
      <AdminStatStrip>
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
      <section aria-labelledby="course-quiz-results">
        <div className="flex items-center border-b border-border/60 pb-2">
          <h2 id="course-quiz-results" className="flex items-center gap-2 font-heading text-body-base font-bold text-foreground">
            <BarChart3 className="size-4 text-muted-foreground" aria-hidden />
            {t("courseDetail.analytics.title")}
          </h2>
        </div>

        {quizzes.length === 0 ? (
          <AdminEmptyState compact icon={BarChart3} title={t("courseDetail.analytics.emptyTitle")} description={t("courseDetail.analytics.emptyDescription")} />
        ) : (
          <>
            {/* Mobile stacked rows */}
            <div className="divide-y divide-border/60 lg:hidden">
              {quizzes.map((quiz) => {
                const reportHref = courseSlug
                  ? `/admin/courses/${encodeURIComponent(courseSlug)}/analytics/${encodeURIComponent(quiz.id)}`
                  : `/admin/quiz-insights/${encodeURIComponent(quiz.id)}`;

                return (
                  <div key={quiz.id} className="space-y-2 py-(--row-padding)">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="wrap-anywhere text-body-sm font-semibold text-foreground">
                          {quiz.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="rounded-md border-border/60 bg-muted/20 px-1.5 py-0 text-body-2xs font-normal capitalize text-muted-foreground"
                          >
                            {t(`courseDetail.quizzes.categories.${quiz.category}`)}
                          </Badge>
                          <span className="text-body-xs tabular-nums text-muted-foreground">
                            {t("courseDetail.analytics.students", { count: quiz.totalAttempts || 0 })}
                          </span>
                        </div>
                      </div>
                      <Button
                        asChild
                        size="sm"
                        variant={quiz.lastAiInsight ? "default" : "outline"}
                        className="h-8 shrink-0 gap-1 rounded-md px-2.5 text-body-sm"
                      >
                        <Link href={reportHref}>
                          <span>{t("courseDetail.analytics.report")}</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs">
                      <div className="flex items-center gap-3 tabular-nums">
                        <span className="font-semibold">
                          {(quiz.totalAttempts || 0) > 0 ? (
                            <span className={(quiz.avgScore || 0) >= 70 ? "text-status-success" : "text-status-warning"}>
                              {quiz.avgScore || 0} / 100
                            </span>
                          ) : (
                            <span className="font-normal text-muted-foreground">{t("courseDetail.analytics.noData")}</span>
                          )}
                        </span>
                        {(quiz.totalAttempts || 0) > 0 && (
                          <span className="text-muted-foreground">
                            {t("courseDetail.analytics.passRate")}: {quiz.passRate || 0}%
                          </span>
                        )}
                      </div>

                      {quiz.lastAiInsight ? (
                        <div className="flex items-center gap-1 font-medium text-status-success">
                          <CheckCircle2 className="size-3.5 shrink-0" />
                          <span>
                            {t("courseDetail.analytics.analyzedAt")}<FormattedDate date={quiz.lastAiInsight.createdAt} options={{ day: "numeric", month: "short" }} />)
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <HelpCircle className="size-3 shrink-0 text-muted-foreground/60" />
                          <span>{t("courseDetail.analytics.notAnalyzed")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-body-xs">
                <AdminTableHead>
                  <tr>
                    <th className="px-3.5 py-2">{t("courseDetail.analytics.quizName")}</th>
                    <th className="px-3.5 py-2">{t("courseDetail.analytics.category")}</th>
                    <th className="px-3.5 py-2 text-center">{t("courseDetail.analytics.attempts")}</th>
                    <th className="px-3.5 py-2 text-center">{t("courseDetail.analytics.averageScore")}</th>
                    <th className="px-3.5 py-2 text-center">{t("courseDetail.analytics.passRate")}</th>
                    <th className="px-3.5 py-2">{t("courseDetail.analytics.insightStatus")}</th>
                    <th className="px-3.5 py-2 text-right">{t("courseDetail.analytics.actions")}</th>
                  </tr>
                </AdminTableHead>
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
          </>
        )}
      </section>
    </div>
  );
}
