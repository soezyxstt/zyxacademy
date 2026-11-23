"use client";

import { LeaderboardRowsSkeleton } from "@/components/admin/content-loading-skeletons";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  Trophy,
  RefreshCw,
  Eye,
  SlidersHorizontal,
  X,
  BarChart3,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FormattedDate } from "@/components/ui/formatted-date";
import { SearchBar } from "@/components/ui/search-bar";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/state-panels";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { CourseCombobox } from "@/components/admin/course-combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { LockedCourseInfo } from "@/lib/admin/course-identity";
import { adminLeaderboardQuery, type RankedStudent } from "@/lib/admin/leaderboard-query";
import { useQueryAccountId } from "@/hooks/use-query-account";

function formatDuration(seconds: number, format: (key: "seconds" | "minutesSeconds", values: { seconds: number; minutes?: number }) => string): string {
  if (!seconds || seconds <= 0) return format("seconds", { seconds: 0 });
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return format("minutesSeconds", { minutes: mins, seconds: secs });
  }
  return format("seconds", { seconds: secs });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "SZ";
}

export interface AdminLeaderboardClientProps {
  lockedCourse?: LockedCourseInfo;
  backHref?: string;
  backLabel?: string;
  hideHeader?: boolean;
}

export function AdminLeaderboardClient(props: AdminLeaderboardClientProps = {}) {
  const userId = useQueryAccountId();
  return <AdminLeaderboardContent key={userId ?? "pending"} {...props} userId={userId} />;
}

