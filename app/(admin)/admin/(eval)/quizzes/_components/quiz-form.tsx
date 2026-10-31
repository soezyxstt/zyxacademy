"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useUrlTab } from "@/hooks/use-url-tab";
import {
  Calendar,
  HelpCircle,
  Save,
  Settings2,
  Sliders,
  BookOpenCheck,
  Timer,
  CheckCircle2,
  CheckSquare,
  Square,
  Send,
  BookOpen,
  Shuffle,
  Lock,
  ChevronRight,
  Loader2,
  NotebookPen,
  Layers,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SearchBar } from "@/components/ui/search-bar";
import { PageHeader } from "@/components/page-header";
import { MathText } from "@/components/course/math-text";
import { DifficultyProportionSlider } from "@/components/admin/difficulty-proportion-slider";
import { formatDatetimeLocal } from "@/lib/date-utils";
import { getQuizTimingMismatch } from "@/lib/asesmen/quiz-timing";
import { cn } from "@/lib/utils";

export interface CourseOption {
  id: string;
  title: string;
}

export interface QuestionBankItem {
  id: string;
  courseId: string;
  prompt: string;
  options: string[] | string;
  difficulty: "easy" | "medium" | "hard";
  questionType: "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
  origin?: "zyx_original" | "itb_example";
  sourceEventName?: string | null;
  tags: string[] | string;
  reviewStatus: string;
}

export interface InitialQuizData {
  id?: string;
  courseId: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  visibility: "free" | "paid";
  status?: "draft" | "published";
  manualStatus?: "open" | "closed" | "scheduled";
  timeLimitSeconds?: number | null;
  maxAttempts?: number | null;
  openAt?: Date | string | null;
  closeAt?: Date | string | null;
  showDiscussion?: boolean;
  selectionRules?: {
    tags?: string[];
    count?: number;
    fixedQuestionIds?: string[];
    difficulty_proportions?: { easy: number; medium: number; hard: number };
    canGoBack?: boolean;
    requireAllAnswered?: boolean;
    explanationRelease?: "immediate" | "after_close" | "never";
    perQuestionTimerEnabled?: boolean;
    perQuestionTimers?: Record<string, number>;
    defaultQuestionTimerSeconds?: number;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    showScoreImmediate?: boolean;
    passingScore?: number | null;
  };
}

export interface QuizFormProps {
  initialData?: InitialQuizData;
  courses: CourseOption[];
  isEdit?: boolean;
  hideCourseSelect?: boolean;
  courseTitle?: string;
  courseSlug?: string;
  backHref?: string;
  backLabel?: string;
  returnUrl?: string;
  pageTitle?: string;
}

/**
 * Quiz authoring and edit form component with specific picker and distribution modes.
 *
 * Handles quiz schedule parameters, passing scores, per-question timers,
 * and paginated retrieval of active course questions for specific picker selection.
 */
