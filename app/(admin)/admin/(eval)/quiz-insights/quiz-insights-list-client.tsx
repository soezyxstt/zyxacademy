"use client";

import { Skeleton } from "@/components/ui/skeleton";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  BarChart3,
  BrainCircuit,
  BookOpen,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Award,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FormattedDate } from "@/components/ui/formatted-date";
import { SearchBar } from "@/components/ui/search-bar";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { cn } from "@/lib/utils";

export interface QuizInsightOverviewItem {
  type: "quiz_template";
  id: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  courseId: string;
  courseName: string;
  status: string;
  timeLimitSeconds: number | null;
  createdAt: string;
  totalAttempts: number;
  avgScore: number;
  passRate: number;
  lastAiInsight: {
    id: string;
    createdAt: string;
    sampleSize: number;
  } | null;
}

export interface LockedCourseAnalyticsInfo {
  id: string;
  slug: string;
  title: string;
  compatibleCourseIds?: string[];
}

export interface QuizInsightsListClientProps {
  lockedCourse?: LockedCourseAnalyticsInfo;
  detailHrefPrefix?: string;
  backHref?: string;
  backLabel?: string;
  hideHeader?: boolean;
}

export function QuizInsightsListClient({
  lockedCourse,
  detailHrefPrefix = "/admin/quiz-insights",
  backHref,
  backLabel,
  hideHeader = Boolean(lockedCourse),
}: QuizInsightsListClientProps = {}) {
  const tx = useTranslations("adminEval.quizInsights");
  const [items, setItems] = useState<QuizInsightOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCourse, setSelectedCourse] = useState(lockedCourse ? lockedCourse.id : "all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (lockedCourse) {
        params.set("courseId", lockedCourse.id);
      }
      const url = `/api/admin/quiz-insights${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Gagal mengambil data ringkasan kuis:", err);
    } finally {
      setLoading(false);
    }
  }, [lockedCourse]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Filter items locally
  const filteredItems = items.filter((item) => {
    const matchSearch =
      !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.courseName.toLowerCase().includes(search.toLowerCase());
    const matchCourse = lockedCourse || selectedCourse === "all" || item.courseId === selectedCourse;
    const matchCategory = selectedCategory === "all" || item.category === selectedCategory;
    return matchSearch && matchCourse && matchCategory;
  });

  // Extract unique courses for filter
  const uniqueCourses = Array.from(
    new Map(items.map((i) => [i.courseId, i.courseName || i.courseId])).entries()
  );

  // High-level KPI metrics
  const totalQuizzes = filteredItems.length;
  const totalAttemptsSum = filteredItems.reduce((acc, curr) => acc + curr.totalAttempts, 0);
  const avgOverallScore =
    filteredItems.length > 0
      ? Math.round(filteredItems.reduce((acc, curr) => acc + curr.avgScore, 0) / filteredItems.length)
      : 0;
  const analyzedWithAiCount = filteredItems.filter((i) => i.lastAiInsight !== null).length;

  return (
    <div className="space-y-4">
      {hideHeader ? null : lockedCourse ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="size-4 text-brand-primary" />
              <span>{tx("courseQuizAnalytics")}</span>
            </h2>
            <p className="text-body-xs text-muted-foreground">
              {tx("courseQuizAnalyticsDescription", { course: lockedCourse.title })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchItems}
            disabled={loading}
            className="gap-2 rounded-lg text-body-sm"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            <span>{tx("refresh")}</span>
          </Button>
        </div>
      ) : (
        <AdminPageHeader
          icon={BarChart3}
          title={tx("title")}
          backHref={backHref}
          backLabel={backLabel}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={fetchItems}
              disabled={loading}
              className="gap-2 rounded-lg text-body-sm"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              <span>{tx("refresh")}</span>
            </Button>
          }
        />
      )}

      {/* KPI Strip */}
      <AdminStatStrip className="lg:grid-cols-4">
        <AdminStatStripItem
          label={tx("totalQuizzes")}
          value={totalQuizzes}
          icon={BookOpen}
          iconClassName="text-brand-primary"
        />
        <AdminStatStripItem
          label={tx("totalAttempts")}
          value={totalAttemptsSum}
          caption={tx("completedAttempts")}
          icon={TrendingUp}
          iconClassName="text-status-info"
        />
        <AdminStatStripItem
          label={tx("averageScore")}
          value={`${avgOverallScore} / 100`}
          caption={tx("averageSelectedQuizzes")}
          icon={Award}
          iconClassName="text-brand-secondary"
        />
        <AdminStatStripItem
          label={tx("analyzed")}
          value={
            <>
              {analyzedWithAiCount}{" "}
              <span className="text-body-xs text-muted-foreground font-normal">/ {totalQuizzes}</span>
            </>
          }
          icon={BrainCircuit}
          iconClassName="text-brand-primary"
        />
      </AdminStatStrip>

      {/* Filter and Search Bar */}
      <div className="flex flex-row flex-wrap items-center gap-2">
        <SearchBar
          size="sm"
          placeholder={
            lockedCourse
              ? tx("searchQuizTitle")
              : tx("searchQuizOrCourse")
          }
          value={search}
          onSearch={setSearch}
          onClear={() => setSearch("")}
          containerClassName="flex-1 min-w-[140px]"
        />

        {!lockedCourse && (
          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger className="w-[160px] sm:w-[180px] h-9 text-body-sm rounded-lg shrink-0">
              <SelectValue placeholder={tx("course")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("allCourses")}</SelectItem>
              {uniqueCourses.map(([cId, cName]) => (
                <SelectItem key={cId} value={cId}>
                  {cName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[140px] sm:w-[160px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder={tx("quizCategory")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tx("allCategories")}</SelectItem>
            <SelectItem value="daily">{tx("category.daily")}</SelectItem>
            <SelectItem value="weekly">{tx("category.weekly")}</SelectItem>
            <SelectItem value="chapter">{tx("category.chapter")}</SelectItem>
            <SelectItem value="simulation">{tx("category.simulation")}</SelectItem>
            <SelectItem value="premium">{tx("category.premium")}</SelectItem>
          </SelectContent>
        </Select>

        {hideHeader && (
          <Button
            variant="outline"
            size="sm"
            onClick={fetchItems}
            disabled={loading}
            className="h-9 gap-1.5 rounded-lg text-body-sm shrink-0"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            <span>{tx("refresh")}</span>
          </Button>
        )}
      </div>

      {/* Quizzes Grid / Table */}
      <AdminTable>
        {loading ? (
          <div role="status" aria-label={tx("loading")} className="divide-y divide-border">
            {[0, 1, 2, 3, 4].map((row) => <div key={row} className="flex items-center gap-4 px-4 py-3.5"><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-40 max-w-full" /><Skeleton className="h-3 w-20" /></div><Skeleton className="hidden h-5 w-24 sm:block" /><Skeleton className="hidden h-5 w-20 md:block" /><Skeleton className="h-5 w-12" /><Skeleton className="hidden h-5 w-16 lg:block" /><Skeleton className="h-8 w-8" /></div>)}
          </div>
        ) : filteredItems.length === 0 ? (
          <AdminEmptyState
            icon={HelpCircle}
            title={tx("noQuizzesFound")}
            description={
              lockedCourse
                ? tx("noCourseQuizzesMatch")
                : tx("adjustSearchOrCourseFilter")
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <AdminTableHead className="text-body-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{tx("quiz")}</th>
                  {!lockedCourse && <th className="px-4 py-3">{tx("course")}</th>}
                  <th className="px-4 py-3">{tx("categoryLabel")}</th>
                  <th className="px-4 py-3 text-center">{tx("attempts")}</th>
                  <th className="px-4 py-3 text-center">{tx("averageScore")}</th>
                  <th className="px-4 py-3 text-center">{tx("passRate")}</th>
                  <th className="px-4 py-3">{tx("insightStatus")}</th>
                  <th className="px-4 py-3 text-right">{tx("actions")}</th>
                </tr>
              </AdminTableHead>
              <tbody className="divide-y divide-border">
                {filteredItems.map((item) => {
                  const detailHref = `${detailHrefPrefix}/${encodeURIComponent(item.id)}`;
                  return (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-foreground">
                        <div>
                          <p className="font-semibold line-clamp-1">{item.title}</p>
                          <p className="text-body-xs text-muted-foreground font-mono">ID: {item.id}</p>
                        </div>
                      </td>
                      {!lockedCourse && (
                        <td className="px-4 py-3.5 text-muted-foreground">
                          <Badge variant="outline" className="rounded-md font-normal text-body-xs">
                            {item.courseName}
                          </Badge>
                        </td>
                      )}
                      <td className="px-4 py-3.5">
                        <Badge variant="secondary" className="rounded-md text-body-xs capitalize">
                          {tx(`category.${item.category}`)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-center font-medium tabular-nums">
                        {tx("studentAttempts", { count: item.totalAttempts })}
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold tabular-nums">
                        <span className={item.avgScore >= 70 ? "text-status-success" : "text-status-warning"}>
                          {item.avgScore} / 100
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-medium tabular-nums">
                        {item.passRate}%
                      </td>
                      <td className="px-4 py-3.5">
                        {item.lastAiInsight ? (
                          <div className="flex items-center gap-1.5 text-status-success text-body-xs font-medium">
                            <CheckCircle2 className="size-4 shrink-0" />
                            <span>
                              {tx("analyzedOn", { date: "__DATE__" }).split("__DATE__")[0]}<FormattedDate date={item.lastAiInsight.createdAt} options={{ day: "numeric", month: "short", year: "numeric" }} />{tx("analyzedOn", { date: "__DATE__" }).split("__DATE__")[1]}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-muted-foreground text-body-xs">
                            <HelpCircle className="size-3.5 text-muted-foreground/60 shrink-0" />
                            <span>{tx("notAnalyzed")}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Button
                            asChild
                            size="sm"
                            variant={item.lastAiInsight ? "default" : "outline"}
                            className="gap-1.5 rounded-lg text-body-sm"
                          >
                            <Link href={detailHref}><span>{tx("viewAnalysis")}</span><ArrowRight className="size-3.5" /></Link>
                          </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTable>
    </div>
  );
}
