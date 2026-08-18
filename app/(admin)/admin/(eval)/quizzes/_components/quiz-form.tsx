"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  HelpCircle,
  Save,
  Search,
  Settings2,
  Sliders,
  Sparkles,
  Timer,
  CheckCircle2,
  CheckSquare,
  Square,
  AlertTriangle,
  Send,
  BookOpen,
  Shuffle,
  Lock,
  ChevronRight,
  Loader2,
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
import { MathText } from "@/components/course/math-text";
import { formatDatetimeLocal } from "@/lib/date-utils";
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

interface Props {
  initialData?: InitialQuizData;
  courses: CourseOption[];
  isEdit?: boolean;
}

export function QuizForm({ initialData, courses, isEdit = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab State synced with URL query param ?tab=pengaturan | ?tab=soal
  const currentTab = searchParams.get("tab") === "soal" ? "soal" : "pengaturan";
  const handleTabChange = (val: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", val);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

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
  const [onlySelectedFilter, setOnlySelectedFilter] = useState(false);

  // Fetch Questions for the selected course
  useEffect(() => {
    if (!courseId) return;

    let active = true;
    async function loadQuestions() {
      setLoadingQuestions(true);
      try {
        const res = await fetch(`/api/admin/questions?courseId=${courseId}&reviewStatus=published&limit=500`);
        if (res.ok && active) {
          const data = await res.json();
          setCourseQuestions(data || []);
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
      return toast.error("Judul kuis wajib diisi.");
    }
    if (!courseId) {
      handleTabChange("pengaturan");
      return toast.error("Pilih mata kuliah untuk kuis ini.");
    }

    if (selectionMode === "specific" && selectedQIds.length === 0) {
      handleTabChange("soal");
      return toast.error("Pilih minimal 1 butir soal dari bank soal.");
    }

    if (selectionMode === "distribution") {
      const qCount = Number(count) || 0;
      const easyCount = Number(easy) || 0;
      const medCount = Number(medium) || 0;
      const hardCount = Number(hard) || 0;

      if (qCount < 1) {
        handleTabChange("soal");
        return toast.error("Jumlah soal kuis minimal 1.");
      }
      if (easyCount + medCount + hardCount !== qCount) {
        handleTabChange("soal");
        return toast.error(
          `Proporsi kesulitan (${easyCount} Mudah + ${medCount} Sedang + ${hardCount} Sulit = ${
            easyCount + medCount + hardCount
          }) harus sama dengan total soal (${qCount}).`
        );
      }
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
          const errData = await res.json();
          throw new Error(errData.error || "Gagal memperbarui kuis.");
        }

        toast.success("Kuis berhasil diperbarui.");
      } else {
        const res = await fetch("/api/quiz/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Gagal membuat kuis baru.");
        }

        toast.success(
          publishImmediately ? "Kuis berhasil dibuat dan dipublikasikan!" : "Kuis berhasil disimpan sebagai draf!"
        );
      }

      router.push("/admin/quizzes");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan kuis.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="rounded-lg border-border">
            <Link href="/admin/quizzes">
              <ArrowLeft className="mr-1.5 size-4" /> Kembali
            </Link>
          </Button>
          <div>
            <h2 className="font-heading text-h5 font-bold text-foreground">
              {isEdit ? "Edit Kuis" : "Buat Kuis Baru"}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => handleSubmit(false)}
            className="rounded-lg border-border font-medium"
          >
            <Save className="mr-1.5 size-4" />
            {isEdit ? "Simpan Perubahan" : "Simpan Draf"}
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => handleSubmit(true)}
            className="rounded-lg bg-brand-primary text-white hover:bg-brand-primary/95 font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" /> Menyimpan...
              </>
            ) : (
              <>
                <Send className="mr-1.5 size-4" />
                {isEdit ? "Simpan & Publikasikan" : "Publikasikan Kuis"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 2-Tab Navigation */}
      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted p-1 sm:w-80">
          <TabsTrigger
            value="pengaturan"
            className="flex items-center gap-2 rounded-lg text-body-sm font-semibold transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
          >
            <Settings2 className="size-4" />
            Pengaturan Kuis
          </TabsTrigger>
          <TabsTrigger
            value="soal"
            className="flex items-center gap-2 rounded-lg text-body-sm font-semibold transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
          >
            <BookOpen className="size-4" />
            Pilihan Soal
            {selectedQIds.length > 0 && (
              <span className="ml-1 rounded-md bg-brand-primary/15 px-1.5 py-0.5 text-body-xs font-bold text-brand-primary">
                {selectedQIds.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: PENGATURAN KUIS */}
        <TabsContent value="pengaturan" className="space-y-6 focus-visible:outline-none">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            
            {/* LEFT COLUMN: Main Info & Schedule (7 cols) */}
            <div className="space-y-6 lg:col-span-7">
              {/* General Information Card */}
              <Card className="rounded-xl border border-border bg-card shadow-xs">
                <div className="border-b border-border/80 px-5 py-3.5">
                  <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                    <BookOpen className="size-4 text-brand-primary" />
                    Informasi Utama Kuis
                  </h3>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div>
                    <Label htmlFor="courseId" className="text-body-sm font-semibold text-foreground">
                      Mata Kuliah
                    </Label>
                    <Select value={courseId} onValueChange={setCourseId} disabled={isEdit}>
                      <SelectTrigger id="courseId" className="mt-1.5 w-full rounded-lg border-border">
                        <SelectValue placeholder="Pilih mata kuliah..." />
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

                  <div>
                    <Label htmlFor="title" className="text-body-sm font-semibold text-foreground">
                      Judul Kuis
                    </Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Contoh: Kuis 1 - Kalkulus & Aljabar Linear"
                      className="mt-1.5 rounded-lg border-border font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="category" className="text-body-sm font-semibold text-foreground">
                        Kategori Kuis
                      </Label>
                      <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                        <SelectTrigger id="category" className="mt-1.5 rounded-lg border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Latihan Harian</SelectItem>
                          <SelectItem value="weekly">Kuis Mingguan</SelectItem>
                          <SelectItem value="chapter">Kuis Per Bab</SelectItem>
                          <SelectItem value="simulation">Simulasi Ujian</SelectItem>
                          <SelectItem value="premium">Kuis Khusus / Premium</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="visibility" className="text-body-sm font-semibold text-foreground">
                        Akses Siswa
                      </Label>
                      <Select value={visibility} onValueChange={(v: any) => setVisibility(v)}>
                        <SelectTrigger id="visibility" className="mt-1.5 rounded-lg border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Gratis (Semua Siswa Terdaftar)</SelectItem>
                          <SelectItem value="paid">Berbayar (Butuh Token Khusus)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Schedule Settings Card */}
              <Card className="rounded-xl border border-border bg-card shadow-xs">
                <div className="border-b border-border/80 px-5 py-3.5">
                  <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                    <Calendar className="size-4 text-brand-primary" />
                    Jadwal Akses Kuis
                  </h3>
                </div>
                <CardContent className="p-5 space-y-4">
                  {/* Schedule Mode Selector */}
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
                        "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer",
                        scheduleType === "scheduled"
                          ? "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/30"
                          : "border-border bg-card hover:bg-muted/50"
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border mt-0.5",
                          scheduleType === "scheduled"
                            ? "border-brand-primary bg-brand-primary text-white"
                            : "border-muted-foreground"
                        )}
                      >
                        {scheduleType === "scheduled" && <div className="size-2 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="text-body-sm font-bold text-foreground">Terjadwal</div>
                        <div className="text-body-xs text-muted-foreground mt-0.5">
                          Tentukan jadwal buka dan tutup secara otomatis
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
                        "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer",
                        scheduleType === "manual"
                          ? "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/30"
                          : "border-border bg-card hover:bg-muted/50"
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border mt-0.5",
                          scheduleType === "manual"
                            ? "border-brand-primary bg-brand-primary text-white"
                            : "border-muted-foreground"
                        )}
                      >
                        {scheduleType === "manual" && <div className="size-2 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="text-body-sm font-bold text-foreground">Manual</div>
                        <div className="text-body-xs text-muted-foreground mt-0.5">
                          Buka atau tutup kuis kapan saja secara instan
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Scheduled Fields */}
                  {scheduleType === "scheduled" && (
                    <div className="space-y-4 rounded-lg border border-border/80 bg-muted/20 p-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="openAt" className="text-body-sm font-semibold text-foreground">
                            Waktu Buka Kuis
                          </Label>
                          <Input
                            id="openAt"
                            type="datetime-local"
                            value={openAt}
                            onChange={(e) => setOpenAt(e.target.value)}
                            className="mt-1.5 rounded-lg border-border"
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
                            className="mt-1.5 rounded-lg border-border"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="manualStatusScheduled" className="text-body-sm font-semibold text-foreground">
                          Status Override Manual
                        </Label>
                        <Select
                          value={manualStatus}
                          onValueChange={(v: "open" | "closed" | "scheduled") => setManualStatus(v)}
                        >
                          <SelectTrigger id="manualStatusScheduled" className="mt-1.5 rounded-lg border-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="scheduled">Ikuti Jadwal Otomatis</SelectItem>
                            <SelectItem value="open">Buka Paksa Sekarang</SelectItem>
                            <SelectItem value="closed">Tutup Paksa Sekarang</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Manual Mode Fields */}
                  {scheduleType === "manual" && (
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
                      <Label className="text-body-sm font-semibold text-foreground">Status Ketersediaan Kuis</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          type="button"
                          variant={manualStatus === "open" ? "default" : "outline"}
                          onClick={() => setManualStatus("open")}
                          className={cn(
                            "rounded-lg font-semibold",
                            manualStatus === "open" ? "bg-status-success text-white hover:bg-status-success/90" : "border-border"
                          )}
                        >
                          <CheckCircle2 className="mr-1.5 size-4" /> Kuis Dibuka
                        </Button>
                        <Button
                          type="button"
                          variant={manualStatus === "closed" ? "default" : "outline"}
                          onClick={() => setManualStatus("closed")}
                          className={cn(
                            "rounded-lg font-semibold",
                            manualStatus === "closed" ? "bg-muted-foreground text-white hover:bg-muted-foreground/90" : "border-border"
                          )}
                        >
                          <Lock className="mr-1.5 size-4" /> Kuis Ditutup
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Discussion & Scoring Card */}
              <Card className="rounded-xl border border-border bg-card shadow-xs">
                <div className="border-b border-border/80 px-5 py-3.5">
                  <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="size-4 text-brand-primary" />
                    Pembahasan & Penilaian
                  </h3>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div>
                    <Label htmlFor="explanationRelease" className="text-body-sm font-semibold text-foreground">
                      Waktu Rilis Pembahasan Kuis
                    </Label>
                    <Select
                      value={explanationRelease}
                      onValueChange={(v: "immediate" | "after_close" | "never") => setExplanationRelease(v)}
                    >
                      <SelectTrigger id="explanationRelease" className="mt-1.5 rounded-lg border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="after_close">
                          Setelah Kuis Ditutup (Jadwal selesai atau ditutup manual)
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

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                    <div className="flex items-center justify-between rounded-lg border border-border p-3.5">
                      <div className="space-y-0.5 pr-2">
                        <Label className="text-body-sm font-semibold text-foreground">Tampilkan Skor Instan</Label>
                        <p className="text-body-xs text-muted-foreground">
                          Siswa langsung melihat nilai total setelah submit
                        </p>
                      </div>
                      <Switch checked={showScoreImmediate} onCheckedChange={setShowScoreImmediate} />
                    </div>

                    <div className="rounded-lg border border-border p-3.5 space-y-1.5">
                      <Label htmlFor="passingScore" className="text-body-sm font-semibold text-foreground">
                        Nilai Kelulusan / Passing Grade (%)
                      </Label>
                      <Input
                        id="passingScore"
                        type="number"
                        min={0}
                        max={100}
                        value={passingScore}
                        onChange={(e) => setPassingScore(e.target.value)}
                        placeholder="70"
                        className="h-8 rounded-md border-border"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* RIGHT COLUMN: Timers, Navigation & Rules (5 cols) */}
            <div className="space-y-6 lg:col-span-5">
              
              {/* Duration & Timer Card */}
              <Card className="rounded-xl border border-border bg-card shadow-xs">
                <div className="border-b border-border/80 px-5 py-3.5">
                  <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                    <Timer className="size-4 text-brand-primary" />
                    Durasi & Timer
                  </h3>
                </div>
                <CardContent className="p-5 space-y-4">
                  {/* Global Duration */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-body-sm font-semibold text-foreground">Batas Waktu Keseluruhan</Label>
                      <Switch checked={hasGlobalTimeLimit} onCheckedChange={setHasGlobalTimeLimit} />
                    </div>
                    {hasGlobalTimeLimit ? (
                      <div className="flex items-center gap-2 pt-1">
                        <Input
                          type="number"
                          min={1}
                          max={360}
                          value={timeLimitMinutes}
                          onChange={(e) => setTimeLimitMinutes(e.target.value)}
                          className="w-28 rounded-lg border-border"
                        />
                        <span className="text-body-sm text-muted-foreground font-medium">Menit total</span>
                      </div>
                    ) : (
                      <p className="text-body-xs text-muted-foreground">Kuis tidak memiliki batas waktu keseluruhan.</p>
                    )}
                  </div>

                  <div className="border-t border-border/60 pt-4 space-y-3">
                    {/* Per-Question Timer */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label className="text-body-sm font-semibold text-foreground">Timer Per Butir Soal</Label>
                        <p className="text-body-xs text-muted-foreground">
                          Setiap soal memiliki timer mundur tersendiri
                        </p>
                      </div>
                      <Switch
                        checked={perQuestionTimerEnabled}
                        onCheckedChange={setPerQuestionTimerEnabled}
                      />
                    </div>

                    {perQuestionTimerEnabled && (
                      <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-2">
                        <Label htmlFor="defaultTimer" className="text-body-xs font-semibold text-foreground">
                          Durasi Standar Per Soal (Detik)
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="defaultTimer"
                            type="number"
                            min={5}
                            max={600}
                            value={defaultQuestionTimerSeconds}
                            onChange={(e) => setDefaultQuestionTimerSeconds(e.target.value)}
                            className="w-28 rounded-lg border-border"
                          />
                          <span className="text-body-sm text-muted-foreground font-medium">Detik</span>
                        </div>
                        <p className="text-body-xs text-muted-foreground">
                          Anda juga dapat menyesuaikan durasi masing-masing soal di tab &ldquo;Pilihan Soal&rdquo;.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Navigation & Submission Rules Card */}
              <Card className="rounded-xl border border-border bg-card shadow-xs">
                <div className="border-b border-border/80 px-5 py-3.5">
                  <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                    <Sliders className="size-4 text-brand-primary" />
                    Aturan Pengerjaan & Navigasi
                  </h3>
                </div>
                <CardContent className="p-5 space-y-4">
                  {/* Can Go Back */}
                  <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
                    <div className="space-y-0.5">
                      <Label className="text-body-sm font-semibold text-foreground">Navigasi Mundur (Kembali)</Label>
                      <p className="text-body-xs text-muted-foreground">
                        {canGoBack
                          ? "Siswa bebas kembali ke soal sebelumnya"
                          : "Mode linier satu arah (tidak bisa kembali ke nomor sebelumnya)"}
                      </p>
                    </div>
                    <Switch checked={canGoBack} onCheckedChange={setCanGoBack} />
                  </div>

                  {/* Require All Answered */}
                  <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
                    <div className="space-y-0.5">
                      <Label className="text-body-sm font-semibold text-foreground">Wajib Jawab Semua Soal</Label>
                      <p className="text-body-xs text-muted-foreground">
                        {requireAllAnswered
                          ? "Siswa harus mengisi semua soal sebelum boleh submit"
                          : "Siswa boleh submit meski ada soal yang dikosongkan"}
                      </p>
                    </div>
                    <Switch checked={requireAllAnswered} onCheckedChange={setRequireAllAnswered} />
                  </div>

                  {/* Max Attempts */}
                  <div className="space-y-1.5 border-b border-border/60 pb-3">
                    <Label htmlFor="maxAttempts" className="text-body-sm font-semibold text-foreground">
                      Batas Maksimal Percobaan
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="maxAttempts"
                        type="number"
                        min={1}
                        max={100}
                        value={maxAttempts}
                        onChange={(e) => setMaxAttempts(e.target.value)}
                        placeholder="Kosongkan untuk bebas"
                        className="w-40 rounded-lg border-border"
                      />
                      <span className="text-body-xs text-muted-foreground">
                        {maxAttempts ? "Kali percobaan" : "Tak terbatas / bebas"}
                      </span>
                    </div>
                  </div>

                  {/* Shuffle Questions & Options */}
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-body-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Shuffle className="size-3.5 text-muted-foreground" />
                        Acak Urutan Soal
                      </Label>
                      <Switch checked={shuffleQuestions} onCheckedChange={setShuffleQuestions} />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label className="text-body-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Shuffle className="size-3.5 text-muted-foreground" />
                        Acak Opsi Pilihan Ganda
                      </Label>
                      <Switch checked={shuffleOptions} onCheckedChange={setShuffleOptions} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Navigation to Tab 2 */}
              <div className="rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between">
                <div>
                  <div className="text-body-sm font-bold text-brand-primary">Lanjut Pilih Soal</div>
                  <div className="text-body-xs text-muted-foreground">
                    {selectedQIds.length > 0
                      ? `${selectedQIds.length} butir soal telah dipilih`
                      : "Pilih butir soal dari bank soal"}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleTabChange("soal")}
                  className="rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90 font-semibold"
                >
                  Buka Tab Soal <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </div>

          </div>
        </TabsContent>

        {/* TAB 2: PILIHAN SOAL */}
        <TabsContent value="soal" className="space-y-6 focus-visible:outline-none">
          
          {/* Mode Selector & Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-body-sm font-semibold text-muted-foreground">Metode Soal:</span>
              <div className="flex rounded-lg border border-border p-0.5 bg-muted/40">
                <button
                  type="button"
                  onClick={() => setSelectionMode("specific")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-body-xs font-semibold transition-all cursor-pointer",
                    selectionMode === "specific"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Pilih Soal Spesifik
                </button>
                <button
                  type="button"
                  onClick={() => setSelectionMode("distribution")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-body-xs font-semibold transition-all cursor-pointer",
                    selectionMode === "distribution"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Distribusi Otomatis
                </button>
              </div>
            </div>

            {selectionMode === "specific" && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="rounded-md border-brand-primary/30 bg-brand-primary/10 text-brand-primary font-bold px-2.5 py-1">
                  {selectedQIds.length} Soal Terpilih
                </Badge>
                {selectedQIds.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearAllSelections}
                    className="h-7 text-body-xs text-status-error hover:bg-status-error/10 hover:text-status-error"
                  >
                    Kosongkan Pilihan
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* DISTRIBUTION MODE */}
          {selectionMode === "distribution" && (
            <Card className="rounded-xl border border-border bg-card shadow-xs">
              <div className="border-b border-border/80 px-5 py-3.5">
                <h3 className="font-heading text-body-base font-bold text-foreground">
                  Konfigurasi Distribusi Soal Otomatis
                </h3>
              </div>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      onChange={(e) => setCount(e.target.value)}
                      className="mt-1.5 rounded-lg border-border"
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
                      placeholder="Contoh: Bab 1, Turunan, Integral"
                      className="mt-1.5 rounded-lg border-border"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
                  <Label className="text-body-sm font-semibold text-foreground">
                    Proporsi Tingkat Kesulitan Soal
                  </Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className="text-body-xs font-semibold text-status-success uppercase">Mudah</span>
                      <Input
                        type="number"
                        min={0}
                        value={easy}
                        onChange={(e) => setEasy(e.target.value)}
                        className="mt-1 rounded-lg border-border"
                      />
                    </div>
                    <div>
                      <span className="text-body-xs font-semibold text-status-warning uppercase">Sedang</span>
                      <Input
                        type="number"
                        min={0}
                        value={medium}
                        onChange={(e) => setMedium(e.target.value)}
                        className="mt-1 rounded-lg border-border"
                      />
                    </div>
                    <div>
                      <span className="text-body-xs font-semibold text-status-error uppercase">Sulit</span>
                      <Input
                        type="number"
                        min={0}
                        value={hard}
                        onChange={(e) => setHard(e.target.value)}
                        className="mt-1 rounded-lg border-border"
                      />
                    </div>
                  </div>

                  <div className="text-body-xs text-muted-foreground flex items-center justify-between pt-1">
                    <span>
                      Total Proporsi:{" "}
                      <strong className="text-foreground">
                        {(Number(easy) || 0) + (Number(medium) || 0) + (Number(hard) || 0)}
                      </strong>{" "}
                      / Target: <strong className="text-foreground">{Number(count) || 0}</strong>
                    </span>
                    {(Number(easy) || 0) + (Number(medium) || 0) + (Number(hard) || 0) !== (Number(count) || 0) && (
                      <span className="text-status-error font-medium flex items-center gap-1">
                        <AlertTriangle className="size-3.5" /> Total proporsi belum sesuai
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* SPECIFIC QUESTION PICKER MODE */}
          {selectionMode === "specific" && (
            <div className="space-y-4">
              
              {/* Search & Filter Toolbar */}
              <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {/* Search bar */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari teks pertanyaan, tag, atau ID soal..."
                      className="pl-9 rounded-lg border-border"
                    />
                  </div>

                  {/* Filter Only Selected */}
                  <Button
                    type="button"
                    variant={onlySelectedFilter ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOnlySelectedFilter(!onlySelectedFilter)}
                    className={cn(
                      "rounded-lg font-semibold shrink-0",
                      onlySelectedFilter ? "bg-brand-primary text-white" : "border-border"
                    )}
                  >
                    <CheckSquare className="mr-1.5 size-4" />
                    Hanya Terpilih ({selectedQIds.length})
                  </Button>
                </div>

                {/* Filter Dropdowns Row */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {/* Difficulty */}
                  <div>
                    <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                      <SelectTrigger className="h-8 rounded-lg border-border text-body-xs">
                        <SelectValue placeholder="Semua Kesulitan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Kesulitan</SelectItem>
                        <SelectItem value="easy">Mudah (Easy)</SelectItem>
                        <SelectItem value="medium">Sedang (Medium)</SelectItem>
                        <SelectItem value="hard">Sulit (Hard)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Type */}
                  <div>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="h-8 rounded-lg border-border text-body-xs">
                        <SelectValue placeholder="Semua Tipe Soal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Tipe Soal</SelectItem>
                        <SelectItem value="multiple_choice">Pilihan Ganda</SelectItem>
                        <SelectItem value="multiple_choices">Pilihan Ganda Kompleks</SelectItem>
                        <SelectItem value="short_answer">Isian Singkat</SelectItem>
                        <SelectItem value="essay">Esai</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Origin */}
                  <div>
                    <Select value={originFilter} onValueChange={setOriginFilter}>
                      <SelectTrigger className="h-8 rounded-lg border-border text-body-xs">
                        <SelectValue placeholder="Semua Sumber" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Sumber</SelectItem>
                        <SelectItem value="zyx_original">Zyx Original</SelectItem>
                        <SelectItem value="itb_example">Contoh Soal ITB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tag */}
                  <div>
                    <Select value={tagFilter} onValueChange={setTagFilter}>
                      <SelectTrigger className="h-8 rounded-lg border-border text-body-xs">
                        <SelectValue placeholder="Semua Topik/Tag" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Topik/Tag</SelectItem>
                        {availableTags.map((tag) => (
                          <SelectItem key={tag} value={tag}>
                            {tag}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Bulk Selection Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-body-xs text-muted-foreground">
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
                      className="h-7 text-body-xs font-semibold text-brand-primary hover:bg-brand-primary/10"
                    >
                      Pilih Semua Hasil Filter
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={deselectAllFiltered}
                      disabled={filteredQuestions.length === 0}
                      className="h-7 text-body-xs font-semibold text-muted-foreground hover:bg-muted"
                    >
                      Batal Pilih Hasil Filter
                    </Button>
                  </div>
                </div>
              </div>

              {/* Questions List */}
              {loadingQuestions ? (
                <div className="rounded-xl border border-border bg-card p-12 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-brand-primary" />
                  <p className="mt-2 text-body-sm text-muted-foreground">Memuat bank soal kelas...</p>
                </div>
              ) : filteredQuestions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
                  <HelpCircle className="mx-auto size-8 text-muted-foreground mb-2" />
                  <h4 className="font-heading text-body-base font-bold text-foreground">Tidak Ada Soal yang Cocok</h4>
                  <p className="text-body-sm text-muted-foreground mt-1 max-w-md mx-auto">
                    Coba sesuaikan kata kunci pencarian atau bersihkan filter tingkat kesulitan dan topik.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
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
                          "relative rounded-xl border p-4 transition-all cursor-pointer select-none",
                          isSelected
                            ? "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/30"
                            : "border-border bg-card hover:border-brand-primary/40 hover:bg-muted/30"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {/* Checkbox Icon */}
                          <div className="mt-0.5 shrink-0">
                            {isSelected ? (
                              <CheckSquare className="size-5 text-brand-primary fill-brand-primary/10" />
                            ) : (
                              <Square className="size-5 text-muted-foreground" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 space-y-2">
                            {/* Badges row */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-md text-[11px] font-bold uppercase",
                                  q.difficulty === "easy" && "border-status-success/30 bg-status-success/10 text-status-success",
                                  q.difficulty === "medium" && "border-status-warning/30 bg-status-warning/10 text-status-warning",
                                  q.difficulty === "hard" && "border-status-error/30 bg-status-error/10 text-status-error"
                                )}
                              >
                                {q.difficulty}
                              </Badge>

                              <Badge variant="outline" className="rounded-md text-[11px] border-border text-muted-foreground">
                                {q.questionType === "multiple_choice"
                                  ? "Pilihan Ganda"
                                  : q.questionType === "multiple_choices"
                                  ? "Pilihan Ganda Kompleks"
                                  : q.questionType === "short_answer"
                                  ? "Isian Singkat"
                                  : "Esai"}
                              </Badge>

                              {q.origin === "itb_example" && (
                                <Badge variant="outline" className="rounded-md text-[11px] border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                  Contoh ITB
                                </Badge>
                              )}

                              {qTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
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
                                className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background p-2.5 w-fit"
                              >
                                <Timer className="size-4 text-brand-primary" />
                                <span className="text-body-xs font-semibold text-foreground">Timer Butir Soal Ini:</span>
                                <Input
                                  type="number"
                                  min={5}
                                  max={600}
                                  value={qDuration}
                                  onChange={(e) => updateQuestionTimer(q.id, Number(e.target.value))}
                                  className="h-7 w-20 rounded-md border-border text-body-xs"
                                />
                                <span className="text-body-xs text-muted-foreground">Detik</span>
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
