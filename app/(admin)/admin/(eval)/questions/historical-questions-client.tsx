"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Flag,
  Square,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { DifficultyBadge, StatusBadge } from "@/components/admin/status-badges";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { SearchBar } from "@/components/ui/search-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { QuestionFilterField, QuestionFilterPopover } from "./question-filter-popover";
import { QuestionBankToolbar } from "./question-bank-tabs";
import { matchingHistoricalQuestionItems } from "./selection-actions";
import {
  createHistoricalQueryCoordinator,
  historicalQueryUrl,
  historicalReviewActionFor,
  normalizeHistoricalQuery,
  questionParamsFromUrl,
  toggleHistoricalQuestionEntries,
  type HistoricalQuestionQuery,
  type HistoricalReviewActionStatus,
  type HistoricalReviewStatus,
  type HistoricalSelectionItem,
} from "./question-query-state";

type ReviewStatus = HistoricalReviewStatus;
type Difficulty = "easy" | "medium" | "hard";
type CanonicalStatus = "draft" | "in_review" | "published" | "retired";
type ReviewActionStatus = HistoricalReviewActionStatus;

interface HistoricalOption {
  id?: string;
  text: string;
  isCorrect?: boolean;
}

interface HistoricalQuestion {
  id: string;
  difficulty: Difficulty;
  questionMarkdown: string;
  answerMarkdown: string | null;
  options: unknown[] | null;
  questionType: "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
  sourceTitle: string;
  sourceCategory: string;
  sourceYear: number | null;
  courseId: string;
  reviewStatus: ReviewStatus;
  canonicalStatus: CanonicalStatus;
  quizEligible: boolean;
  sourceQuestionNumber: string | null;
  sourceQuestionPart: string | null;
  sourcePage: number | null;
  answerProvenance: "official" | "source_solution" | "zyx_generated" | "unavailable" | null;
  solutionProvenance: "official" | "source_solution" | "zyx_generated" | "unavailable" | null;
}

interface Course {
  id: string;
  title: string;
}

interface Props {
  query?: HistoricalQuestionQuery;
  total?: number;
  questions: HistoricalQuestion[];
  courses: Course[];
  courseMap: Record<string, string>;
  canonicalCourseMap?: Record<string, string>;
}

const statusTone: Record<ReviewStatus, "muted" | "info" | "success" | "warning" | "error"> = {
  generated: "muted",
  reviewed: "info",
  published: "success",
  flagged: "warning",
  retired: "error",
};

/**
 * Normalizes raw option values from JSON or arrays into structured HistoricalOption items.
 *
 * @param value - The raw option payload from database or API.
 * @returns An array of normalized HistoricalOption objects.
 */
function normalizeOptions(value: unknown): HistoricalOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (typeof option === "string") return [{ text: option }];
    if (!option || typeof option !== "object" || !("text" in option) || typeof option.text !== "string") return [];
    return [{
      id: "id" in option && typeof option.id === "string" ? option.id : undefined,
      text: option.text,
      isCorrect: "isCorrect" in option && typeof option.isCorrect === "boolean" ? option.isCorrect : undefined,
    }];
  });
}

/**
 * Determines the next recommended review action and label based on question status and quiz eligibility.
 *
 * @param question - The historical question item to inspect.
 * @returns The target review action status and display label, or null if no transition applies.
 */
function reviewActionFor(question: Pick<HistoricalSelectionItem, "reviewStatus" | "quizEligible">): ReviewActionStatus | null {
  return historicalReviewActionFor(question);
}

/**
 * Interactive client studio component for managing historical reference questions.
 *
 * Provides responsive filtering, paginated viewing, detail inspection, and status transitions.
 *
 * @param props - Component properties containing questions list, courses, and course map.
 */
