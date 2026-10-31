"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Save,
  Settings2,
  BookOpen,
  Loader2,
  NotebookPen,
  UserCheck,
  Shield,
  Send,
  Layers,
  HelpCircle,
  Tag,
  Filter,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { SearchBar } from "@/components/ui/search-bar";
import { PageHeader } from "@/components/page-header";
import { MathText } from "@/components/course/math-text";
import { DifficultyProportionSlider } from "@/components/admin/difficulty-proportion-slider";
import { formatDatetimeLocal } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { saveQuizTemplateAction } from "@/app/actions/tutor-management";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

const QUESTION_PAGE_SIZE = 20;

export interface QuestionBankItem {
  id: string;
  courseId: string;
  prompt: string;
  options: string[] | string;
  correctIndices?: number[] | string;
  acceptableAnswers?: string[] | string;
  difficulty: "easy" | "medium" | "hard";
  questionType: "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
  explanation?: string;
  tags: string[] | string;
  reviewStatus?: string;
}

export interface InitialQuizData {
  id?: string;
  courseId: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium";
  visibility: "free" | "paid";
  status?: "draft" | "published";
  manualStatus?: "open" | "closed" | "scheduled";
  timeLimitSeconds?: number | null;
  maxAttempts?: number | null;
  openAt?: Date | string | null;
  closeAt?: Date | string | null;
  showDiscussion?: boolean;
  creatorId?: string | null;
  creatorName?: string | null;
  creatorEmail?: string | null;
  creatorRole?: string | null;
  createdAt?: Date | string;
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

export interface TutorQuizFormProps {
  courseId: string;
  courseTitle: string;
  initialData?: InitialQuizData;
  questionBank: QuestionBankItem[];
  isEdit?: boolean;
}

export function TutorQuizForm({
  courseId,
  courseTitle,
  initialData,
  questionBank,
  isEdit = false,
}: TutorQuizFormProps) {
  const t = useTranslations("tutor.quizForm");
  const { locale } = useAppLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [questionPage, setQuestionPage] = useState(0);

  const [currentTab, setCurrentTab] = useUrlTab("tab", "pengaturan");

  // Basic Form States
  const [title, setTitle] = useState(initialData?.title || "");
  const [category, setCategory] = useState<"daily" | "weekly" | "chapter" | "premium">(
    initialData?.category || "weekly"
  );
  const [visibility, setVisibility] = useState<"free" | "paid">(
    initialData?.visibility || "free"
  );

  // Schedule States
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

  // Discussion & Scoring Rules
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

  // Question Selection Mode
  const initialFixedIds = initialData?.selectionRules?.fixedQuestionIds || [];
  const [selectionMode, setSelectionMode] = useState<"specific" | "distribution">(
    initialFixedIds.length > 0 ? "specific" : "specific"
  );

  // Distribution State
  const [count, setCount] = useState(String(initialData?.selectionRules?.count ?? 10));
  const [tagsStr, setTagsStr] = useState((initialData?.selectionRules?.tags ?? []).join(", "));
  const [easy, setEasy] = useState(String(initialData?.selectionRules?.difficulty_proportions?.easy ?? 3));
  const [medium, setMedium] = useState(String(initialData?.selectionRules?.difficulty_proportions?.medium ?? 5));
  const [hard, setHard] = useState(String(initialData?.selectionRules?.difficulty_proportions?.hard ?? 2));

  // Specific Question Picker States
  const [selectedQIds, setSelectedQIds] = useState<string[]>(initialFixedIds);
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [onlySelectedFilter, setOnlySelectedFilter] = useState(false);

  // Available tags from question bank
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const q of questionBank) {
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
  }, [questionBank]);

  // Selected Questions Breakdown
  const selectedDifficultyCounts = useMemo(() => {
    const counts = { easy: 0, medium: 0, hard: 0 };
    const selectedSet = new Set(selectedQIds);
    for (const q of questionBank) {
      if (selectedSet.has(q.id)) {
        if (q.difficulty === "easy") counts.easy++;
        else if (q.difficulty === "hard") counts.hard++;
        else counts.medium++;
      }
    }
    return counts;
  }, [selectedQIds, questionBank]);

  // Filtered Questions List
  const filteredQuestions = useMemo(() => {
    return questionBank.filter((q) => {
      if (onlySelectedFilter && !selectedQIds.includes(q.id)) {
        return false;
      }
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
      if (difficultyFilter !== "all" && q.difficulty !== difficultyFilter) {
        return false;
      }
      if (typeFilter !== "all" && q.questionType !== typeFilter) {
        return false;
      }
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
      return true;
    });
  }, [questionBank, onlySelectedFilter, selectedQIds, searchQuery, difficultyFilter, typeFilter, tagFilter]);

  const questionPageCount = Math.max(1, Math.ceil(filteredQuestions.length / QUESTION_PAGE_SIZE));
  const currentQuestionPage = Math.min(questionPage, questionPageCount - 1);
  const pageQuestions = filteredQuestions.slice(currentQuestionPage * QUESTION_PAGE_SIZE, (currentQuestionPage + 1) * QUESTION_PAGE_SIZE);

  const toggleSelectQuestion = (id: string) => {
    setSelectedQIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    const visibleIds = filteredQuestions.map((q) => q.id);
    setSelectedQIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const deselectAllFiltered = () => {
    const visibleIdsSet = new Set(filteredQuestions.map((q) => q.id));
    setSelectedQIds((prev) => prev.filter((id) => !visibleIdsSet.has(id)));
  };

  const handleSubmit = (publishImmediately: boolean = false) => {
    if (!title.trim()) {
      setCurrentTab("pengaturan");
      toast.error(t("titleRequired"));
      return;
    }

    if (selectionMode === "specific" && selectedQIds.length === 0) {
      setCurrentTab("soal");
      toast.error(t("selectQuestion"));
      return;
    }

    if (selectionMode === "distribution") {
      const qCount = Number(count) || 0;
      const easyCount = Number(easy) || 0;
      const medCount = Number(medium) || 0;
      const hardCount = Number(hard) || 0;

      if (qCount < 1) {
        setCurrentTab("soal");
        toast.error(t("minimumQuestionCount"));
        return;
      }
      if (easyCount + medCount + hardCount !== qCount) {
        setCurrentTab("soal");
        toast.error(
          t("difficultyMismatch", {
            easy: easyCount,
            medium: medCount,
            hard: hardCount,
            sum: easyCount + medCount + hardCount,
            count: qCount,
          })
        );
        return;
      }
    }

    const parsedTags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const effectiveManualStatus =
      scheduleType === "scheduled" ? manualStatus : manualStatus === "scheduled" ? "open" : manualStatus;

    const payload = {
      title: title.trim(),
      category,
      visibility,
      timeLimitSeconds: hasGlobalTimeLimit && timeLimitMinutes ? Number(timeLimitMinutes) * 60 : null,
      maxAttempts: maxAttempts ? Number(maxAttempts) : null,
      openAt: scheduleType === "scheduled" && openAt ? openAt : null,
      closeAt: scheduleType === "scheduled" && closeAt ? closeAt : null,
      manualStatus: effectiveManualStatus,
      status: publishImmediately ? ("published" as const) : (initialData?.status || "draft"),
      showDiscussion: explanationRelease !== "never",
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
        shuffleQuestions,
        shuffleOptions,
        showScoreImmediate,
        passingScore: passingScore ? Number(passingScore) : null,
      },
    };

    startTransition(async () => {
      try {
        const res = await saveQuizTemplateAction(courseId, initialData?.id || null, payload);
        if (res.success) {
          toast.success(
            publishImmediately
              ? t("published")
              : isEdit
              ? t("updated")
              : t("savedDraft")
          );
          router.push(`/tutor/${courseId}/quizzes`);
          router.refresh();
        }
      } catch {
        toast.error(t("saveFailed"));
      }
    });
  };

  const headerTitle = isEdit
    ? title ? `${t("editTitle")}: ${title}` : t("editTitle")
    : t("createTitle", { course: courseTitle });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={NotebookPen}
        title={headerTitle}
        backHref={`/tutor/${courseId}/quizzes`}
        backLabel={t("backToQuizList")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => handleSubmit(false)}
              className="h-9 rounded-md border-border font-semibold text-body-sm"
            >
              <Save className="mr-1.5 size-3.5" />
              {isEdit ? t("saveChanges") : t("saveDraft")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={() => handleSubmit(true)}
              className="h-9 rounded-md bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 font-semibold text-body-sm shadow-xs"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> {t("saving")}
                </>
              ) : (
                <>
                  <Send className="mr-1.5 size-3.5" />
                  {isEdit ? t("saveAndPublish") : t("publishQuiz")}
                </>
              )}
            </Button>
          </div>
        }
      />

      {/* Creator Attribution Metadata Strip (in edit mode or detail) */}
      {isEdit && initialData && (
        <Card className="rounded-xl border border-border bg-muted/20 shadow-xs">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3 text-body-xs">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Shield className="size-4 text-brand-primary shrink-0" />
              <span>{t("creator")}:</span>
              <span className="font-bold text-foreground">
                {initialData.creatorName || t("system")}
              </span>
              {initialData.creatorEmail && (
                <span className="text-muted-foreground">({initialData.creatorEmail})</span>
              )}
              {initialData.creatorRole && (
                <Badge variant="outline" className="capitalize text-[10px] rounded-md px-1.5 py-0">
                  {initialData.creatorRole}
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground flex items-center gap-2">
              <UserCheck className="size-3.5" />
              <span>{t("creatorAttribution")}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2-Tab Navigation */}
      <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full space-y-4">
        <TabsList>
          <TabsTrigger value="pengaturan">
            <Settings2 className="size-4" />
            {t("settings")}
          </TabsTrigger>
          <TabsTrigger value="soal">
            <BookOpen className="size-4" />
            {t("questions")}
            {selectedQIds.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-body-2xs">
                {selectedQIds.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: PENGATURAN */}
        <TabsContent value="pengaturan" className="space-y-4 focus-visible:outline-none">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* LEFT COLUMN: Main Info & Schedule */}
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card lg:col-span-7">
              <section>
                <div className="border-b border-border px-4 py-3">
                  <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                    <BookOpen className="size-4 text-brand-primary" />
                    {t("quizTitle")}
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <Label htmlFor="courseTitle" className="text-body-sm font-semibold text-foreground">
                      {t("course")}
                    </Label>
                    <Input
                      id="courseTitle"
                      value={courseTitle}
                      disabled
                      className="mt-1 rounded-lg border-border bg-muted text-body-sm font-medium"
                    />
                  </div>

                  <div>
                    <Label htmlFor="title" className="text-body-sm font-semibold text-foreground">
                      {t("quizTitle")}
                    </Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t("titlePlaceholder")}
                      className="mt-1 rounded-lg border-border font-medium text-body-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="category" className="text-body-sm font-semibold text-foreground">
                        {t("category")}
                      </Label>
                      <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                        <SelectTrigger id="category" className="mt-1 rounded-lg border-border text-body-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="daily">{t("dailyPractice")}</SelectItem>
                          <SelectItem value="weekly">{t("weeklyQuiz")}</SelectItem>
                          <SelectItem value="chapter">{t("chapterQuiz")}</SelectItem>
                          <SelectItem value="premium">{t("premiumQuiz")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="visibility" className="text-body-sm font-semibold text-foreground">
                        {t("visibility")}
                      </Label>
                      <Select value={visibility} onValueChange={(v: any) => setVisibility(v)}>
                        <SelectTrigger id="visibility" className="mt-1 rounded-lg border-border text-body-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="free">{t("freeAccess")}</SelectItem>
                          <SelectItem value="paid">{t("paidAccess")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </section>

              {/* Schedule Settings */}
              <section>
                <div className="border-b border-border px-4 py-3">
                  <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                    <Calendar className="size-4 text-brand-primary" />
                    {t("scheduleType")}
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleType("scheduled");
                        if (manualStatus !== "open" && manualStatus !== "closed") {
                          setManualStatus("scheduled");
                        }
                      }}
                      className={cn(
                        "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors cursor-pointer",
                        scheduleType === "scheduled"
                          ? "border-brand-primary bg-brand-primary/5"
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
                        <div className="text-body-sm font-bold text-foreground">{t("scheduled")}</div>
                        <div className="text-body-xs text-muted-foreground mt-0.5">
                          {t("scheduledDescription")}
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
                        "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors cursor-pointer",
                        scheduleType === "manual"
                          ? "border-brand-primary bg-brand-primary/5"
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
                        <div className="text-body-sm font-bold text-foreground">{t("manual")}</div>
                        <div className="text-body-xs text-muted-foreground mt-0.5">
                          {t("manualDescription")}
                        </div>
                      </div>
                    </button>
                  </div>

                  {scheduleType === "scheduled" ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-border">
                      <div>
                        <Label htmlFor="openAt" className="text-body-sm font-semibold text-foreground">
                          {t("openAt")}
                        </Label>
                        <Input
                          id="openAt"
                          type="datetime-local"
                          value={openAt}
                          onChange={(e) => setOpenAt(e.target.value)}
                          className="mt-1 rounded-lg border-border text-body-sm"
                        />
                      </div>

                      <div>
                        <Label htmlFor="closeAt" className="text-body-sm font-semibold text-foreground">
                          {t("closeAt")}
                        </Label>
                        <Input
                          id="closeAt"
                          type="datetime-local"
                          value={closeAt}
                          onChange={(e) => setCloseAt(e.target.value)}
                          className="mt-1 rounded-lg border-border text-body-sm"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-border">
                      <Label htmlFor="manualStatus" className="text-body-sm font-semibold text-foreground">
                        {t("quizStatus")}
                      </Label>
                      <Select value={manualStatus} onValueChange={(v: any) => setManualStatus(v)}>
                        <SelectTrigger id="manualStatus" className="mt-1 rounded-lg border-border text-body-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="open">{t("open")}</SelectItem>
                          <SelectItem value="closed">{t("closed")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: Duration, Rules & Scoring */}
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card lg:col-span-5">
              <section>
                <div className="border-b border-border px-4 py-3">
                  <h3 className="font-heading text-body-base font-bold text-foreground">
                    {t("durationAttempts")}
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-body-sm font-semibold text-foreground">{t("timeLimit")}</Label>
                    </div>
                    <Switch
                      checked={hasGlobalTimeLimit}
                      onCheckedChange={setHasGlobalTimeLimit}
                    />
                  </div>

                  {hasGlobalTimeLimit && (
                    <div>
                      <Label htmlFor="timeLimit" className="text-body-sm font-semibold text-foreground">
                        {t("durationMinutes")}
                      </Label>
                      <Input
                        id="timeLimit"
                        type="number"
                        min="1"
                        value={timeLimitMinutes}
                        onChange={(e) => setTimeLimitMinutes(e.target.value)}
                        className="mt-1 rounded-lg border-border text-body-sm"
                      />
                    </div>
                  )}

                  <div>
                    <Label htmlFor="maxAttempts" className="text-body-sm font-semibold text-foreground">
                      {t("maxAttempts")}
                    </Label>
                    <Input
                      id="maxAttempts"
                      type="number"
                      min="1"
                      placeholder={t("noLimit")}
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(e.target.value)}
                      className="mt-1 rounded-lg border-border text-body-sm"
                    />
                  </div>
                </div>
              </section>

              <section>
                <div className="border-b border-border px-4 py-3">
                  <h3 className="font-heading text-body-base font-bold text-foreground">
                    {t("rulesAndExplanations")}
                  </h3>
                </div>
                <div className="p-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-body-sm font-semibold text-foreground block">{t("freeNavigation")}</span>
                      <span className="text-body-xs text-muted-foreground">{t("freeNavigationDescription")}</span>
                    </div>
                    <Switch checked={canGoBack} onCheckedChange={setCanGoBack} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-body-sm font-semibold text-foreground block">{t("requireAll")}</span>
                      <span className="text-body-xs text-muted-foreground">{t("requireAllDescription")}</span>
                    </div>
                    <Switch checked={requireAllAnswered} onCheckedChange={setRequireAllAnswered} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-body-sm font-semibold text-foreground block">{t("shuffleQuestions")}</span>
                      <span className="text-body-xs text-muted-foreground">{t("shuffleQuestionsDescription")}</span>
                    </div>
                    <Switch checked={shuffleQuestions} onCheckedChange={setShuffleQuestions} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-body-sm font-semibold text-foreground block">{t("shuffleOptions")}</span>
                      <span className="text-body-xs text-muted-foreground">{t("shuffleOptionsDescription")}</span>
                    </div>
                    <Switch checked={shuffleOptions} onCheckedChange={setShuffleOptions} />
                  </div>

                  <div className="pt-2 border-t border-border">
                    <Label htmlFor="explanationRelease" className="text-body-sm font-semibold text-foreground">
                      {t("discussionRelease")}
                    </Label>
                    <Select value={explanationRelease} onValueChange={(v: any) => setExplanationRelease(v)}>
                      <SelectTrigger id="explanationRelease" className="mt-1 rounded-lg border-border text-body-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="immediate">{t("immediate")}</SelectItem>
                        <SelectItem value="after_close">{t("afterClose")}</SelectItem>
                        <SelectItem value="never">{t("never")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: PILIHAN SOAL */}
        <TabsContent value="soal" className="space-y-4 focus-visible:outline-none">
          <Card className="rounded-xl border border-border bg-card shadow-xs">
            <div className="border-b border-border px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-heading text-body-base font-bold text-foreground">
                  {t("questionSelection", { count: selectedQIds.length })}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-body-xs rounded-md">
                  {t("easy")}: {selectedDifficultyCounts.easy}
                </Badge>
                <Badge variant="outline" className="text-body-xs rounded-md">
                  {t("medium")}: {selectedDifficultyCounts.medium}
                </Badge>
                <Badge variant="outline" className="text-body-xs rounded-md">
                  {t("hard")}: {selectedDifficultyCounts.hard}
                </Badge>
              </div>
            </div>

            <CardContent className="p-4 space-y-4">
              {/* Responsive Inline Filter Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[140px]">
                  <SearchBar
                    placeholder={t("searchQuestions")}
                    aria-label={t("searchQuestions")}
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setQuestionPage(0); }}
                    onClear={() => { setSearchQuery(""); setQuestionPage(0); }}
                    className="h-9 rounded-lg border-border text-body-sm"
                  />
                </div>

                <Select value={difficultyFilter} onValueChange={(value) => { setDifficultyFilter(value); setQuestionPage(0); }}>
                  <SelectTrigger aria-label={t("difficulty")} className="w-52 h-9 rounded-lg border-border text-body-sm shrink-0">
                    <SelectValue placeholder={t("difficulty")} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">{t("allDifficulties")}</SelectItem>
                    <SelectItem value="easy">{t("easy")}</SelectItem>
                    <SelectItem value="medium">{t("medium")}</SelectItem>
                    <SelectItem value="hard">{t("hard")}</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={(value) => { setTypeFilter(value); setQuestionPage(0); }}>
                  <SelectTrigger aria-label={t("questionType")} className="w-36 h-9 rounded-lg border-border text-body-sm shrink-0">
                    <SelectValue placeholder={t("questionType")} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">{t("allTypes")}</SelectItem>
                    <SelectItem value="multiple_choice">{t("singleChoice")}</SelectItem>
                    <SelectItem value="multiple_choices">{t("multiChoice")}</SelectItem>
                    <SelectItem value="short_answer">{t("shortAnswer")}</SelectItem>
                    <SelectItem value="essay">{t("essay")}</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setOnlySelectedFilter(!onlySelectedFilter); setQuestionPage(0); }}
                  aria-pressed={onlySelectedFilter}
                  className={cn(
                    "h-9 rounded-lg border-border text-body-sm shrink-0",
                    onlySelectedFilter ? "bg-brand-primary/10 border-brand-primary text-brand-primary" : ""
                  )}
                >
                  <Filter className="mr-1.5 size-3.5" />
                  {onlySelectedFilter ? t("selectedOnly") : t("allQuestions")}
                </Button>

                <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllFiltered}
                    className="h-9 rounded-lg border-border text-body-sm"
                  >
                    {t("selectAll", { count: filteredQuestions.length })}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={deselectAllFiltered}
                    className="h-9 rounded-lg border-border text-body-sm"
                  >
                    {t("clearSelection")}
                  </Button>
                </div>
              </div>

              {/* Question Bank Items List */}
              {questionBank.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-xl">
                  <HelpCircle className="size-10 text-muted-foreground/50 mx-auto mb-2" />
                  <h4 className="font-heading text-body-base font-bold text-foreground">{t("emptyBank")}</h4>
                  <p className="text-body-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    {t("emptyBankDescription")}
                  </p>
                </div>
              ) : filteredQuestions.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border rounded-xl">
                  <p className="text-body-sm text-muted-foreground">{t("noMatchingQuestions")}</p>
                </div>
              ) : (
                <>
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {pageQuestions.map((q) => {
                    const isSelected = selectedQIds.includes(q.id);
                    const qOpts = Array.isArray(q.options)
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

                    return (
                      <div
                        key={q.id}
                        onClick={() => toggleSelectQuestion(q.id)}
                        className={cn(
                          "flex items-start gap-3 px-3 py-3 transition-colors cursor-pointer text-left",
                          isSelected
                            ? "bg-primary/5"
                            : "hover:bg-muted/30"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectQuestion(q.id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={t("questionNumber", { count: questionBank.indexOf(q) + 1 })}
                          className="mt-0.5 shrink-0"
                        />

                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-body-xs font-bold text-muted-foreground">
                              {t("questionNumber", { count: questionBank.indexOf(q) + 1 })}
                            </span>
                            <Badge
                              className={cn(
                                "text-[10px] rounded-md px-1.5 py-0.5 border font-semibold",
                                q.difficulty === "easy"
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : q.difficulty === "medium"
                                  ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                  : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                              )}
                            >
                              {t(q.difficulty)}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] rounded-md text-muted-foreground">
                              {q.questionType === "short_answer"
                                ? t("shortAnswer")
                                : q.questionType === "essay"
                                ? t("essay")
                                : q.questionType === "multiple_choices"
                                ? t("multiChoice")
                                : t("singleChoice")}
                            </Badge>
                          </div>

                          <MathText className="text-body-sm font-medium text-foreground leading-relaxed pt-0.5" as="p">
                            {q.prompt}
                          </MathText>

                          {qOpts.length > 0 && (
                            <div className="grid gap-1 sm:grid-cols-2 pt-1">
                              {qOpts.map((opt: string, optIdx: number) => (
                                <div key={optIdx} className="text-body-xs text-muted-foreground break-words">
                                  <span className="font-semibold text-foreground/80 mr-1">
                                    {String.fromCharCode(65 + optIdx)}.
                                  </span>
                                  <span>{opt}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {questionPageCount > 1 && (
                  <nav aria-label={locale === "id" ? "Halaman bank soal" : "Question bank pages"} className="flex flex-wrap items-center justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={currentQuestionPage === 0} onClick={() => setQuestionPage(currentQuestionPage - 1)}>{locale === "id" ? "Sebelumnya" : "Previous"}</Button>
                    <span className="text-body-sm text-muted-foreground" aria-live="polite">{currentQuestionPage + 1} / {questionPageCount}</span>
                    <Button type="button" variant="outline" size="sm" disabled={currentQuestionPage === questionPageCount - 1} onClick={() => setQuestionPage(currentQuestionPage + 1)}>{locale === "id" ? "Berikutnya" : "Next"}</Button>
                  </nav>
                )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