export function QuizForm({
  initialData,
  courses,
  isEdit = false,
  hideCourseSelect = false,
  courseTitle,
  courseSlug,
  backHref,
  backLabel,
  returnUrl,
  pageTitle: customPageTitle,
}: QuizFormProps) {
  const router = useRouter();
  const tr = useTranslations("adminEval.quizForm");

  // Tab State synced with URL query param ?tab=pengaturan | ?tab=soal (instant switching)
  const [currentTab, handleTabChange] = useUrlTab("tab", "pengaturan");

  // Basic Form States
  const [courseId, setCourseId] = useState<string>(
    initialData?.courseId || (courses.length > 0 ? courses[0].id : "")
  );
  const [title, setTitle] = useState(initialData?.title || "");
  const [category, setCategory] = useState<InitialQuizData["category"]>(
    initialData?.category || "weekly"
  );
  const [visibility, setVisibility] = useState<InitialQuizData["visibility"]>(
    initialData?.visibility || "free"
  );

  // Schedule States (Terjadwal vs Manual)
  const initialOpenAtStr = initialData?.openAt ? formatDatetimeLocal(initialData.openAt) : "";
  const initialCloseAtStr = initialData?.closeAt ? formatDatetimeLocal(initialData.closeAt) : "";
  const [scheduleType, setScheduleType] = useState<"scheduled" | "manual">(
    initialData?.openAt || initialData?.closeAt || initialData?.manualStatus === "scheduled"
      ? "scheduled"
      : "manual"
  );
  const [openAt, setOpenAt] = useState(initialOpenAtStr);
  const [closeAt, setCloseAt] = useState(initialCloseAtStr);
  const [manualStatus, setManualStatus] = useState<"open" | "closed" | "scheduled">(
    initialData?.manualStatus || (scheduleType === "scheduled" ? "scheduled" : "open")
  );

  // Duration & Timer States
  const [hasGlobalTimeLimit, setHasGlobalTimeLimit] = useState(
    initialData?.timeLimitSeconds ? true : false
  );
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(
    initialData?.timeLimitSeconds ? String(Math.round(initialData.timeLimitSeconds / 60)) : "30"
  );
  const [perQuestionTimerEnabled, setPerQuestionTimerEnabled] = useState(
    initialData?.selectionRules?.perQuestionTimerEnabled || false
  );
  const [defaultQuestionTimerSeconds, setDefaultQuestionTimerSeconds] = useState(
    String(initialData?.selectionRules?.defaultQuestionTimerSeconds || 60)
  );
  const [perQuestionTimers, setPerQuestionTimers] = useState<Record<string, number>>(
    initialData?.selectionRules?.perQuestionTimers || {}
  );

  // Execution & Navigation Rules
  const [canGoBack, setCanGoBack] = useState(
    initialData?.selectionRules?.canGoBack ?? true
  );
  const [requireAllAnswered, setRequireAllAnswered] = useState(
    initialData?.selectionRules?.requireAllAnswered ?? false
  );
  const [maxAttempts, setMaxAttempts] = useState(
    initialData?.maxAttempts ? String(initialData.maxAttempts) : ""
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(
    initialData?.selectionRules?.shuffleQuestions ?? false
  );
  const [shuffleOptions, setShuffleOptions] = useState(
    initialData?.selectionRules?.shuffleOptions ?? false
  );

  // Pembahasan dan nilai Rules
  const [explanationRelease, setExplanationRelease] = useState<"immediate" | "after_close" | "never">(
    initialData?.selectionRules?.explanationRelease ||
      (initialData?.showDiscussion === false ? "never" : "after_close")
  );
  const [showScoreImmediate, setShowScoreImmediate] = useState(
    initialData?.selectionRules?.showScoreImmediate ?? true
  );
  const [passingScore, setPassingScore] = useState(
    initialData?.selectionRules?.passingScore !== undefined && initialData?.selectionRules?.passingScore !== null
      ? String(initialData.selectionRules.passingScore)
      : "70"
  );

  // Question Selection Mode: "specific" vs "distribution"
  const [selectionMode, setSelectionMode] = useState<"specific" | "distribution">(
    initialData?.selectionRules?.fixedQuestionIds && initialData.selectionRules.fixedQuestionIds.length > 0
      ? "specific"
      : "specific"
  );

  // Distribution State (if using auto distribution)
  const [count, setCount] = useState(String(initialData?.selectionRules?.count ?? 10));
  const [tagsStr, setTagsStr] = useState((initialData?.selectionRules?.tags ?? []).join(", "));
  const [easy, setEasy] = useState(String(initialData?.selectionRules?.difficulty_proportions?.easy ?? 3));
  const [medium, setMedium] = useState(String(initialData?.selectionRules?.difficulty_proportions?.medium ?? 5));
  const [hard, setHard] = useState(String(initialData?.selectionRules?.difficulty_proportions?.hard ?? 2));

  // Sync and scale easy, medium, hard when count changes
  const handleCountChange = (newCountStr: string) => {
    setCount(newCountStr);
    const newCountNum = Number(newCountStr);
    if (Number.isFinite(newCountNum) && newCountNum > 0) {
      const currentEasy = Number(easy) || 0;
      const currentMed = Number(medium) || 0;
      const currentHard = Number(hard) || 0;
      const currentSum = currentEasy + currentMed + currentHard;

      if (currentSum > 0) {
        const rEasy = currentEasy / currentSum;
        const rMed = currentMed / currentSum;
        const newEasy = Math.round(newCountNum * rEasy);
        const newMed = Math.round(newCountNum * rMed);
        let newHard = newCountNum - newEasy - newMed;
        let finalE = newEasy;
        let finalM = newMed;
        let finalH = newHard;
        if (finalH < 0) {
          finalH = 0;
          finalM = Math.max(0, newCountNum - finalE);
        }
        if (finalM < 0) {
          finalM = 0;
          finalE = newCountNum;
        }
        setEasy(String(finalE));
        setMedium(String(finalM));
        setHard(String(finalH));
      } else {
        const newEasy = Math.round(newCountNum * 0.33);
        const newMed = Math.round(newCountNum * 0.34);
        const newHard = Math.max(0, newCountNum - newEasy - newMed);
        setEasy(String(newEasy));
        setMedium(String(newMed));
        setHard(String(newHard));
      }
    }
  };

  // Specific Question Picker States
  const [selectedQIds, setSelectedQIds] = useState<string[]>(
    initialData?.selectionRules?.fixedQuestionIds || []
  );
  const [courseQuestions, setCourseQuestions] = useState<QuestionBankItem[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Filters for Specific Question Picker
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [onlySelectedFilter, setOnlySelectedFilter] = useState(false);

  // Fetch Questions for the selected course
  useEffect(() => {
    if (!courseId) return;

    let active = true;
    async function loadQuestions() {
      setLoadingQuestions(true);
      try {
        const allQuestions: QuestionBankItem[] = [];
        let offset = 0;
        const pageSize = 500;
        while (active) {
          const res = await fetch(`/api/admin/questions?courseId=${encodeURIComponent(courseId)}&limit=${pageSize}&offset=${offset}`);
          if (!res.ok) break;
          const data = (await res.json()) as QuestionBankItem[];
          if (!Array.isArray(data) || data.length === 0) break;
          allQuestions.push(...data);
          if (data.length < pageSize) break;
          offset += pageSize;
        }
        if (active) {
          setCourseQuestions(allQuestions);
        }
      } catch (err) {
        console.error("Gagal memuat bank soal kelas:", err);
      } finally {
        if (active) setLoadingQuestions(false);
      }
    }
    loadQuestions();
    return () => {
      active = false;
    };
  }, [courseId]);

  // Extract available tags from loaded questions
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const q of courseQuestions) {
      const qTags = Array.isArray(q.tags)
        ? q.tags
        : typeof q.tags === "string"
        ? (() => {
            try {
              return JSON.parse(q.tags);
            } catch {
              return [];
            }
          })()
        : [];
      qTags.forEach((t: string) => tagSet.add(t));
    }
    return Array.from(tagSet);
  }, [courseQuestions]);

  // Selected Questions Difficulty Breakdown (for Specific Mode)
  const selectedDifficultyCounts = useMemo(() => {
    const counts = { easy: 0, medium: 0, hard: 0 };
    const selectedSet = new Set(selectedQIds);
    for (const q of courseQuestions) {
      if (selectedSet.has(q.id)) {
        if (q.difficulty === "easy") counts.easy++;
        else if (q.difficulty === "hard") counts.hard++;
        else counts.medium++;
      }
    }
    return counts;
  }, [selectedQIds, courseQuestions]);

  // Filtered Questions List
  const filteredQuestions = useMemo(() => {
    return courseQuestions.filter((q) => {
      // Only selected filter
      if (onlySelectedFilter && !selectedQIds.includes(q.id)) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesPrompt = q.prompt.toLowerCase().includes(query);
        const matchesId = q.id.toLowerCase().includes(query);
        const qTags = Array.isArray(q.tags) ? q.tags.join(" ").toLowerCase() : "";
        const matchesTag = qTags.includes(query);
        if (!matchesPrompt && !matchesId && !matchesTag) {
          return false;
        }
      }

      // Difficulty filter
      if (difficultyFilter !== "all" && q.difficulty !== difficultyFilter) {
        return false;
      }

      // Type filter
      if (typeFilter !== "all" && q.questionType !== typeFilter) {
        return false;
      }

      // Origin filter
      if (originFilter !== "all" && q.origin !== originFilter) {
        return false;
      }

      // Tag filter
      if (tagFilter !== "all") {
        const qTags = Array.isArray(q.tags)
          ? q.tags
          : typeof q.tags === "string"
          ? (() => {
              try {
                return JSON.parse(q.tags);
              } catch {
                return [];
              }
            })()
          : [];
        if (!qTags.includes(tagFilter)) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== "all" && q.reviewStatus !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [
    courseQuestions,
    onlySelectedFilter,
    selectedQIds,
    searchQuery,
    difficultyFilter,
    typeFilter,
    originFilter,
    tagFilter,
    statusFilter,
  ]);

  // Toggle Single Question Selection
  const toggleSelectQuestion = (id: string) => {
    setSelectedQIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // Select all visible filtered questions
  const selectAllFiltered = () => {
    const visibleIds = filteredQuestions.map((q) => q.id);
    setSelectedQIds((prev) => {
      const combined = new Set([...prev, ...visibleIds]);
      return Array.from(combined);
    });
  };

  // Deselect all visible filtered questions
  const deselectAllFiltered = () => {
    const visibleIdsSet = new Set(filteredQuestions.map((q) => q.id));
    setSelectedQIds((prev) => prev.filter((id) => !visibleIdsSet.has(id)));
  };

  // Reset all selections
  const clearAllSelections = () => {
    setSelectedQIds([]);
  };

  // Update per-question timer override
  const updateQuestionTimer = (questionId: string, seconds: number) => {
    setPerQuestionTimers((prev) => ({
      ...prev,
      [questionId]: seconds,
    }));
  };

  // Form Submission
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (publishImmediately: boolean = false) => {
    if (!title.trim()) {
      handleTabChange("pengaturan");
      return toast.error(tr("titleRequired"));
    }
    if (!courseId) {
      handleTabChange("pengaturan");
      return toast.error(tr("courseRequired"));
    }

    if (selectionMode === "specific" && selectedQIds.length === 0) {
      handleTabChange("soal");
      return toast.error(tr("selectOneQuestion"));
    }

    if (selectionMode === "distribution") {
      const qCount = Number(count) || 0;
      const easyCount = Number(easy) || 0;
      const medCount = Number(medium) || 0;
      const hardCount = Number(hard) || 0;

      if (qCount < 1) {
        handleTabChange("soal");
        return toast.error(tr("minimumQuestionCount"));
      }
      if (easyCount + medCount + hardCount !== qCount) {
        handleTabChange("soal");
        return toast.error(tr("difficultyTotalMismatch", { easy: easyCount, medium: medCount, hard: hardCount, total: qCount, sum: easyCount + medCount + hardCount }));
      }
    }

    const timingMismatch = getQuizTimingMismatch({
      timeLimitSeconds: hasGlobalTimeLimit && timeLimitMinutes ? Number(timeLimitMinutes) * 60 : null,
      count: selectionMode === "specific" ? selectedQIds.length : Number(count) || 10,
      fixedQuestionIds: selectionMode === "specific" ? selectedQIds : undefined,
      perQuestionTimerEnabled,
      perQuestionTimers,
      defaultQuestionTimerSeconds: Number(defaultQuestionTimerSeconds) || 60,
    });
    if (timingMismatch) {
      handleTabChange("pengaturan");
      return toast.error(tr("timingMismatch"));
    }

    try {
      setSubmitting(true);

      const parsedTags = tagsStr
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const effectiveManualStatus =
        scheduleType === "scheduled" ? manualStatus : manualStatus === "scheduled" ? "open" : manualStatus;

      const payload = {
        courseId,
        title: title.trim(),
        category,
        visibility,
        timeLimitSeconds: hasGlobalTimeLimit && timeLimitMinutes ? Number(timeLimitMinutes) * 60 : null,
        maxAttempts: maxAttempts ? Number(maxAttempts) : null,
        openAt: scheduleType === "scheduled" && openAt ? new Date(openAt).toISOString() : null,
        closeAt: scheduleType === "scheduled" && closeAt ? new Date(closeAt).toISOString() : null,
        manualStatus: effectiveManualStatus,
        showDiscussion: explanationRelease !== "never",
        status: publishImmediately ? ("published" as const) : (initialData?.status || "draft"),
        selectionRules: {
          tags: selectionMode === "specific" ? [] : parsedTags,
          count: selectionMode === "specific" ? selectedQIds.length : Number(count) || 10,
          fixedQuestionIds: selectionMode === "specific" ? selectedQIds : undefined,
          difficulty_proportions:
            selectionMode === "specific"
              ? undefined
              : {
                  easy: Number(easy) || 0,
                  medium: Number(medium) || 0,
                  hard: Number(hard) || 0,
                },
          canGoBack,
          requireAllAnswered,
          explanationRelease,
          perQuestionTimerEnabled,
          perQuestionTimers: perQuestionTimerEnabled ? perQuestionTimers : undefined,
          defaultQuestionTimerSeconds: perQuestionTimerEnabled ? Number(defaultQuestionTimerSeconds) || 60 : undefined,
          shuffleQuestions,
          shuffleOptions,
          showScoreImmediate,
          passingScore: passingScore ? Number(passingScore) : null,
        },
      };

      if (isEdit && initialData?.id) {
        const res = await fetch(`/api/quiz/templates/${initialData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(tr("updateFailed"));
        }

        toast.success(tr("updatedToast"));
      } else {
        const res = await fetch("/api/quiz/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(tr("createFailed"));
        }

        toast.success(
          publishImmediately ? tr("createdPublishedToast") : tr("createdDraftToast")
        );
      }

      const targetDestination = returnUrl || (courseSlug ? `/admin/courses/${courseSlug}?tab=quizzes` : "/admin/quizzes");
      router.push(targetDestination);
      router.refresh();
    } catch {
      toast.error(tr("saveError"));
    } finally {
      setSubmitting(false);
    }
  };

  const currentCourseName = courses.find((c) => c.id === courseId)?.title || courseTitle;
  const computedHeaderTitle = customPageTitle || (isEdit ? (title ? tr("editQuizTitle", { title }) : tr("editQuiz")) : (currentCourseName ? tr("createQuizForCourse", { course: currentCourseName }) : tr("createQuiz")));
  const computedBackHref = backHref || returnUrl || (courseSlug ? `/admin/courses/${courseSlug}?tab=quizzes` : "/admin/quizzes");
  const computedBackLabel = backLabel || (currentCourseName ? tr("backToCourse", { course: currentCourseName }) : tr("backToQuizList"));

  return (
    <div className="space-y-5">
      {/* Universal Page Header with Integrated Actions */}
      <PageHeader
        icon={NotebookPen}
        title={computedHeaderTitle}
        backHref={computedBackHref}
        backLabel={computedBackLabel}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => handleSubmit(false)}
              className="h-8 sm:h-9 rounded-lg border-border font-medium text-body-sm"
            >
              <Save className="mr-1.5 size-3.5" />
              {isEdit ? tr("saveChanges") : tr("saveDraft")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={submitting}
              onClick={() => handleSubmit(true)}
              className="h-8 sm:h-9 rounded-lg bg-brand-primary text-primary-foreground hover:bg-brand-primary/95 font-semibold text-body-sm shadow-2xs"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> {tr("saving")}
                </>
              ) : (
                <>
                  <Send className="mr-1.5 size-3.5" />
                  {isEdit ? tr("saveAndPublish") : tr("publishQuiz")}
                </>
              )}
            </Button>
          </div>
        }
      />

      {/* 2-Tab Navigation */}
      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full space-y-4">
        <TabsList>
          <TabsTrigger value="pengaturan">
            <Settings2 className="size-4" />
            {tr("quizSettings")}
          </TabsTrigger>
          <TabsTrigger value="soal">
            <BookOpen className="size-4" />
            {tr("questionSelection")}
            {selectedQIds.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-body-2xs">
                {selectedQIds.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: PENGATURAN KUIS */}
        <TabsContent value="pengaturan" className="space-y-4 focus-visible:outline-none">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">

            {/* LEFT COLUMN: Main Info & Schedule (7 cols) */}
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card lg:col-span-7">
              {/* General Information Card */}
              <section>
                <div className="px-4 pt-3">
                  <h3 className="font-heading text-body-sm sm:text-body-base font-bold text-foreground flex items-center gap-2">
                    <BookOpen className="size-4 text-brand-primary" />
                    {tr("quizInformation")}
                  </h3>
                </div>
                <div className="p-4 space-y-3.5">
                  {!hideCourseSelect && (
                    <div>
                      <Label htmlFor="courseId" className="text-body-sm font-semibold text-foreground">
                        {tr("course")}
                      </Label>
                      <Select value={courseId} onValueChange={setCourseId} disabled={isEdit}>
                        <SelectTrigger id="courseId" className="mt-1 w-full rounded-lg border-border h-9 text-body-sm">
                          <SelectValue placeholder={tr("selectCourse")} />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="title" className="text-body-sm font-semibold text-foreground">
                      {tr("quizTitle")}
                    </Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={tr("quizTitlePlaceholder")}
                      className="mt-1 rounded-lg border-border font-medium h-9 text-body-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="category" className="text-body-sm font-semibold text-foreground">
                        {tr("category")}
                      </Label>
                      <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                        <SelectTrigger id="category" className="mt-1 rounded-lg border-border h-9 text-body-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">{tr("categoryDaily")}</SelectItem>
                          <SelectItem value="weekly">{tr("categoryWeekly")}</SelectItem>
                          <SelectItem value="chapter">{tr("categoryChapter")}</SelectItem>
                          <SelectItem value="simulation">{tr("categorySimulation")}</SelectItem>
                          <SelectItem value="premium">{tr("categoryPremium")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="visibility" className="text-body-sm font-semibold text-foreground">
                        {tr("studentAccess")}
                      </Label>
                      <Select value={visibility} onValueChange={(v: any) => setVisibility(v)}>
                        <SelectTrigger id="visibility" className="mt-1 rounded-lg border-border h-9 text-body-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">{tr("freeAccess")}</SelectItem>
                          <SelectItem value="paid">{tr("paidAccess")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </section>

              {/* Schedule Settings Card */}
              <section>
                <div className="px-4 pt-3">
                  <h3 className="font-heading text-body-sm sm:text-body-base font-bold text-foreground flex items-center gap-2">
                    <Calendar className="size-4 text-brand-primary" />
                    {tr("quizAccessSchedule")}
                  </h3>
                </div>
                <div className="p-4 space-y-3.5">
                  {/* Schedule Mode Selector */}
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleType("scheduled");
                        if (manualStatus !== "open" && manualStatus !== "closed") {
                          setManualStatus("scheduled");
                        }
                      }}
                      className={cn(
                        "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all cursor-pointer",
                        scheduleType === "scheduled"
                          ? "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/30"
                          : "border-border bg-card hover:bg-muted/40"
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border mt-0.5",
                          scheduleType === "scheduled"
                            ? "border-brand-primary bg-brand-primary text-primary-foreground"
                            : "border-muted-foreground"
                        )}
                      >
                        {scheduleType === "scheduled" && <div className="size-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="text-body-sm font-bold text-foreground">{tr("scheduled")}</div>
                        <div className="text-body-xs text-muted-foreground mt-0.5">
                          {tr("scheduledDescription")}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setScheduleType("manual");
                        setOpenAt("");
                        setCloseAt("");
                        if (manualStatus === "scheduled") setManualStatus("open");
                      }}
                      className={cn(
                        "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all cursor-pointer",
                        scheduleType === "manual"
                          ? "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/30"
                          : "border-border bg-card hover:bg-muted/40"
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border mt-0.5",
                          scheduleType === "manual"
                            ? "border-brand-primary bg-brand-primary text-primary-foreground"
                            : "border-muted-foreground"
                        )}
                      >
                        {scheduleType === "manual" && <div className="size-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="text-body-sm font-bold text-foreground">{tr("manual")}</div>
                        <div className="text-body-xs text-muted-foreground mt-0.5">
                          {tr("manualDescription")}
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Scheduled Fields */}
                  {scheduleType === "scheduled" && (
                    <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="openAt" className="text-body-sm font-semibold text-foreground">
                            {tr("openTime")}
                          </Label>
                          <Input
                            id="openAt"
                            type="datetime-local"
                            value={openAt}
                            onChange={(e) => setOpenAt(e.target.value)}
                            className="mt-1 rounded-lg border-border h-8 text-body-sm"
                          />
                        </div>

                        <div>
                          <Label htmlFor="closeAt" className="text-body-sm font-semibold text-foreground">
                            {tr("closeTime")}
                          </Label>
                          <Input
                            id="closeAt"
                            type="datetime-local"
                            value={closeAt}
                            onChange={(e) => setCloseAt(e.target.value)}
                            className="mt-1 rounded-lg border-border h-8 text-body-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="manualStatusScheduled" className="text-body-sm font-semibold text-foreground">
                          {tr("manualStatusOverride")}
                        </Label>
                        <Select
                          value={manualStatus}
                          onValueChange={(v: "open" | "closed" | "scheduled") => setManualStatus(v)}
                        >
                          <SelectTrigger id="manualStatusScheduled" className="mt-1 rounded-lg border-border h-8 text-body-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="scheduled">{tr("followSchedule")}</SelectItem>
                            <SelectItem value="open">{tr("forceOpenNow")}</SelectItem>
                            <SelectItem value="closed">{tr("forceCloseNow")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Manual Mode Fields */}
                  {scheduleType === "manual" && (
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-2">
                      <Label className="text-body-sm font-semibold text-foreground">{tr("quizAvailability")}</Label>
                      <div className="grid grid-cols-2 gap-2.5">
                        <Button
                          type="button"
                          variant={manualStatus === "open" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setManualStatus("open")}
                          className={cn(
                            "rounded-lg font-semibold h-8 text-body-sm",
                            manualStatus === "open" ? "bg-status-success text-white hover:bg-status-success/90" : "border-border"
                          )}
                        >
                          <CheckCircle2 className="mr-1.5 size-3.5" /> {tr("quizOpen")}
                        </Button>
                        <Button
                          type="button"
                          variant={manualStatus === "closed" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setManualStatus("closed")}
                          className={cn(
                            "rounded-lg font-semibold h-8 text-body-sm",
                            manualStatus === "closed" ? "bg-muted-foreground text-white hover:bg-muted-foreground/90" : "border-border"
                          )}
                        >
                          <Lock className="mr-1.5 size-3.5" /> {tr("quizClosed")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Pembahasan dan nilai Card */}
              <section>
                <div className="px-4 pt-3">
                  <h3 className="font-heading text-body-sm sm:text-body-base font-bold text-foreground flex items-center gap-2">
                    <BookOpenCheck className="size-4 text-brand-primary" />
                    Pembahasan & Penilaian
                  </h3>
                </div>
                <div className="p-4 space-y-3.5">
                  <div>
                    <Label htmlFor="explanationRelease" className="text-body-sm font-semibold text-foreground">
                      Waktu Rilis Pembahasan Kuis
                    </Label>
                    <Select
                      value={explanationRelease}
                      onValueChange={(v: "immediate" | "after_close" | "never") => setExplanationRelease(v)}
                    >
                      <SelectTrigger id="explanationRelease" className="mt-1 rounded-lg border-border h-9 text-body-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="after_close">
                          Setelah Kuis Ditutup (Jadwal selesai / ditutup manual)
                        </SelectItem>
                        <SelectItem value="immediate">
                          Langsung Setelah Murid Mengumpulkan Kuis
                        </SelectItem>
                        <SelectItem value="never">
                          Jangan Tampilkan Pembahasan (Hanya nilai)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
                    <div className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="space-y-0.5 pr-2">
                        <Label htmlFor="showScoreImmediate" className="text-body-sm font-semibold text-foreground cursor-pointer">
                          Tampilkan Skor Instan
                        </Label>
                        <p className="text-body-xs text-muted-foreground">
                          Siswa langsung melihat nilai total setelah submit
                        </p>
                      </div>
                      <Switch
                        id="showScoreImmediate"
                        checked={showScoreImmediate}
                        onCheckedChange={setShowScoreImmediate}
                      />
                    </div>

                    <div className="rounded-lg border border-border p-3 space-y-1">
                      <Label htmlFor="passingScore" className="text-body-sm font-semibold text-foreground">
                        Passing Grade (%)
                      </Label>
                      <Input
                        id="passingScore"
                        type="number"
                        min={0}
                        max={100}
                        value={passingScore}
                        onChange={(e) => setPassingScore(e.target.value)}
                        placeholder="70"
                        className="h-8 rounded-md border-border text-body-sm"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: Timers, Navigation & Rules (5 cols) */}
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card lg:col-span-5">

              {/* Duration & Timer Card */}
              <section>
                <div className="px-4 pt-3">
                  <h3 className="font-heading text-body-sm sm:text-body-base font-bold text-foreground flex items-center gap-2">
                    <Timer className="size-4 text-brand-primary" />
                    Durasi & Timer
                  </h3>
                </div>
                <div className="p-4 space-y-3.5">
                  {/* Global Duration */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="hasGlobalTimeLimit" className="text-body-sm font-semibold text-foreground cursor-pointer">
                        Batas Waktu Keseluruhan
                      </Label>
                      <Switch
                        id="hasGlobalTimeLimit"
                        checked={hasGlobalTimeLimit}
                        onCheckedChange={setHasGlobalTimeLimit}
                      />
                    </div>
                    {hasGlobalTimeLimit ? (
                      <div className="flex items-center gap-2 pt-0.5">
                        <Input
                          type="number"
                          min={1}
                          max={360}
                          value={timeLimitMinutes}
                          onChange={(e) => setTimeLimitMinutes(e.target.value)}
                          className="w-24 rounded-lg border-border h-8 text-body-sm"
                        />
                        <span className="text-body-xs text-muted-foreground font-medium">{tr("totalMinutes")}</span>
                      </div>
                    ) : (
                      <p className="text-body-xs text-muted-foreground">{tr("noOverallTimeLimit")}</p>
                    )}
                  </div>

                  <div className="border-t border-border/60 pt-3 space-y-3">
                    {/* Per-Question Timer */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="perQuestionTimerEnabled" className="text-body-sm font-semibold text-foreground cursor-pointer">
                          Timer Per Butir Soal
                        </Label>
                        <p className="text-body-xs text-muted-foreground">
                          Setiap soal memiliki timer mundur tersendiri
                        </p>
                      </div>
                      <Switch
                        id="perQuestionTimerEnabled"
                        checked={perQuestionTimerEnabled}
                        onCheckedChange={setPerQuestionTimerEnabled}
                      />
                    </div>

                    {perQuestionTimerEnabled && (
                      <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-1.5">
                        <Label htmlFor="defaultTimer" className="text-body-sm font-semibold text-foreground">
                          {tr("defaultQuestionDuration")}
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="defaultTimer"
                            type="number"
                            min={5}
                            max={600}
                            value={defaultQuestionTimerSeconds}
                            onChange={(e) => setDefaultQuestionTimerSeconds(e.target.value)}
                            className="w-24 rounded-lg border-border h-8 text-body-sm"
                          />
                          <span className="text-body-xs text-muted-foreground font-medium">{tr("seconds")}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Navigation & Submission Rules Card */}
              <section>
                <div className="px-4 pt-3">
                  <h3 className="font-heading text-body-sm sm:text-body-base font-bold text-foreground flex items-center gap-2">
                    <Sliders className="size-4 text-brand-primary" />
                    {tr("attemptAndNavigationRules")}
                  </h3>
                </div>
                <div className="p-4 space-y-3.5">
                  {/* Can Go Back */}
                  <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2.5">
                    <div className="space-y-0.5">
                      <Label htmlFor="canGoBack" className="text-body-sm font-semibold text-foreground cursor-pointer">
                        {tr("backNavigation")}
                      </Label>
                      <p className="text-body-xs text-muted-foreground">
                        {canGoBack
                          ? tr("canNavigateBack")
                          : tr("linearNavigation")}
                      </p>
                    </div>
                    <Switch
                      id="canGoBack"
                      checked={canGoBack}
                      onCheckedChange={setCanGoBack}
                    />
                  </div>

                  {/* Require All Answered */}
                  <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2.5">
                    <div className="space-y-0.5">
                      <Label htmlFor="requireAllAnswered" className="text-body-sm font-semibold text-foreground cursor-pointer">
                        {tr("requireAllQuestions")}
                      </Label>
                      <p className="text-body-xs text-muted-foreground">
                        {requireAllAnswered
                          ? tr("allAnswersRequired")
                          : tr("answersOptional")}
                      </p>
                    </div>
                    <Switch
                      id="requireAllAnswered"
                      checked={requireAllAnswered}
                      onCheckedChange={setRequireAllAnswered}
                    />
                  </div>

                  {/* Max Attempts */}
                  <div className="space-y-1 border-b border-border/60 pb-2.5">
                    <Label htmlFor="maxAttempts" className="text-body-sm font-semibold text-foreground">
                      {tr("maxAttemptsLabel")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="maxAttempts"
                        type="number"
                        min={1}
                        max={100}
                        value={maxAttempts}
                        onChange={(e) => setMaxAttempts(e.target.value)}
                        placeholder={tr("unlimited")}
                        className="w-32 rounded-lg border-border h-8 text-body-sm"
                      />
                      <span className="text-body-xs text-muted-foreground">
                        {maxAttempts ? tr("attempts") : tr("unlimited")}
                      </span>
                    </div>
                  </div>

                  {/* Shuffle Questions & Options */}
                  <div className="space-y-2.5 pt-0.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="shuffleQuestions" className="text-body-sm font-semibold text-foreground flex items-center gap-1.5 cursor-pointer">
                        <Shuffle className="size-3.5 text-muted-foreground" />
                        {tr("shuffleQuestions")}
                      </Label>
                      <Switch
                        id="shuffleQuestions"
                        checked={shuffleQuestions}
                        onCheckedChange={setShuffleQuestions}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="shuffleOptions" className="text-body-sm font-semibold text-foreground flex items-center gap-1.5 cursor-pointer">
                        <Shuffle className="size-3.5 text-muted-foreground" />
                        {tr("shuffleOptions")}
                      </Label>
                      <Switch
                        id="shuffleOptions"
                        checked={shuffleOptions}
                        onCheckedChange={setShuffleOptions}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Quick Navigation to Tab 2 */}
              <div className="bg-muted/30 p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-body-sm font-bold text-brand-primary">{tr("continueToQuestionSelection")}</div>
                  <div className="text-body-xs text-muted-foreground">
                    {selectedQIds.length > 0
                      ? tr("questionsSelected", { count: selectedQIds.length })
                      : tr("chooseQuestionsFromBank")}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleTabChange("soal")}
                  className="rounded-lg bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 font-semibold h-8 text-body-sm"
                >
                  Pilih soal <ChevronRight className="ml-1 size-3.5" />
                </Button>
              </div>
            </div>

          </div>
        </TabsContent>

        {/* TAB 2: PILIHAN SOAL */}
        <TabsContent value="soal" className="space-y-4 focus-visible:outline-none">

          {/* Mode Selector & Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-body-xs font-semibold text-muted-foreground">{tr("questionSelectionMethod")}</span>
              <div className="flex rounded-lg border border-border p-0.5 bg-muted/40">
                <button
                  type="button"
                  onClick={() => setSelectionMode("specific")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-body-xs font-semibold transition-all cursor-pointer",
                    selectionMode === "specific"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tr("specificQuestions")}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectionMode("distribution")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-body-xs font-semibold transition-all cursor-pointer",
                    selectionMode === "distribution"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tr("selectByDifficulty")}
                </button>
              </div>
            </div>

            {selectionMode === "specific" && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="rounded-md border-brand-primary/30 bg-brand-primary/10 text-brand-primary font-bold px-2 py-0.5 text-body-xs">
                  {tr("selectedQuestionCount", { count: selectedQIds.length })}
                </Badge>
                {selectedQIds.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearAllSelections}
                    className="h-7 text-body-sm text-status-error hover:bg-status-error/10 hover:text-status-error"
                  >
                    {tr("clearSelection")}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* DISTRIBUTION MODE */}
          {selectionMode === "distribution" && (
            <Card className="rounded-xl border border-border bg-card shadow-2xs">
              <div className="border-b border-border/80 px-4 py-3">
                <h3 className="font-heading text-body-base font-bold text-foreground">
                  Konfigurasi Distribusi Soal Otomatis
                </h3>
              </div>
              <CardContent className="p-4 space-y-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="count" className="text-body-sm font-semibold text-foreground">
                      Jumlah Soal yang Ditarik
                    </Label>
                    <Input
                      id="count"
                      type="number"
                      min={1}
                      max={100}
                      value={count}
                      onChange={(e) => handleCountChange(e.target.value)}
                      className="mt-1 rounded-lg border-border h-9"
                    />
                  </div>

                  <div>
                    <Label htmlFor="tagsStr" className="text-body-sm font-semibold text-foreground">
                      Filter Tag Bab (Opsional, pisahkan koma)
                    </Label>
                    <Input
                      id="tagsStr"
                      value={tagsStr}
                      onChange={(e) => setTagsStr(e.target.value)}
                      placeholder={tr("topicTagsPlaceholder")}
                      className="mt-1 rounded-lg border-border h-9"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-3">
                  <Label className="text-body-sm font-semibold text-foreground">
                    Proporsi Tingkat Kesulitan Soal
                  </Label>
                  <DifficultyProportionSlider
                    totalCount={Number(count) || 10}
                    easy={Number(easy) || 0}
                    medium={Number(medium) || 0}
                    hard={Number(hard) || 0}
                    onChange={(p) => {
                      setEasy(String(p.easy));
                      setMedium(String(p.medium));
                      setHard(String(p.hard));
                    }}
                    onTotalCountChange={(newTotal) => {
                      setCount(String(newTotal));
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* SPECIFIC QUESTION PICKER MODE */}
          {selectionMode === "specific" && (
            <div className="space-y-3">
              {/* Live Selected Questions Difficulty Breakdown */}
              {selectedQIds.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-3 shadow-2xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1.5 text-foreground font-bold">
                      <Layers className="size-3.5 text-brand-primary" />
                      Komposisi Kesulitan Soal Terpilih ({selectedQIds.length} Soal)
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-status-success font-medium flex items-center gap-1">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        Mudah: {selectedDifficultyCounts.easy} ({Math.round((selectedDifficultyCounts.easy / selectedQIds.length) * 100)}%)
                      </span>
                      <span className="text-status-warning font-medium flex items-center gap-1">
                        <span className="size-2 rounded-full bg-amber-500" />
                        Sedang: {selectedDifficultyCounts.medium} ({Math.round((selectedDifficultyCounts.medium / selectedQIds.length) * 100)}%)
                      </span>
                      <span className="text-status-error font-medium flex items-center gap-1">
                        <span className="size-2 rounded-full bg-rose-500" />
                        Sulit: {selectedDifficultyCounts.hard} ({Math.round((selectedDifficultyCounts.hard / selectedQIds.length) * 100)}%)
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-md bg-muted overflow-hidden flex">
                    <div style={{ width: `${(selectedDifficultyCounts.easy / selectedQIds.length) * 100}%` }} className="h-full bg-emerald-500 transition-all" />
                    <div style={{ width: `${(selectedDifficultyCounts.medium / selectedQIds.length) * 100}%` }} className="h-full bg-amber-500 transition-all" />
                    <div style={{ width: `${(selectedDifficultyCounts.hard / selectedQIds.length) * 100}%` }} className="h-full bg-rose-500 transition-all" />
                  </div>
                </div>
              )}

              {/* Space-Efficient Inline Search & Filter Toolbar */}
              <div className="rounded-xl border border-border bg-card p-3 shadow-2xs space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Reusable Search Bar Component */}
                  <div className="min-w-[140px] flex-1">
                    <SearchBar
                      size="sm"
                      variant="bordered"
                      value={searchQuery}
                      onSearch={setSearchQuery}
                      onClear={() => setSearchQuery("")}
                      placeholder={tr("questionSearch")}
                    />
                  </div>

                  {/* Filter Only Selected */}
                  <Button
                    type="button"
                    variant={onlySelectedFilter ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOnlySelectedFilter(!onlySelectedFilter)}
                    className={cn(
                      "h-9 rounded-lg font-semibold shrink-0 text-body-sm gap-1.5",
                      onlySelectedFilter ? "bg-brand-primary text-primary-foreground" : "border-border"
                    )}
                  >
                    <CheckSquare className="size-3.5" />
                    Hanya Terpilih ({selectedQIds.length})
                  </Button>

                  {/* Difficulty Select */}
                  <div className="shrink-0">
                    <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                      <SelectTrigger className="h-9 w-[130px] rounded-lg border-border text-body-sm">
                        <SelectValue placeholder={tr("allDifficulties")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{tr("allDifficulties")}</SelectItem>
                        <SelectItem value="easy">{tr("easy")}</SelectItem>
                        <SelectItem value="medium">{tr("medium")}</SelectItem>
                        <SelectItem value="hard">{tr("hard")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Type Select */}
                  <div className="shrink-0">
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="h-9 w-[140px] rounded-lg border-border text-body-sm">
                        <SelectValue placeholder={tr("allTypes")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{tr("allTypes")}</SelectItem>
                        <SelectItem value="multiple_choice">{tr("multipleChoice")}</SelectItem>
                        <SelectItem value="multiple_choices">{tr("multipleChoices")}</SelectItem>
                        <SelectItem value="short_answer">{tr("shortAnswer")}</SelectItem>
                        <SelectItem value="essay">{tr("essay")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Origin Select */}
                  <div className="shrink-0">
                    <Select value={originFilter} onValueChange={setOriginFilter}>
                      <SelectTrigger className="h-9 w-[130px] rounded-lg border-border text-body-sm">
                        <SelectValue placeholder={tr("allSources")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{tr("allSources")}</SelectItem>
                        <SelectItem value="zyx_original">{tr("zyxOriginal")}</SelectItem>
                        <SelectItem value="itb_example">{tr("itbExample")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tag Select */}
                  <div className="shrink-0">
                    <Select value={tagFilter} onValueChange={setTagFilter}>
                      <SelectTrigger className="h-9 w-[130px] rounded-lg border-border text-body-sm">
                        <SelectValue placeholder={tr("allTopics")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{tr("allTopics")}</SelectItem>
                        {availableTags.map((tag) => (
                          <SelectItem key={tag} value={tag}>
                            {tag}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status Select */}
                  <div className="shrink-0">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9 w-[130px] rounded-lg border-border text-body-sm">
                        <SelectValue placeholder={tr("allStatuses")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{tr("allStatuses")}</SelectItem>
                        <SelectItem value="published">{tr("published")}</SelectItem>
                        <SelectItem value="generated">{tr("draft")}</SelectItem>
                        <SelectItem value="flagged">{tr("flagged")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Bulk Selection Sub-bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-body-xs text-muted-foreground">
                  <span>
                    Menampilkan <strong>{filteredQuestions.length}</strong> dari{" "}
                    <strong>{courseQuestions.length}</strong> butir soal kelas
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={selectAllFiltered}
                      disabled={filteredQuestions.length === 0}
                      className="h-8 text-body-sm font-semibold text-brand-primary hover:bg-brand-primary/10 px-2"
                    >
                      Pilih Semua Hasil Filter
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={deselectAllFiltered}
                      disabled={filteredQuestions.length === 0}
                      className="h-8 text-body-sm font-semibold text-muted-foreground hover:bg-muted px-2"
                    >
                      Batal Pilih Hasil Filter
                    </Button>
                  </div>
                </div>
              </div>

              {/* Questions List */}
              {loadingQuestions ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center">
                  <Loader2 className="mx-auto size-5 animate-spin text-brand-primary" />
                  <p className="mt-2 text-body-xs text-muted-foreground">{tr("loadingQuestionBank")}</p>
                </div>
              ) : filteredQuestions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <HelpCircle className="mx-auto size-7 text-muted-foreground mb-1.5" />
                  <h4 className="font-heading text-body-sm font-bold text-foreground">{tr("noMatchingQuestions")}</h4>
                  <p className="text-body-xs text-muted-foreground mt-0.5 max-w-md mx-auto">
                    Coba sesuaikan kata kunci pencarian atau bersihkan filter tingkat kesulitan dan topik.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredQuestions.map((q) => {
                    const isSelected = selectedQIds.includes(q.id);
                    const qDuration = perQuestionTimers[q.id] ?? (Number(defaultQuestionTimerSeconds) || 60);

                    // Parse options
                    const optionsList: string[] = Array.isArray(q.options)
                      ? q.options
                      : typeof q.options === "string"
                      ? (() => {
                          try {
                            return JSON.parse(q.options);
                          } catch {
                            return [];
                          }
                        })()
                      : [];

                    // Parse tags
                    const qTags: string[] = Array.isArray(q.tags)
                      ? q.tags
                      : typeof q.tags === "string"
                      ? (() => {
                          try {
                            return JSON.parse(q.tags);
                          } catch {
                            return [];
                          }
                        })()
                      : [];

                    return (
                      <div
                        key={q.id}
                        onClick={() => toggleSelectQuestion(q.id)}
                        className={cn(
                          "relative rounded-xl border p-3 sm:p-3.5 transition-all cursor-pointer select-none",
                          isSelected
                            ? "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/30"
                            : "border-border bg-card hover:border-brand-primary/40 hover:bg-muted/30"
                        )}
                      >
                        <div className="flex items-start gap-2.5 sm:gap-3">
                          {/* Checkbox Icon */}
                          <div className="mt-0.5 shrink-0">
                            {isSelected ? (
                              <CheckSquare className="size-4.5 text-brand-primary fill-brand-primary/10" />
                            ) : (
                              <Square className="size-4.5 text-muted-foreground" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 space-y-1.5">
                            {/* Badges row */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-md text-[10px] font-bold uppercase px-1.5 py-0.5",
                                  q.difficulty === "easy" && "border-status-success/30 bg-status-success/10 text-status-success",
                                  q.difficulty === "medium" && "border-status-warning/30 bg-status-warning/10 text-status-warning",
                                  q.difficulty === "hard" && "border-status-error/30 bg-status-error/10 text-status-error"
                                )}
                              >
                                {tr(q.difficulty)}
                              </Badge>

                              <Badge variant="outline" className="rounded-md text-[10px] border-border text-muted-foreground px-1.5 py-0.5">
                                {q.questionType === "multiple_choice"
                                  ? tr("multipleChoice")
                                  : q.questionType === "multiple_choices"
                                  ? tr("multipleChoices")
                                  : q.questionType === "short_answer"
                                  ? tr("shortAnswer")
                                  : tr("essay")}
                              </Badge>

                              {q.origin === "itb_example" && (
                                <Badge variant="outline" className="rounded-md text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5">
                                  {tr("itbExample")}
                                </Badge>
                              )}

                              {q.reviewStatus && q.reviewStatus !== "published" && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "rounded-md text-[10px] uppercase px-1.5 py-0.5",
                                    q.reviewStatus === "flagged"
                                      ? "border-status-error/30 bg-status-error/10 text-status-error"
                                      : "border-muted-foreground/30 bg-muted text-muted-foreground"
                                  )}
                                >
                                  {q.reviewStatus === "flagged" ? tr("flagged") : tr("draft")}
                                </Badge>
                              )}

                              {qTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>

                            {/* Prompt text */}
                            <div className="text-body-sm font-medium leading-relaxed text-foreground">
                              <MathText>{q.prompt}</MathText>
                            </div>

                            {/* Options count preview */}
                            {optionsList.length > 0 && (
                              <div className="text-body-xs text-muted-foreground">
                                {optionsList.length} Pilihan Jawaban
                              </div>
                            )}

                            {/* Per Question Timer Field (if timer per question is enabled) */}
                            {perQuestionTimerEnabled && isSelected && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background p-2 w-fit"
                              >
                                <Timer className="size-3.5 text-brand-primary" />
                                <span className="text-body-xs font-semibold text-foreground">{tr("questionTimer")}</span>
                                <Input
                                  type="number"
                                  min={5}
                                  max={600}
                                  value={qDuration}
                                  onChange={(e) => updateQuestionTimer(q.id, Number(e.target.value))}
                                  className="h-7 w-16 rounded-md border-border text-body-sm"
                                />
                                <span className="text-body-xs text-muted-foreground">{tr("seconds")}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
