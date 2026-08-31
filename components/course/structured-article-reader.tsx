"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Compass,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  Search,
  X,
  Lightbulb,
  AlertTriangle,
  HelpCircle,
  Brain,
  Calculator,
  Sparkles,
  Layers,
  BookmarkCheck,
  Award,
  Zap,
  AlignLeft,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { useTutor } from "@/components/course/tutor-drawer";
import { ZyraMark } from "@/components/course/zyra-mark";
import { isZyraSelectionAskEnabled, normalizeZyraSelection } from "@/lib/zyra/murid";
import {
  type PublicArticleReadModel,
  type PublicSectionReadModel,
  resolveActiveSection,
  searchArticleContent,
} from "@/lib/articles/structured-read-model";

export interface StructuredArticleReaderProps {
  article: PublicArticleReadModel;
  course?: { id?: string; title: string } | null;
}

interface BlockMetadata {
  label: string;
  icon: React.ElementType;
  containerClass: string;
  badgeClass: string;
}

function getBlockMetadata(blockType: string): BlockMetadata {
  switch (blockType) {
    case "problem_introduction":
      return {
        label: "Pengantar Masalah",
        icon: HelpCircle,
        containerClass: "border-status-warning/40 bg-status-warning/10",
        badgeClass: "text-status-warning bg-status-warning/10",
      };
    case "prior_knowledge_activation":
      return {
        label: "Aktivasi Pengetahuan Awal",
        icon: Lightbulb,
        containerClass: "border-primary/30 bg-primary/5",
        badgeClass: "text-primary bg-primary/10",
      };
    case "verbal_representation":
      return {
        label: "Representasi Konseptual",
        icon: AlignLeft,
        containerClass: "border-primary/30 bg-primary/5",
        badgeClass: "text-primary bg-primary/10",
      };
    case "mathematical_representation":
      return {
        label: "Representasi Matematis",
        icon: Calculator,
        containerClass: "border-status-success/40 bg-status-success/10",
        badgeClass: "text-status-success bg-status-success/10",
      };
    case "analogy":
      return {
        label: "Analogi dan Intuisi",
        icon: Sparkles,
        containerClass: "border-status-warning/40 bg-status-warning/10",
        badgeClass: "text-status-warning bg-status-warning/10",
      };
    case "worked_example":
      return {
        label: "Contoh dan Pembahasan",
        icon: BookOpen,
        containerClass: "border-status-success/40 bg-status-success/10",
        badgeClass: "text-status-success bg-status-success/10",
      };
    case "misconception":
      return {
        label: "Miskonsepsi Umum",
        icon: AlertTriangle,
        containerClass: "border-status-error/40 bg-status-error/10",
        badgeClass: "text-status-error bg-status-error/10",
      };
    case "application":
      return {
        label: "Aplikasi dan Penerapan",
        icon: Zap,
        containerClass: "border-primary/30 bg-primary/5",
        badgeClass: "text-primary bg-primary/10",
      };
    case "retrieval_prompt":
      return {
        label: "Cek Pemahaman",
        icon: Brain,
        containerClass: "border-status-warning/40 bg-status-warning/10",
        badgeClass: "text-status-warning bg-status-warning/10",
      };
    case "cross_idea_synthesis":
      return {
        label: "Sintesis Antarkonsep",
        icon: Layers,
        containerClass: "border-primary/30 bg-primary/5",
        badgeClass: "text-primary bg-primary/10",
      };
    case "summary":
      return {
        label: "Ringkasan Bagian",
        icon: BookmarkCheck,
        containerClass: "border-border bg-muted/40",
        badgeClass: "text-muted-foreground bg-muted",
      };
    case "retrieval_close":
      return {
        label: "Refleksi Akhir",
        icon: Award,
        containerClass: "border-status-success/40 bg-status-success/10",
        badgeClass: "text-status-success bg-status-success/10",
      };
    case "explanation":
    default:
      return {
        label: "Penjelasan",
        icon: AlignLeft,
        containerClass: "border-border/60 bg-card",
        badgeClass: "text-muted-foreground bg-muted",
      };
  }
}