function AdminLeaderboardContent({
  lockedCourse,
  backHref,
  backLabel,
  hideHeader = Boolean(lockedCourse),
  userId,
}: AdminLeaderboardClientProps & { userId: string | undefined }) {
  const tx = useTranslations("adminEval.leaderboard");

  const [selectedCourse, setSelectedCourse] = useState(
    lockedCourse ? lockedCourse.id : "all"
  );
  const [selectedType, setSelectedType] = useState("all");
  const [search, setSearch] = useState("");

  const [detailStudent, setDetailStudent] = useState<RankedStudent | null>(null);
  const effectiveCourseId = lockedCourse ? lockedCourse.id : selectedCourse;
  const { data, isPending, isFetching, error, refetch } = useQuery(adminLeaderboardQuery(userId ?? "", {
    courseId: effectiveCourseId,
    type: selectedType,
    search,
  }));
  const loading = isPending || !userId;
  const courses = data?.courses ?? [];
  const courseInsights = data?.mode === "overview" ? data.courseInsights : [];
  const students = data?.mode === "course" ? data.students : [];
  const summary = data?.summary ?? { totalStudents: 0, totalAttempts: 0, avgOverallScore: 0, highestScore: 0 };
  const responseMode = data?.mode ?? (effectiveCourseId === "all" ? "overview" : "course");
  const fetchLeaderboard = () => { void refetch(); };

  const isOverview = !lockedCourse && responseMode === "overview";

  const hasActiveFilters =
    (!lockedCourse && selectedCourse !== "all") ||
    selectedType !== "all" ||
    search.trim() !== "";

  const resetFilters = () => {
    if (!lockedCourse) {
      setSelectedCourse("all");
    }
    setSelectedType("all");
    setSearch("");
  };


  return (
    <div className="space-y-4">
      {hideHeader ? null : lockedCourse ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
              <Trophy className="size-4 text-brand-primary" />
        <span>{tx("studentLeaderboard")}</span>
            </h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLeaderboard}
            disabled={loading || isFetching}
            className="gap-2 rounded-lg text-body-sm"
          >
            <RefreshCw
              className={cn("size-3.5", isFetching && "animate-spin")}
            />
            <span>{tx("refresh")}</span>
          </Button>
        </div>
      ) : (
        <AdminPageHeader
          icon={Trophy}
          title={tx("title")}
          backHref={backHref}
          backLabel={backLabel}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLeaderboard}
              disabled={loading || isFetching}
              className="gap-2 rounded-lg text-body-sm"
            >
              <RefreshCw
                className={cn("size-3.5", isFetching && "animate-spin")}
              />
              <span>{tx("refresh")}</span>
            </Button>
          }
        />
      )}

      {/* KPI Stats Bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-border bg-card/60 px-3.5 py-2 text-body-xs shadow-2xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{isOverview ? tx("uniqueStudents") : tx("rankedStudents")}</span>
          <span className="font-bold tabular-nums text-foreground">
            {summary.totalStudents}
          </span>
        </div>
        <span className="text-border hidden sm:inline">&bull;</span>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{tx("totalAttempts")}</span>
          <span className="font-bold tabular-nums text-foreground">
            {summary.totalAttempts}
          </span>
        </div>
        <span className="text-border hidden sm:inline">&bull;</span>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{tx("averageScore")}</span>
          <span className="font-bold tabular-nums text-brand-primary">
            {summary.avgOverallScore}%
          </span>
        </div>
        <span className="text-border hidden sm:inline">&bull;</span>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{tx("highestScore")}</span>
          <span className="font-bold tabular-nums text-status-success">
            {summary.highestScore}
          </span>
        </div>
      </div>


      {/* Toolbar: single row on desktop, wraps near 380px */}
      <div className="flex flex-row flex-wrap items-center gap-2">
        <SearchBar
          collapsible
          size="sm"
          placeholder={
            isOverview
              ? tx("searchCourses")
              : tx("searchStudents")
          }
          value={search}
          onSearch={setSearch}
          onClear={() => setSearch("")}
        />

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          {!lockedCourse && (
            <CourseCombobox
              courses={courses}
              value={selectedCourse}
              onValueChange={setSelectedCourse}
              allLabel={tx("allCourses")}
              className="text-body-sm"
            />
          )}

          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[140px] sm:w-[160px] h-9 text-body-sm rounded-lg shrink-0">
              <SelectValue placeholder={tx("assessmentType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("allTypes")}</SelectItem>
              <SelectItem value="quiz">{tx("quiz")}</SelectItem>
              <SelectItem value="simulation">{tx("simulation")}</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              title={tx("resetFilters")}
              className="h-9 px-2.5 text-body-sm text-muted-foreground hover:text-foreground rounded-lg"
            >
              <X className="size-3.5 mr-1" />
              <span>{tx("reset")}</span>
            </Button>
          )}

          {hideHeader && (
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLeaderboard}
              disabled={loading || isFetching}
              className="h-9 gap-1.5 rounded-lg text-body-sm shrink-0"
            >
              <RefreshCw
                className={cn("size-3.5", isFetching && "animate-spin")}
              />
              <span>{tx("refresh")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Content: Overview or Course leaderboard */}
      <AdminTable>
        {loading ? (
          <LeaderboardRowsSkeleton label={tx("loading")} />
        ) : error ? (
          <AdminErrorState message={tx("loadFailed")} onRetry={fetchLeaderboard} />
        ) : isOverview ? (
          /* ====== OVERVIEW MODE ====== */
          courseInsights.length === 0 ? (
            <AdminEmptyState
              icon={BarChart3}
              title={tx("noComparisonData")}
              description={tx("noComparisonDescription")}
            />
          ) : (
            <>
              {/* Mobile stacked overview rows */}
              <div className="divide-y divide-border md:hidden">
                {courseInsights.map((ci) => (
                  <div key={ci.courseId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="break-words text-body-sm font-semibold text-foreground">
                        {ci.courseTitle}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-body-xs tabular-nums text-muted-foreground">
                        <span>{tx("students")}: {ci.participatingStudents}</span>
                        <span>{tx("attempts")}: {ci.attemptCount}</span>
                        <span
                          className={cn(
                            "font-semibold",
                            ci.averageScore >= 70 ? "text-status-success" : "text-status-warning"
                          )}
                        >
                          {ci.averageScore}%
                        </span>
                        <span>{tx("highestScore")}: {ci.highestScore}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCourse(ci.courseId)}
                      className="h-8 shrink-0 gap-1 rounded-lg px-2 text-body-sm text-brand-primary hover:text-brand-primary"
                    >
                      <span>{tx("viewLeaderboard")}</span>
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Desktop overview table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-body-sm">
                  <AdminTableHead className="text-body-xs font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">{tx("course")}</th>
                      <th className="px-4 py-3 text-center">{tx("students")}</th>
                      <th className="px-4 py-3 text-center">{tx("attempts")}</th>
                      <th className="px-4 py-3 text-center">{tx("averageScore")}</th>
                      <th className="px-4 py-3 text-center">{tx("highestScore")}</th>
                      <th className="px-4 py-3 text-right">{tx("actions")}</th>
                    </tr>
                  </AdminTableHead>
                  <tbody className="divide-y divide-border">
                    {courseInsights.map((ci) => (
                      <tr
                        key={ci.courseId}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="font-semibold text-foreground">
                            {ci.courseTitle}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums font-medium">
                          {ci.participatingStudents}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums font-medium">
                          {ci.attemptCount}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums font-semibold">
                          <span
                            className={
                              ci.averageScore >= 70
                                ? "text-status-success"
                                : "text-status-warning"
                            }
                          >
                            {ci.averageScore}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-foreground font-medium">
                          {ci.highestScore}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCourse(ci.courseId)}
                            className="h-8 gap-1.5 px-2 text-body-sm text-brand-primary hover:text-brand-primary rounded-lg"
                          >
                            <span>{tx("viewLeaderboard")}</span>
                            <ArrowRight className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        ) : /* ====== COURSE MODE ====== */
        students.length === 0 ? (
          <AdminEmptyState
            icon={SlidersHorizontal}
            title={tx("noLeaderboardData")}
            description={tx("noLeaderboardDescription")}
          />
        ) : (
          <>
            {/* Mobile stacked student rows */}
            <div className="divide-y divide-border md:hidden">
              {students.map((student) => {
                const isTop1 = student.rank === 1;
                const isTop2 = student.rank === 2;
                const isTop3 = student.rank === 3;

                return (
                  <div key={student.studentId} className="space-y-2 py-3">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span
                          className={cn(
                            "inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-body-xs font-bold tabular-nums",
                            isTop1 &&
                              "border border-brand-secondary/40 bg-brand-secondary/20 text-brand-secondary",
                            isTop2 &&
                              "border border-slate-300 bg-slate-200 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                            isTop3 &&
                              "border border-amber-800/30 bg-amber-800/15 text-amber-800 dark:text-amber-400",
                            !isTop1 &&
                              !isTop2 &&
                              !isTop3 &&
                              "bg-muted/60 text-muted-foreground"
                          )}
                        >
                          {student.rank}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-sm font-semibold text-foreground">
                            {student.studentName}
                          </p>
                          <p className="truncate text-body-xs text-muted-foreground">
                            {student.studentEmail}
                          </p>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailStudent(student)}
                        className="h-8 shrink-0 gap-1 rounded-lg px-2 text-body-sm text-brand-primary hover:text-brand-primary"
                      >
                        <Eye className="size-3.5" />
                        <span>{tx("details")}</span>
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pl-9 text-body-xs tabular-nums text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span
                          className={cn(
                            "font-semibold",
                            student.avgScore >= 70 ? "text-status-success" : "text-status-warning"
                          )}
                        >
                          {student.avgScore}%
                        </span>
                        <span>{tx("bestScore")}: {student.bestScore}</span>
                        <span>{student.attemptCount} kuis</span>
                      </div>
                      <span>
                        {student.lastAttemptAt ? (
                          <FormattedDate
                            date={student.lastAttemptAt}
                            options={{ day: "numeric", month: "short", year: "numeric" }}
                          />
                        ) : (
                          "-"
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop student table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-body-sm">
                <AdminTableHead className="text-body-xs font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 w-16 text-center">#</th>
                    <th className="px-4 py-3">{tx("student")}</th>
                    <th className="px-4 py-3 text-center">{tx("attempts")}</th>
                    <th className="px-4 py-3 text-center">{tx("averageScore")}</th>
                    <th className="px-4 py-3 text-center">{tx("bestScore")}</th>
                    <th className="px-4 py-3 text-center">{tx("averageDuration")}</th>
                    <th className="px-4 py-3">{tx("lastAttempt")}</th>
                    <th className="px-4 py-3 text-right">{tx("actions")}</th>
                  </tr>
                </AdminTableHead>
                <tbody className="divide-y divide-border">
                  {students.map((student) => {
                    const isTop1 = student.rank === 1;
                    const isTop2 = student.rank === 2;
                    const isTop3 = student.rank === 3;

                    return (
                      <tr
                        key={student.studentId}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3.5 text-center">
                          <span
                            className={cn(
                              "inline-flex size-7 items-center justify-center rounded-lg text-body-xs font-bold tabular-nums",
                              isTop1 &&
                                "bg-brand-secondary/20 text-brand-secondary border border-brand-secondary/40",
                              isTop2 &&
                                "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700",
                              isTop3 &&
                                "bg-amber-800/15 text-amber-800 dark:text-amber-400 border border-amber-800/30",
                              !isTop1 &&
                                !isTop2 &&
                                !isTop3 &&
                                "text-muted-foreground bg-muted/60"
                            )}
                          >
                            {student.rank}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            {student.studentImage ? (
                              <Image
                                src={student.studentImage}
                                alt={student.studentName}
                                width={32}
                                height={32}
                                unoptimized
                                className="size-8 rounded-full object-cover border border-border shrink-0"
                              />
                            ) : (
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary font-bold text-body-xs border border-brand-primary/20">
                                {getInitials(student.studentName)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">
                                {student.studentName}
                              </p>
                              <p className="text-body-xs text-muted-foreground truncate">
                                {student.studentEmail}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-center tabular-nums font-medium">
                          {student.attemptCount} kuis
                        </td>

                        <td className="px-4 py-3.5 text-center tabular-nums font-semibold">
                          <span
                            className={
                              student.avgScore >= 70
                                ? "text-status-success"
                                : "text-status-warning"
                            }
                          >
                            {student.avgScore}%
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-center tabular-nums text-foreground font-medium">
                          {student.bestScore}
                        </td>

                        <td className="px-4 py-3.5 text-center tabular-nums text-muted-foreground text-body-xs">
                          {formatDuration(student.avgDuration, (key, values) => tx(key === "seconds" ? "durationSeconds" : "durationMinutesSeconds", values as any))}
                        </td>

                        <td className="px-4 py-3.5 text-muted-foreground text-body-xs whitespace-nowrap">
                          {student.lastAttemptAt ? (
                            <FormattedDate
                              date={student.lastAttemptAt}
                              options={{
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }}
                            />
                          ) : (
                            "-"
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetailStudent(student)}
                            className="h-8 gap-1.5 px-2 text-body-xs text-brand-primary hover:text-brand-primary rounded-lg"
                          >
                            <Eye className="size-3.5" />
                            <span>{tx("details")}</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AdminTable>

      {/* Student Attempt History Dialog */}
      {detailStudent && (
        <Dialog
          open={Boolean(detailStudent)}
          onOpenChange={(open) => {
            if (!open) setDetailStudent(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {tx("attemptHistoryTitle", { name: detailStudent.studentName })}
              </DialogTitle>
              <DialogDescription>
                {tx("attemptHistoryDescription", { email: detailStudent.studentEmail, count: detailStudent.attemptCount, score: detailStudent.avgScore })}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 divide-y divide-border rounded-lg border border-border md:hidden">
              {detailStudent.attempts.map((att) => (
                <div key={att.id} className="space-y-1.5 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-body-sm font-medium text-foreground">
                        {att.title}
                      </p>
                      <p className="truncate text-body-xs text-muted-foreground">
                        {att.courseTitle}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-body-sm font-semibold tabular-nums",
                        att.score >= 70 ? "text-status-success" : "text-status-warning"
                      )}
                    >
                      {att.score}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs text-muted-foreground">
                    <Badge variant="secondary" className="rounded-md text-body-xs capitalize">
                      {tx.has(`categoryType.${att.category}`) ? tx(`categoryType.${att.category}`) : att.category}
                    </Badge>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span>
                        {formatDuration(att.durationSeconds, (key, values) => tx(key === "seconds" ? "durationSeconds" : "durationMinutesSeconds", values as any))}
                      </span>
                      <span>
                        {att.submittedAt ? (
                          <FormattedDate
                            date={att.submittedAt}
                            options={{ day: "numeric", month: "short", year: "numeric" }}
                          />
                        ) : (
                          "-"
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 hidden overflow-x-auto rounded-lg border border-border md:block">
              <table className="w-full text-left text-body-sm">
                <thead className="bg-muted/50 border-b border-border text-body-xs font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-3.5 py-2.5">{tx("quizTitle")}</th>
                    <th className="px-3.5 py-2.5">{tx("course")}</th>
                    <th className="px-3.5 py-2.5">{tx("category")}</th>
                    <th className="px-3.5 py-2.5 text-center">{tx("score")}</th>
                    <th className="px-3.5 py-2.5 text-center">{tx("duration")}</th>
                    <th className="px-3.5 py-2.5">{tx("time")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detailStudent.attempts.map((att) => (
                    <tr key={att.id} className="hover:bg-muted/20">
                      <td className="px-3.5 py-2.5 font-medium text-foreground">
                        {att.title}
                      </td>
                      <td className="px-3.5 py-2.5 text-muted-foreground text-body-xs">
                        {att.courseTitle}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Badge
                          variant="secondary"
                          className="rounded-md text-body-xs capitalize"
                        >
                          {tx.has(`categoryType.${att.category}`) ? tx(`categoryType.${att.category}`) : att.category}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-semibold tabular-nums">
                        <span
                          className={
                            att.score >= 70
                              ? "text-status-success"
                              : "text-status-warning"
                          }
                        >
                          {att.score}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-center tabular-nums text-muted-foreground text-body-xs">
                        {formatDuration(att.durationSeconds, (key, values) => tx(key === "seconds" ? "durationSeconds" : "durationMinutesSeconds", values as any))}
                      </td>
                      <td className="px-3.5 py-2.5 text-muted-foreground text-body-xs whitespace-nowrap">
                        {att.submittedAt ? (
                          <FormattedDate
                            date={att.submittedAt}
                            options={{
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            }}
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