export function HistoricalQuestionsClient({
  query: providedQuery,
  total: providedTotal,
  questions,
  courses,
  courseMap,
}: Props) {
  const t = useTranslations("adminEval.historicalQuestions");
  const router = useRouter();
  const query = providedQuery ?? normalizeHistoricalQuery({ tab: "historical" });
  const total = providedTotal ?? questions.length;

  const coordinator = useRef(createHistoricalQueryCoordinator(query));
  const [draft, setDraft] = useState(query);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSearch = () => {
    if (debounce.current !== null) clearTimeout(debounce.current);
    debounce.current = null;
  };
  const pushIntent = () => router.push(historicalQueryUrl(window.location.href, coordinator.current.current), { scroll: false });

  useEffect(() => {
    setDraft(coordinator.current.acknowledge(query));
  }, [query]);

  useEffect(() => {
    const restore = () => {
      cancelSearch();
      setDraft(coordinator.current.restore(normalizeHistoricalQuery(questionParamsFromUrl(new URLSearchParams(window.location.search)))));
    };
    window.addEventListener("popstate", restore);
    return () => {
      cancelSearch();
      window.removeEventListener("popstate", restore);
    };
  }, []);

  const navigate = (changes: Partial<HistoricalQuestionQuery>, resetPage = true, delayed = false) => {
    cancelSearch();
    setDraft(coordinator.current.change(changes, resetPage));
    if (delayed) debounce.current = setTimeout(pushIntent, 300);
    else pushIntent();
  };

  const searchTerm = draft.search;
  const filterCourse = draft.course;
  const filterCategory = draft.category;
  const filterDifficulty = draft.difficulty;

  const setSearchTerm = (value: string) => navigate({ search: value }, true, value !== "");
  const setFilterCourse = (value: string) => navigate({ course: value });
  const setFilterCategory = (value: string) => navigate({ category: value as HistoricalQuestionQuery["category"] });
  const setFilterDifficulty = (value: string) => navigate({ difficulty: value as HistoricalQuestionQuery["difficulty"] });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<Map<string, HistoricalSelectionItem>>(new Map());
  const [localQuestions, setLocalQuestions] = useState(questions);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setLocalQuestions(questions);
    setSelectedEntries((current) => {
      if (current.size === 0) return current;
      const next = new Map(current);
      let changed = false;
      for (const q of questions) {
        if (next.has(q.id)) {
          if (!reviewActionFor(q)) {
            next.delete(q.id);
            changed = true;
          } else {
            const existing = next.get(q.id);
            if (existing?.reviewStatus !== q.reviewStatus || existing?.quizEligible !== q.quizEligible) {
              next.set(q.id, { id: q.id, reviewStatus: q.reviewStatus, quizEligible: q.quizEligible });
              changed = true;
            }
          }
        }
      }
      return changed ? next : current;
    });
  }, [questions]);

  const pageSize = Number(query.pageSize);
  const setPageSize = (value: number) => navigate({ pageSize: String(value) as HistoricalQuestionQuery["pageSize"] });
  const currentPage = query.page;
  const setCurrentPage = (value: number) => navigate({ page: value }, false);
  const tableRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedQuestions = localQuestions;

  const [allMatchingItems, setAllMatchingItems] = useState<HistoricalSelectionItem[] | null>(null);
  const filterKey = JSON.stringify({ ...query, page: 1 });
  const filterKeyRef = useRef(filterKey);
  filterKeyRef.current = filterKey;

  useEffect(() => {
    setAllMatchingItems(null);
  }, [filterKey, total]);

  const reviewableOnPage = localQuestions.filter((question) => reviewActionFor(question));
  const allReviewableSelected = allMatchingItems !== null
    ? allMatchingItems.length > 0 && allMatchingItems.every((item) => selectedEntries.has(item.id))
    : total > 0 &&
      total === localQuestions.length &&
      reviewableOnPage.length > 0 &&
      reviewableOnPage.every((question) => selectedEntries.has(question.id));

  const selectedItems = Array.from(selectedEntries.values());
  const selectedForReview = selectedItems
    .filter((question) => reviewActionFor(question) === "reviewed")
    .map((question) => question.id);
  const selectedForPublish = selectedItems
    .filter((question) => reviewActionFor(question) === "published")
    .map((question) => question.id);
  const selectedForFlag = selectedItems
    .filter((question) => reviewActionFor(question) === "flagged")
    .map((question) => question.id);

  function toggleSelect(id: string) {
    const question = localQuestions.find((item) => item.id === id);
    if (!question || !reviewActionFor(question)) return;
    setSelectedEntries((current) =>
      toggleHistoricalQuestionEntries(current, [
        { id: question.id, reviewStatus: question.reviewStatus, quizEligible: question.quizEligible },
      ]),
    );
  }

  async function toggleAll() {
    setUpdating(true);
    try {
      const requestedFilter = filterKeyRef.current;
      const items = await matchingHistoricalQuestionItems(query);
      if (requestedFilter !== filterKeyRef.current) return;
      setAllMatchingItems(items);
      setSelectedEntries((current) => toggleHistoricalQuestionEntries(current, items));
    } catch {
      toast.error(t("connectionError"));
    } finally {
      setUpdating(false);
    }
  }

  async function updateReviewStatus(ids: string[], reviewStatus: ReviewActionStatus) {
    if (ids.length === 0) {
      toast.error(t("selectReviewable"));
      return;
    }
    setUpdating(true);
    try {
      const response = await fetch("/api/admin/questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reviewStatus }),
      });
      if (!response.ok) {
        toast.error(t("updateFailed"));
        return;
      }
      const canonicalStatus = reviewStatus === "published" ? "published" : "in_review";
      setLocalQuestions((current) => current.map((question) => ids.includes(question.id)
        ? { ...question, reviewStatus, canonicalStatus }
        : question));
      setSelectedEntries(new Map());
      toast.success(
        reviewStatus === "published"
          ? t("publishedToast")
          : reviewStatus === "reviewed"
            ? t("reviewedToast")
            : t("flaggedToast"),
      );
      router.refresh();
    } catch {
      toast.error(t("connectionError"));
    } finally {
      setUpdating(false);
    }
  }

  const goToPage = (page: number) => {
    const target = Math.max(1, Math.min(totalPages, page));
    setCurrentPage(target);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const activeFilterCount = [filterCourse, filterCategory, filterDifficulty]
    .filter((value) => value !== "all").length;

  function resetFilters() {
    navigate({ course: "all", category: "all", difficulty: "all" });
  }


  return (
    <div className="w-full space-y-6">
      <QuestionBankToolbar>
        <SearchBar
          size="sm"
          placeholder={t("search")}
          value={searchTerm}
          onSearch={setSearchTerm}
          containerClassName="min-w-[140px] flex-1"
        />
        <QuestionFilterPopover activeCount={activeFilterCount} onReset={resetFilters}>
          <QuestionFilterField label={t("course")}>
            <Select value={filterCourse} onValueChange={setFilterCourse}>
              <SelectTrigger aria-label={t("filterCourse")} className="h-9 w-full rounded-lg text-body-sm">
                <SelectValue placeholder={t("course")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allCourses")}</SelectItem>
                {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </QuestionFilterField>
          <QuestionFilterField label={t("categoryLabel")}>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger aria-label={t("filterCategory")} className="h-9 w-full rounded-lg text-body-sm">
                <SelectValue placeholder={t("categoryLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allCategories")}</SelectItem>
                {["tutorial", "quiz", "uts", "uas", "tryout", "homework", "exercise", "other"].map((value) => <SelectItem key={value} value={value}>{t(`category.${value}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </QuestionFilterField>
          <QuestionFilterField label={t("difficulty")}>
            <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
              <SelectTrigger aria-label={t("filterDifficulty")} className="h-9 w-full rounded-lg text-body-sm">
                <SelectValue placeholder={t("difficulty")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allDifficulties")}</SelectItem>
                <SelectItem value="easy">{t("easy")}</SelectItem>
                <SelectItem value="medium">{t("medium")}</SelectItem>
                <SelectItem value="hard">{t("hard")}</SelectItem>
              </SelectContent>
            </Select>
          </QuestionFilterField>
        </QuestionFilterPopover>
      </QuestionBankToolbar>

      {selectedEntries.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/80 bg-background/90 px-4 py-3 shadow-sm">
          <span className="text-body-sm font-semibold text-foreground">{selectedEntries.size} {t("selectedCount")}</span>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {selectedForReview.length > 0 ? (
              <Button type="button" size="sm" variant="outline" className="rounded-lg text-body-sm" onClick={() => updateReviewStatus(selectedForReview, "reviewed")} disabled={updating}>
                <CheckCircle2 className="size-4" />{t("action.reviewed")}
              </Button>
            ) : null}
            {selectedForPublish.length > 0 ? (
              <Button type="button" size="sm" variant="outline" className="rounded-lg text-body-sm" onClick={() => updateReviewStatus(selectedForPublish, "published")} disabled={updating}>
                <CheckCircle2 className="size-4" />{t("action.published")}
              </Button>
            ) : null}
            {selectedForFlag.length > 0 ? (
              <Button type="button" size="sm" variant="outline" className="rounded-lg text-body-sm" onClick={() => updateReviewStatus(selectedForFlag, "flagged")} disabled={updating}>
                <Flag className="size-4" />{t("action.flagged")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}


      <div ref={tableRef} className="w-full space-y-6">
      <AdminTable className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-3">
          <span className="text-body-xs font-semibold text-muted-foreground">
            {t("questionCountList", { count: total })}
          </span>

          <div className="flex items-center gap-3 ml-auto flex-wrap">
            <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground">
              <span className="hidden sm:inline">{t("perPage")}</span>
              <Select
                value={draft.pageSize}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                }}
              >
                <SelectTrigger aria-label={t("pageSize")} className="h-8 w-[68px] rounded-md text-body-sm px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-7 p-0 rounded-md"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => goToPage(safeCurrentPage - 1)}
                  aria-label={t("previousPage")}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="text-body-xs font-semibold px-1.5 tabular-nums text-muted-foreground">
                  {safeCurrentPage} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-7 p-0 rounded-md"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => goToPage(safeCurrentPage + 1)}
                  aria-label={t("nextPage")}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {total === 0 ? (
          <AdminEmptyState compact title={t("empty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <AdminTableHead>
                <tr>
                  <th className="w-10 px-4 py-3 text-center text-body-sm font-medium text-muted-foreground">
                    <button type="button" onClick={toggleAll} disabled={updating} aria-label={allReviewableSelected ? t("clearSelection") : t("selectAllReviewable")} className="text-muted-foreground hover:text-foreground">
                      {allReviewableSelected ? <CheckSquare className="size-4 text-brand-primary" /> : <Square className="size-4" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-muted-foreground">{t("question")}</th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-muted-foreground">{t("course")}</th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-muted-foreground">{t("source")}</th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-muted-foreground">{t("statusLabel")}</th>
                  <th className="w-12 px-4 py-3 text-center text-body-sm font-medium text-muted-foreground">{t("detail")}</th>
                </tr>
              </AdminTableHead>
              <tbody>
                {paginatedQuestions.map((question) => {
                  const isExpanded = expandedId === question.id;
                  const reviewAction = reviewActionFor(question);
                  const textExcerpt = question.questionMarkdown.length > 140
                    ? question.questionMarkdown.slice(0, 140) + "..."
                    : question.questionMarkdown;
                  return (
                    <tr key={question.id} className="border-b border-border transition-colors duration-150 hover:bg-muted/50">
                      <td className="px-4 py-3 text-center align-top">
                        {reviewAction ? (
                          <button type="button" onClick={() => toggleSelect(question.id)} aria-label={t("selectQuestion", { question: question.sourceQuestionNumber || question.id })} className="mt-1 text-muted-foreground hover:text-foreground">
                            {selectedEntries.has(question.id) ? <CheckSquare className="size-4 text-brand-primary" /> : <Square className="size-4" />}
                          </button>
                        ) : <span className="text-body-xs text-muted-foreground">-</span>}
                      </td>
                      <td className="max-w-md px-4 py-3 align-top text-body-sm font-medium text-foreground">
                        {isExpanded ? (
                          <div className="rounded border border-border/50 bg-background/40 p-3">
                            <MarkdownRenderer content={question.questionMarkdown} className="space-y-3" />
                          </div>
                        ) : <MathText className="block line-clamp-2" as="div">{textExcerpt}</MathText>}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <DifficultyBadge difficulty={question.difficulty} subtle />
                          <StatusBadge tone={question.quizEligible ? "success" : "muted"} subtle>
                            {question.quizEligible ? t("quizEligible") : t("referenceOnly")}
                          </StatusBadge>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top text-body-sm text-muted-foreground">{courseMap[question.courseId] || t("course")}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-top text-body-sm">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">{question.sourceTitle}</span>
                          <span className="text-body-xs text-muted-foreground">
                            {t.has(`category.${question.sourceCategory}`) ? t(`category.${question.sourceCategory}`) : question.sourceCategory}
                            {question.sourceYear ? " · " + question.sourceYear : ""}
                            {question.sourceQuestionNumber ? " · Soal " + question.sourceQuestionNumber + (question.sourceQuestionPart || "") : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusBadge tone={statusTone[question.reviewStatus]} subtle>{t(`status.${question.reviewStatus}`)}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-center align-top">
                        <button type="button" onClick={() => setExpandedId(isExpanded ? null : question.id)} aria-label={isExpanded ? t("hideDetails") : t("viewDetails")} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                          {isExpanded ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3 text-body-sm">
            <span className="text-body-xs text-muted-foreground">
              Menampilkan {(safeCurrentPage - 1) * pageSize + 1} - {Math.min(safeCurrentPage * pageSize, total)} dari {total} soal
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="size-8 p-0 rounded-lg"
                disabled={safeCurrentPage <= 1}
                onClick={() => goToPage(safeCurrentPage - 1)}
                aria-label={t("previousPage")}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-body-xs font-semibold px-2 tabular-nums">
                {safeCurrentPage} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="size-8 p-0 rounded-lg"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => goToPage(safeCurrentPage + 1)}
                aria-label={t("nextPage")}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </AdminTable>
      </div>

      {paginatedQuestions.map((question) => {
        if (expandedId !== question.id) return null;
        const options = normalizeOptions(question.options);
        const reviewAction = reviewActionFor(question);
        return (
          <section key={"detail-" + question.id} className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div>
                <p className="text-body-sm font-semibold text-foreground">{t("detailTitle")}</p>
                <p className="mt-1 text-body-sm font-semibold text-foreground">{question.sourceTitle}</p>
              </div>
              {reviewAction ? (
                <Button type="button" size="sm" variant="outline" className="rounded-lg text-body-sm" onClick={() => updateReviewStatus([question.id], reviewAction)} disabled={updating}>
                  {reviewAction === "flagged" ? <Flag className="size-4" /> : <CheckCircle2 className="size-4" />}
                  {t(`action.${reviewAction}`)}
                </Button>
              ) : <StatusBadge tone="muted" subtle>{t("noReviewAction")}</StatusBadge>}
            </div>
            {options.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option, index) => (
                  <div key={option.id ?? question.id + "-option-" + index} className={option.isCorrect ? "flex gap-3 border-l-2 border-status-success bg-status-success/5 px-3 py-2 text-body-sm text-status-success" : "flex gap-3 px-3 py-2 text-body-sm text-muted-foreground"}>
                    <span className="shrink-0 font-bold">{String.fromCharCode(65 + index)}.</span>
                    <MarkdownRenderer content={option.text} className="flex-1 space-y-3 leading-relaxed" />
                    {option.isCorrect ? <Check className="size-4 shrink-0" aria-label={t("sourceAnswer")} /> : null}
                  </div>
                ))}
              </div>
            ) : null}
            {question.answerMarkdown ? (
              <div className="border-t border-border pt-3">
                <p className="mb-1.5 text-body-sm font-semibold text-foreground">{t("answerExplanation")}</p>
                <MarkdownRenderer content={question.answerMarkdown} className="space-y-3 text-body-sm leading-relaxed text-foreground" />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-body-xs text-muted-foreground">
              <span>{t("answerLabel")}: {question.answerProvenance ? t(`provenance.${question.answerProvenance}`) : t("notRecorded")}</span>
              <span>{t("solutionLabel")}: {question.solutionProvenance ? t(`provenance.${question.solutionProvenance}`) : t("notRecorded")}</span>
              {question.sourcePage ? <span>{t("pageNumber", { page: question.sourcePage })}</span> : null}
              <span>{t("canonicalStatus")}: {question.canonicalStatus}</span>
            </div>
          </section>
        );
      })}
    </div>
  );
}