export function StructuredArticleSectionContent({
  section,
  completed = false,
  showProgress = true,
}: {
  section: PublicSectionReadModel;
  completed?: boolean;
  showProgress?: boolean;
}) {
  return (
    <>
      <header className="space-y-2 border-b border-border/80 pb-5">
        <div className="flex flex-wrap items-center gap-2 text-body-xs font-semibold text-muted-foreground">
          <span className="rounded-md bg-primary/10 px-2.5 py-0.5 text-primary">
            {section.sectionNumber}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {section.estimatedReadingMinutes} menit baca
          </span>
          {showProgress && completed ? (
            <span className="flex items-center gap-1 text-status-success">
              <CheckCircle2 className="size-3.5" />
              Selesai dibaca
            </span>
          ) : null}
        </div>
        <h1 className="font-heading text-h4 font-bold tracking-tight text-foreground sm:text-h3">
          {section.title}
        </h1>
        {section.learningObjective ? (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-2.5">
              <Compass className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <h2 className="text-body-xs font-bold uppercase tracking-wider text-primary">
                  Tujuan belajar
                </h2>
                <p className="mt-1 text-body-sm leading-relaxed text-foreground">
                  {section.learningObjective}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <div className="space-y-6 py-2">
        {section.blocks.map((block, blockIndex) => {
          const meta = getBlockMetadata(block.blockType);
          const Icon = meta.icon;
          const displayTitle = block.title || meta.label;
          const isStandard = block.blockType === "explanation";
          return (
            <section
              key={block.id || blockIndex}
              className={cn("rounded-lg border p-4 sm:p-5", meta.containerClass)}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", meta.badgeClass)}>
                    <Icon className="size-3.5" />
                  </span>
                  <h2 className="font-heading text-body-sm font-bold text-foreground">
                    {displayTitle}
                  </h2>
                </div>
                {!isStandard ? (
                  <span className={cn("rounded-md px-2 py-0.5 text-body-xs font-semibold uppercase tracking-wider", meta.badgeClass)}>
                    {meta.label}
                  </span>
                ) : null}
              </div>
              <div className="text-body-base leading-relaxed text-foreground">
                <MarkdownRenderer content={block.content} density="default" />
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

export function StructuredArticleReader({
  article,
  course,
}: StructuredArticleReaderProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Active section resolution
  const requestedSlug = searchParams.get("section");
  const activeSection = useMemo(() => {
    return resolveActiveSection(
      article.sections,
      requestedSlug,
      article.progress?.lastSectionSlug,
    );
  }, [article.sections, requestedSlug, article.progress?.lastSectionSlug]);

  const activeIndex = useMemo(() => {
    if (!activeSection) return 0;
    const idx = article.sections.findIndex((s) => s.id === activeSection.id);
    return idx >= 0 ? idx : 0;
  }, [article.sections, activeSection]);

  // TOC sidebar & mobile sheet states
  const [isTocOpen, setIsTocOpen] = useState(true);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [temporaryHighlight, setTemporaryHighlight] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reading progress tracking state
  const [sectionProgressMap, setSectionProgressMap] = useState<
    Record<string, { maxReadPercent: number; completed: boolean; timeSpentSeconds: number }>
  >(() => {
    return article.progress?.sectionProgress ?? {};
  });

  const activeTimeSpentRef = useRef(0);
  const maxScrollPercentRef = useRef(0);
  const contentContainerRef = useRef<HTMLDivElement | null>(null);

  // Zyra selection hooks & state
  const { openExplain, openChatWithQuestion } = useTutor();
  const selectionAskEnabled = isZyraSelectionAskEnabled();
  const [selectedText, setSelectedText] = useState("");
  const [selectionCoords, setSelectionCoords] = useState<{ top: number; left: number } | null>(null);

  // Sync URL when section changes
  const navigateToSection = useCallback(
    (section: PublicSectionReadModel) => {
      const url = `${pathname}?section=${encodeURIComponent(section.slug)}`;
      router.push(url, { scroll: false });
      setIsMobileSheetOpen(false);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    },
    [pathname, router],
  );

  const openSearchResult = useCallback((section: PublicSectionReadModel, query: string) => {
    navigateToSection(section);
    setTemporaryHighlight(query);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setTemporaryHighlight(null), 3000);
  }, [navigateToSection]);

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  // Report progress to server
  const sendProgressUpdate = useCallback(
    async (
      sectionId: string,
      percent: number,
      timeSpent: number,
      markCompleted?: boolean,
    ) => {
      try {
        const res = await fetch(`/api/student/articles/${article.id}/progress`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionId,
            percent: Math.round(percent),
            timeSpentSeconds: Math.round(timeSpent),
            completed: markCompleted,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setSectionProgressMap((prev) => ({
            ...prev,
            [sectionId]: {
              maxReadPercent: data.maxReadPercent,
              completed: data.completed,
              timeSpentSeconds: data.timeSpentSeconds,
            },
          }));
        }
      } catch {}
    },
    [article.id],
  );

  // Reset scroll & timer tracking on active section change
  useEffect(() => {
    activeTimeSpentRef.current = 0;
    maxScrollPercentRef.current = 0;

    const interval = setInterval(() => {
      activeTimeSpentRef.current += 1;
    }, 1000);

    return () => {
      clearInterval(interval);
      if (activeSection && activeTimeSpentRef.current > 2) {
        sendProgressUpdate(
          activeSection.id,
          maxScrollPercentRef.current,
          activeTimeSpentRef.current,
        );
      }
    };
  }, [activeSection, sendProgressUpdate]);

  // Scroll listener to track read percentage within the active section
  useEffect(() => {
    const handleScroll = () => {
      const el = contentContainerRef.current;
      if (!el || !activeSection) return;

      const rect = el.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const totalHeight = rect.height;

      if (totalHeight <= 0) return;

      const scrolledPast = Math.max(0, windowHeight - rect.top);
      const percent = Math.min(100, Math.max(0, Math.round((scrolledPast / totalHeight) * 100)));

      if (percent > maxScrollPercentRef.current) {
        maxScrollPercentRef.current = percent;

        // Auto mark at 90%
        if (percent >= 90) {
          const currentProg = sectionProgressMap[activeSection.id];
          if (!currentProg?.completed) {
            sendProgressUpdate(
              activeSection.id,
              percent,
              activeTimeSpentRef.current,
              true,
            );
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeSection, sectionProgressMap, sendProgressUpdate]);

  // Selection change listener for selection-to-Zyra
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setSelectedText("");
        setSelectionCoords(null);
        return;
      }

      const text = selection.toString().trim();
      const anchorNode = selection.anchorNode;
      if (!anchorNode) return;

      const container = contentContainerRef.current;
      if (!container || !container.contains(anchorNode)) {
        setSelectedText("");
        setSelectionCoords(null);
        return;
      }

      if (text.length < 3) {
        setSelectedText("");
        setSelectionCoords(null);
        return;
      }

      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelectionCoords({
          top: rect.top - 48,
          left: rect.left + rect.width / 2,
        });
        setSelectedText(text);
      } catch {
        // Safe fallback
      }
    };

    const handleWindowScroll = () => {
      setSelectedText("");
      setSelectionCoords(null);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("scroll", handleWindowScroll, true);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("scroll", handleWindowScroll, true);
    };
  }, []);

  const handleAskZyra = () => {
    if (!selectedText) return;
    const selection = normalizeZyraSelection(selectedText);
    window.getSelection()?.removeAllRanges();
    setSelectedText("");
    setSelectionCoords(null);

    const sectionTitle = activeSection ? activeSection.title : "";
    const question = `Kutipan dari materi "${article.title}" (${sectionTitle}): "${selection}"\n\nJelaskan bagian ini secara bertahap dan berikan contoh konkret.`;

    if (selectionAskEnabled && selection.length >= 3) {
      openChatWithQuestion(question);
    } else {
      openExplain("ko-article", "content");
    }
  };

  // Compute live search matches
  const searchResults = useMemo(() => {
    return searchArticleContent(article.sections, searchQuery);
  }, [article.sections, searchQuery]);

  // Overall reading progress calculation
  const totalSections = article.sections.length || 1;
  const completedCount = useMemo(() => {
    return article.sections.filter((s) => {
      const p = sectionProgressMap[s.id];
      return p?.completed || (p?.maxReadPercent ?? 0) >= 90;
    }).length;
  }, [article.sections, sectionProgressMap]);

  const overallPercent = Math.min(100, Math.round((completedCount / totalSections) * 100));

  // Contextual prev and next sections
  const prevSection = activeIndex > 0 ? article.sections[activeIndex - 1] : null;
  const nextSection =
    activeIndex < article.sections.length - 1 ? article.sections[activeIndex + 1] : null;

  const handleNextSection = () => {
    if (activeSection) {
      sendProgressUpdate(
        activeSection.id,
        Math.max(90, maxScrollPercentRef.current),
        activeTimeSpentRef.current,
        true,
      );
    }
    if (nextSection) {
      navigateToSection(nextSection);
    }
  };

  const handlePrevSection = () => {
    if (prevSection) {
      navigateToSection(prevSection);
    }
  };

  const handleFinishArticle = () => {
    if (activeSection) {
      sendProgressUpdate(
        activeSection.id,
        100,
        activeTimeSpentRef.current,
        true,
      );
    }
    router.push(`/courses/${article.courseId}/material`);
  };

  const courseTitle = course?.title || "Materi Kuliah";

  const renderTocContent = () => (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-3 border-b border-border/70">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Cari dalam artikel"
            placeholder="Cari dalam artikel"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full pl-8 pr-8 text-body-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Hapus pencarian"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* List items: Search results or TOC list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {searchQuery.trim().length >= 2 ? (
          <div>
            <p className="px-2 py-1 text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Hasil Pencarian ({searchResults.length})
            </p>
            {searchResults.length === 0 ? (
              <p className="text-body-xs text-muted-foreground px-2 py-3 text-center">
                Tidak ada teks yang cocok dengan &quot;{searchQuery}&quot;
              </p>
            ) : (
              <div className="space-y-1.5 mt-1">
                {searchResults.map((res, idx) => {
                  const targetSec = article.sections.find((s) => s.id === res.sectionId);
                  const isCurrent = activeSection?.id === res.sectionId;
                  return (
                    <button
                      key={`${res.sectionId}-${idx}`}
                      type="button"
                      onClick={() => targetSec && openSearchResult(targetSec, searchQuery)}
                      className={cn(
                        "w-full text-left p-2.5 rounded-lg border transition-colors text-body-xs",
                        isCurrent
                          ? "border-primary/40 bg-primary/10 text-primary font-medium"
                          : "border-border/60 hover:bg-muted/60 text-foreground",
                      )}
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-body-xs font-semibold text-muted-foreground">
                        <span>Bagian {res.sectionNumber}</span>
                        <span>·</span>
                        <span className="capitalize">{res.matchType}</span>
                      </div>
                      <p className="font-semibold line-clamp-1">{res.sectionTitle}</p>
                      <p className="mt-0.5 line-clamp-2 text-body-xs font-normal text-muted-foreground">
                        {res.snippet}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between px-2 py-1 mb-1">
              <span className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Daftar Bagian
              </span>
              <span className="text-body-xs font-semibold text-muted-foreground">
                {completedCount}/{totalSections} selesai
              </span>
            </div>

            <div className="space-y-1">
              {article.sections.map((section) => {
                const isCurrent = activeSection?.id === section.id;
                const prog = sectionProgressMap[section.id];
                const isDone = prog?.completed || (prog?.maxReadPercent ?? 0) >= 90;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => navigateToSection(section)}
                    className={cn(
                      "w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-start gap-2.5",
                      isCurrent
                        ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
                        : "hover:bg-muted/60 text-foreground",
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-status-success" />
                      ) : isCurrent ? (
                        <Circle className="size-4 text-primary fill-primary/20" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center justify-between gap-1 text-body-xs text-muted-foreground">
                        <span className="font-semibold">Bagian {section.sectionNumber}</span>
                        <span>{section.estimatedReadingMinutes} mnt</span>
                      </div>
                      <p className="text-body-xs font-semibold line-clamp-2 leading-snug">
                        {section.title}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Sticky Reader Header */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-2.5 gap-3 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="gap-1.5 text-body-xs font-semibold text-muted-foreground hover:text-foreground shrink-0"
            >
              <Link href={`/courses/${article.courseId}/material`}>
                <ArrowLeft className="size-4" />
                <span className="hidden sm:inline">Kembali ke Materi</span>
              </Link>
            </Button>
            <div className="h-4 w-px bg-border shrink-0 hidden sm:block" />
            <div className="min-w-0">
              <p className="truncate text-body-xs font-medium text-muted-foreground">
                {courseTitle}
              </p>
              <h1 className="text-body-sm font-bold text-foreground truncate font-heading">
                {article.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Progress indicator */}
            <div className="hidden md:flex items-center gap-2 text-body-xs text-muted-foreground">
              <div className="w-24 h-2 rounded-md bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-md"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
              <span className="text-body-xs font-semibold text-foreground">{overallPercent}%</span>
            </div>

            {/* Mobile Sheet Trigger */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsMobileSheetOpen(true)}
              className="md:hidden gap-1.5 text-body-xs"
            >
              <Menu className="size-4" />
              <span>Daftar Isi</span>
            </Button>

            {/* Desktop TOC Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTocOpen(!isTocOpen)}
              className="hidden md:flex gap-1.5 text-body-xs"
            >
              {isTocOpen ? (
                <>
                  <PanelLeftClose className="size-4" />
                  <span>Sembunyikan Menu</span>
                </>
              ) : (
                <>
                  <PanelLeft className="size-4" />
                  <span>Buka Menu</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Thin progress bar for top header */}
        <div className="w-full h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </header>

      {/* Mobile Sheet for TOC & Search */}
      <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
        <SheetContent side="left" className="w-[300px] sm:w-[360px] p-0 flex flex-col">
          <SheetHeader className="p-4 border-b border-border/80">
            <SheetTitle className="text-body-sm font-bold font-heading">
              {article.title}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">{renderTocContent()}</div>
        </SheetContent>
      </Sheet>

      {/* Main Layout Body */}
      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Desktop Collapsible Sidebar */}
        {isTocOpen && (
          <aside className="hidden md:block w-72 lg:w-80 shrink-0 border-r border-border/80 h-[calc(100vh-53px)] sticky top-[53px] overflow-hidden bg-card/40">
            {renderTocContent()}
          </aside>
        )}

        {/* Main Content Area (75 character measure) */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8">
          {activeSection ? (
            <article
              ref={contentContainerRef}
              id="article-reading-content"
              className={cn("max-w-[75ch] mx-auto space-y-6 rounded-lg", temporaryHighlight && "ring-2 ring-status-warning/60 ring-offset-4 ring-offset-background")}
            >
              {temporaryHighlight ? (
                <div role="status" className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-body-sm text-foreground">
                  Menampilkan hasil untuk <span className="font-semibold">{temporaryHighlight}</span>. Sorotan akan hilang otomatis.
                </div>
              ) : null}
              <StructuredArticleSectionContent
                section={activeSection}
                completed={sectionProgressMap[activeSection.id]?.completed}
              />

              {/* Contextual Bottom Navigation */}
              <div className="pt-8 border-t border-border/80 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {prevSection ? (
                    <Button
                      variant="outline"
                      onClick={handlePrevSection}
                      className="justify-start text-left h-auto py-3 px-4 rounded-lg border-border hover:bg-muted/60"
                    >
                      <ChevronLeft className="size-4 mr-2 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Bagian Sebelumnya
                        </p>
                        <p className="text-body-xs font-semibold text-foreground truncate mt-0.5">
                          {prevSection.sectionNumber}. {prevSection.title}
                        </p>
                      </div>
                    </Button>
                  ) : (
                    <div />
                  )}

                  {nextSection ? (
                    <Button
                      variant="default"
                      onClick={handleNextSection}
                      className="justify-between text-right h-auto py-3 px-4 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
                    >
                      <div className="min-w-0 text-left">
                        <p className="text-body-xs font-bold uppercase tracking-wider opacity-80">
                          Bagian Berikutnya
                        </p>
                        <p className="text-body-xs font-semibold truncate mt-0.5">
                          {nextSection.sectionNumber}. {nextSection.title}
                        </p>
                      </div>
                      <ChevronRight className="size-4 ml-2 shrink-0" />
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      onClick={handleFinishArticle}
                      className="justify-center text-center h-auto py-3 px-4 rounded-lg bg-status-success hover:bg-status-success/95 text-white font-bold"
                    >
                      <CheckCircle2 className="size-4 mr-2 shrink-0" />
                      <span>Selesai Membaca Artikel</span>
                    </Button>
                  )}
                </div>

                <div className="pt-2 text-center text-body-xs text-muted-foreground">
                  Bagian {activeIndex + 1} dari {totalSections} · Terbaca {overallPercent}%
                </div>
              </div>
            </article>
          ) : (
            <div className="max-w-[75ch] mx-auto text-center py-16 space-y-4">
              <BookOpen className="size-12 text-muted-foreground mx-auto" />
              <h2 className="text-body-lg font-bold">Tidak ada konten bagian</h2>
              <p className="text-body-sm text-muted-foreground">
                Artikel ini belum memiliki bagian materi yang diterbitkan.
              </p>
              <Button asChild variant="outline">
                <Link href={`/courses/${article.courseId}/material`}>
                  Kembali ke Daftar Materi
                </Link>
              </Button>
            </div>
          )}
        </main>
      </div>

      {/* Floating Selection-to-Zyra popover */}
      {selectionCoords && selectedText && (
        <div
          style={{
            position: "fixed",
            top: `${selectionCoords.top}px`,
            left: `${selectionCoords.left}px`,
            transform: "translateX(-50%)",
            zIndex: 9999,
          }}
          className="animate-fade-in"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="relative">
            <Button
              type="button"
              size="sm"
              className="rounded-lg bg-brand-primary hover:bg-brand-primary/95 shadow-md flex items-center gap-1.5 h-8 font-sans text-body-xs font-semibold !text-white px-3 border border-brand-primary/20"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAskZyra();
              }}
            >
              <ZyraMark className="size-4" />
              Tanya Zyra
            </Button>
            <button
              type="button"
              onClick={() => {
                window.getSelection()?.removeAllRanges();
                setSelectedText("");
                setSelectionCoords(null);
              }}
              className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-border hover:text-foreground shadow-sm transition-colors"
              aria-label="Tutup popover"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
