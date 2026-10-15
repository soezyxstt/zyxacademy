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
  Check,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { SearchBar } from "@/components/ui/search-bar";
import { PageHeader } from "@/components/page-header";
import { MathText } from "@/components/course/math-text";
import { DifficultyProportionSlider } from "@/components/admin/difficulty-proportion-slider";
import { formatDatetimeLocal } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { saveQuizTemplateAction } from "@/app/actions/tutor-management";

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
      toast.error("Judul kuis wajib diisi.");
      return;
    }

    if (selectionMode === "specific" && selectedQIds.length === 0) {
      setCurrentTab("soal");
      toast.error("Pilih minimal 1 butir soal dari bank soal.");
      return;
    }

    if (selectionMode === "distribution") {
      const qCount = Number(count) || 0;
      const easyCount = Number(easy) || 0;
      const medCount = Number(medium) || 0;
      const hardCount = Number(hard) || 0;

      if (qCount < 1) {
        setCurrentTab("soal");
        toast.error("Jumlah soal kuis minimal 1.");
        return;
      }
      if (easyCount + medCount + hardCount !== qCount) {
        setCurrentTab("soal");
        toast.error(
          `Proporsi kesulitan (${easyCount} Mudah + ${medCount} Sedang + ${hardCount} Sulit = ${
            easyCount + medCount + hardCount
          }) harus sama dengan total soal (${qCount}).`
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
              ? "Kuis berhasil dipublikasikan."
              : isEdit
              ? "Kuis berhasil diperbarui."
              : "Kuis berhasil disimpan sebagai draf."
          );
          router.push(`/tutor/${courseId}/quizzes`);
          router.refresh();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Gagal menyimpan kuis.";
        toast.error(message);
      }
    });
  };

  const headerTitle = isEdit
    ? title ? `Edit Kuis: ${title}` : "Edit Kuis"
    : `Buat Kuis: ${courseTitle}`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={NotebookPen}
        title={headerTitle}
        backHref={`/tutor/${courseId}/quizzes`}
        backLabel="Kembali ke Daftar Kuis"
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => handleSubmit(false)}
              className="h-9 rounded-md border-border font-semibold text-body-sm"
            >
              <Save className="mr-1.5 size-3.5" />
              {isEdit ? "Simpan Perubahan" : "Simpan Draf"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={() => handleSubmit(true)}
              className="h-9 rounded-md bg-brand-primary text-white hover:bg-brand-primary/90 font-semibold text-body-sm shadow-xs"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 size-3.5" />
                  {isEdit ? "Simpan & Publikasikan" : "Publikasikan Kuis"}
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
              <span>Pembuat:</span>
              <span className="font-bold text-foreground">
                {initialData.creatorName || "Sistem"}
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
              <span>Atribusi pembuat bersifat permanen dan tidak berubah saat kuis diedit.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2-Tab Navigation */}
      <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full space-y-4">
        <TabsList>
          <TabsTrigger value="pengaturan">
            <Settings2 className="size-4" />
            Pengaturan Kuis
          </TabsTrigger>
          <TabsTrigger value="soal">
            <BookOpen className="size-4" />
            Pilihan Soal
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
                    Informasi kuis
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <Label htmlFor="courseTitle" className="text-body-sm font-semibold text-foreground">
                      Mata Kuliah
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
                      Judul Kuis
                    </Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Contoh: Kuis 1 - Turunan dan Penerapannya"
                      className="mt-1 rounded-lg border-border font-medium text-body-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="category" className="text-body-sm font-semibold text-foreground">
                        Kategori Kuis
                      </Label>
                      <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                        <SelectTrigger id="category" className="mt-1 rounded-lg border-border text-body-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="daily">Latihan Harian</SelectItem>
                          <SelectItem value="weekly">Kuis Mingguan</SelectItem>
                          <SelectItem value="chapter">Kuis Per Bab</SelectItem>
                          <SelectItem value="premium">Kuis Khusus / Premium</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="visibility" className="text-body-sm font-semibold text-foreground">
                        Akses Siswa
                      </Label>
                      <Select value={visibility} onValueChange={(v: any) => setVisibility(v)}>
                        <SelectTrigger id="visibility" className="mt-1 rounded-lg border-border text-body-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="free">Gratis (Semua Siswa Terdaftar)</SelectItem>
                          <SelectItem value="paid">Berbayar (Butuh Token Khusus)</SelectItem>
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
                    Jadwal akses
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
                            ? "border-brand-primary bg-brand-primary text-white"
                            : "border-muted-foreground"
                        )}
                      >
                        {scheduleType === "scheduled" && <div className="size-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="text-body-sm font-bold text-foreground">Terjadwal</div>
                        <div className="text-body-xs text-muted-foreground mt-0.5">
                          Otomatis buka dan tutup sesuai waktu
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
                            ? "border-brand-primary bg-brand-primary text-white"
                            : "border-muted-foreground"
                        )}
                      >
                        {scheduleType === "manual" && <div className="size-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="text-body-sm font-bold text-foreground">Manual</div>
                        <div className="text-body-xs text-muted-foreground mt-0.5">
                          Buka atau tutup kuis kapan saja instan
                        </div>
                      </div>
                    </button>
                  </div>

                  {scheduleType === "scheduled" ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-border">
                      <div>
                        <Label htmlFor="openAt" className="text-body-sm font-semibold text-foreground">
                          Waktu Buka Kuis
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
                          Waktu Tutup Kuis
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
                        Status Kuis Manual
                      </Label>
                      <Select value={manualStatus} onValueChange={(v: any) => setManualStatus(v)}>
                        <SelectTrigger id="manualStatus" className="mt-1 rounded-lg border-border text-body-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="open">Buka (Siswa dapat mengerjakan sekarang)</SelectItem>
                          <SelectItem value="closed">Tutup (Siswa tidak dapat mengerjakan)</SelectItem>
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
                    Durasi dan percobaan
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-body-sm font-semibold text-foreground">Batas Waktu Pengerjaan</Label>
                    </div>
                    <Switch
                      checked={hasGlobalTimeLimit}
                      onCheckedChange={setHasGlobalTimeLimit}
                    />
                  </div>

                  {hasGlobalTimeLimit && (
                    <div>
                      <Label htmlFor="timeLimit" className="text-body-sm font-semibold text-foreground">
                        Durasi (Menit)
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
                      Maksimal Percobaan
                    </Label>
                    <Input
                      id="maxAttempts"
                      type="number"
                      min="1"
                      placeholder="Kosongkan untuk tanpa batas"
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
                    Aturan dan pembahasan
                  </h3>
                </div>
                <div className="p-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-body-sm font-semibold text-foreground block">Navigasi Bebas</span>
                      <span className="text-body-xs text-muted-foreground">Siswa boleh kembali ke soal sebelumnya</span>
                    </div>
                    <Switch checked={canGoBack} onCheckedChange={setCanGoBack} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-body-sm font-semibold text-foreground block">Wajib Jawab Semua</span>
                      <span className="text-body-xs text-muted-foreground">Harus mengisi semua soal sebelum submit</span>
                    </div>
                    <Switch checked={requireAllAnswered} onCheckedChange={setRequireAllAnswered} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-body-sm font-semibold text-foreground block">Acak Urutan Soal</span>
                      <span className="text-body-xs text-muted-foreground">Urutan soal berbeda untuk setiap siswa</span>
                    </div>
                    <Switch checked={shuffleQuestions} onCheckedChange={setShuffleQuestions} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-body-sm font-semibold text-foreground block">Acak Opsi Jawaban</span>
                      <span className="text-body-xs text-muted-foreground">Urutan pilihan A, B, C, D diacak</span>
                    </div>
                    <Switch checked={shuffleOptions} onCheckedChange={setShuffleOptions} />
                  </div>

                  <div className="pt-2 border-t border-border">
                    <Label htmlFor="explanationRelease" className="text-body-sm font-semibold text-foreground">
                      Rilis Pembahasan Soal
                    </Label>
                    <Select value={explanationRelease} onValueChange={(v: any) => setExplanationRelease(v)}>
                      <SelectTrigger id="explanationRelease" className="mt-1 rounded-lg border-border text-body-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="immediate">Langsung setelah selesai kuis</SelectItem>
                        <SelectItem value="after_close">Setelah kuis ditutup</SelectItem>
                        <SelectItem value="never">Jangan tampilkan pembahasan</SelectItem>
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
                  Pilihan soal ({selectedQIds.length} Terpilih)
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-body-xs rounded-md">
                  Mudah: {selectedDifficultyCounts.easy}
                </Badge>
                <Badge variant="outline" className="text-body-xs rounded-md">
                  Sedang: {selectedDifficultyCounts.medium}
                </Badge>
                <Badge variant="outline" className="text-body-xs rounded-md">
                  Sulit: {selectedDifficultyCounts.hard}
                </Badge>
              </div>
            </div>

            <CardContent className="p-4 space-y-4">
              {/* Responsive Inline Filter Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[140px]">
                  <SearchBar
                    placeholder="Cari teks soal atau tag..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 rounded-lg border-border text-body-sm"
                  />
                </div>

                <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                  <SelectTrigger className="w-32 h-9 rounded-lg border-border text-body-sm shrink-0">
                    <SelectValue placeholder="Kesulitan" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">Semua Kesulitan</SelectItem>
                    <SelectItem value="easy">Mudah</SelectItem>
                    <SelectItem value="medium">Sedang</SelectItem>
                    <SelectItem value="hard">Sulit</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-36 h-9 rounded-lg border-border text-body-sm shrink-0">
                    <SelectValue placeholder="Tipe Soal" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">Semua Tipe</SelectItem>
                    <SelectItem value="multiple_choice">Single Choice</SelectItem>
                    <SelectItem value="multiple_choices">Multi Choice</SelectItem>
                    <SelectItem value="short_answer">Isian Singkat</SelectItem>
                    <SelectItem value="essay">Essay</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOnlySelectedFilter(!onlySelectedFilter)}
                  className={cn(
                    "h-9 rounded-lg border-border text-body-sm shrink-0",
                    onlySelectedFilter ? "bg-brand-primary/10 border-brand-primary text-brand-primary" : ""
                  )}
                >
                  <Filter className="mr-1.5 size-3.5" />
                  {onlySelectedFilter ? "Hanya Terpilih" : "Semua Soal"}
                </Button>

                <div className="flex items-center gap-1.5 ml-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllFiltered}
                    className="h-9 rounded-lg border-border text-body-sm"
                  >
                    Pilih Semua ({filteredQuestions.length})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={deselectAllFiltered}
                    className="h-9 rounded-lg border-border text-body-sm"
                  >
                    Hapus Pilihan
                  </Button>
                </div>
              </div>

              {/* Question Bank Items List */}
              {questionBank.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-xl">
                  <HelpCircle className="size-10 text-muted-foreground/50 mx-auto mb-2" />
                  <h4 className="font-heading text-body-base font-bold text-foreground">Bank Soal Kosong</h4>
                  <p className="text-body-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Tambahkan soal ke bank soal kelas terlebih dahulu agar dapat dipilih untuk kuis.
                  </p>
                </div>
              ) : filteredQuestions.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border rounded-xl">
                  <p className="text-body-sm text-muted-foreground">Tidak ada soal yang cocok dengan filter.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                  {filteredQuestions.map((q, idx) => {
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
                          "flex items-start gap-3 px-2 py-3 border-b border-border transition-colors cursor-pointer text-left",
                          isSelected
                            ? "border-brand-primary bg-brand-primary/5 shadow-xs"
                            : "border-border bg-card hover:bg-muted/30"
                        )}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectQuestion(q.id);
                          }}
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded border transition-colors mt-0.5",
                            isSelected
                              ? "bg-brand-primary border-brand-primary text-white"
                              : "border-border hover:border-brand-primary"
                          )}
                        >
                          {isSelected && <Check className="size-3" />}
                        </button>

                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-body-xs font-bold text-muted-foreground">
                              Soal #{questionBank.indexOf(q) + 1}
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
                              {q.difficulty}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] rounded-md text-muted-foreground">
                              {q.questionType === "short_answer"
                                ? "Isian Singkat"
                                : q.questionType === "essay"
                                ? "Essay"
                                : q.questionType === "multiple_choices"
                                ? "Multi Select"
                                : "Single Choice"}
                            </Badge>
                          </div>

                          <MathText className="text-body-sm font-medium text-foreground leading-relaxed pt-0.5" as="p">
                            {q.prompt}
                          </MathText>

                          {qOpts.length > 0 && (
                            <div className="grid gap-1 sm:grid-cols-2 pt-1">
                              {qOpts.map((opt: string, optIdx: number) => (
                                <div key={optIdx} className="text-body-xs text-muted-foreground truncate">
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
