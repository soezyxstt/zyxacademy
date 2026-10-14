"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Compass,
  ChevronRight,
  PanelRightClose,
  PanelRight,
  Search,
  X,
  AlertTriangle,
  HelpCircle,
  Brain,
  Calculator,
  Sigma,
  BookOpenCheck,
  Layers,
  BookmarkCheck,
  Award,
  FileText,
  AlignLeft,
  Menu,
  Maximize2,
  Minimize2,
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
import { isZyraSelectionAskEnabled, normalizeZyraSelection } from "@/lib/zyra/murid";
import {
  type PublicArticleReadModel,
  type PublicSectionReadModel,
  resolveActiveSection,
  searchArticleContent,
} from "@/lib/articles/structured-read-model";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";
import {
  ProductWorkedExample,
  ProductFormativeCheck,
  ProductLearningTimeBadge,
} from "@/components/course/product-learning-blocks";
import { formatReaderTocTitle } from "@/lib/materials/reader-toc";
import { isLearnerReaderMode, type MaterialReaderMode } from "@/lib/materials/reader-mode";

export interface StructuredArticleReaderProps {
  article: PublicArticleReadModel;
  course?: { id?: string; title: string } | null;
  mode?: MaterialReaderMode;
  backHref?: string;
  isTocOpen?: boolean;
  onToggleToc?: () => void;
  isMobileSheetOpen?: boolean;
  onToggleMobileSheet?: (open: boolean) => void;
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
        containerClass: "border-l-4 border-l-status-warning border-t border-r border-b border-border/60 bg-status-warning/[0.03]",
        badgeClass: "text-status-warning bg-status-warning/10",
      };
    case "prior_knowledge_activation":
      return {
        label: "Aktivasi Pengetahuan Awal",
        icon: BookOpenCheck,
        containerClass: "border-l-4 border-l-primary/60 border-t border-r border-b border-border/60 bg-primary/[0.03]",
        badgeClass: "text-primary bg-primary/10",
      };
    case "verbal_representation":
      return {
        label: "Representasi Konseptual",
        icon: AlignLeft,
        containerClass: "",
        badgeClass: "text-primary bg-primary/10",
      };
    case "mathematical_representation":
      return {
        label: "Representasi Matematis",
        icon: Calculator,
        containerClass: "",
        badgeClass: "text-status-success bg-status-success/10",
      };
    case "analogy":
      return {
        label: "Analogi dan Intuisi",
        icon: Sigma,
        containerClass: "border-l-4 border-l-status-warning/70 border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-status-warning bg-status-warning/10",
      };
    case "worked_example":
      return {
        label: "Contoh dan Pembahasan",
        icon: BookOpen,
        containerClass: "border-l-4 border-l-status-success border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-status-success bg-status-success/10",
      };
    case "misconception":
      return {
        label: "Miskonsepsi Umum",
        icon: AlertTriangle,
        containerClass: "border-l-4 border-l-status-error border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-status-error bg-status-error/10",
      };
    case "application":
      return {
        label: "Aplikasi dan Penerapan",
        icon: FileText,
        containerClass: "border-l-4 border-l-primary/60 border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-primary bg-primary/10",
      };
    case "retrieval_prompt":
      return {
        label: "Cek Pemahaman",
        icon: Brain,
        containerClass: "border-l-4 border-l-status-warning border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-status-warning bg-status-warning/10",
      };
    case "cross_idea_synthesis":
      return {
        label: "Sintesis Antarkonsep",
        icon: Layers,
        containerClass: "border-l-4 border-l-primary/60 border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-primary bg-primary/10",
      };
    case "summary":
      return {
        label: "Ringkasan Bagian",
        icon: BookmarkCheck,
        containerClass: "border-l-4 border-l-border border-t border-r border-b border-border/70 bg-muted/25",
        badgeClass: "text-muted-foreground bg-muted",
      };
    case "retrieval_close":
      return {
        label: "Refleksi Akhir",
        icon: Award,
        containerClass: "border-l-4 border-l-status-success border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-status-success bg-status-success/10",
      };
    case "explanation":
    default:
      return {
        label: "Penjelasan",
        icon: AlignLeft,
        containerClass: "",
        badgeClass: "text-muted-foreground bg-muted",
      };
  }
}

function BlockVisuals({ visuals }: { visuals?: PublicSectionReadModel["visuals"] }) {
  if (!visuals || visuals.length === 0) return null;
  return (
    <div className="space-y-4 pt-2">
      {visuals.map((visual) => (
        <ProductLearningVisual key={visual.id} spec={visual} />
      ))}
    </div>
  );
}

export function StructuredArticleSectionContent({
  section,
  articleId,
  articleVersion,
  completed = false,
  showProgress = true,
}: {
  section: PublicSectionReadModel;
  articleId: string;
  articleVersion: number;
  completed?: boolean;
  showProgress?: boolean;
}) {
  return (
    <>
      <header className="space-y-3 border-b border-border/80 pb-5">
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
        <h2 className="font-heading text-h4 font-bold tracking-tight text-foreground sm:text-h3">
          {section.title}
        </h2>

        {/* Learning Time Estimate Heuristics */}
        {section.learningTimeEstimate ? (
          <ProductLearningTimeBadge
            timeEstimate={section.learningTimeEstimate}
            className="w-fit"
          />
        ) : null}

        {section.learningObjective ? (
          <div className="mt-4 rounded-r-lg border-l-4 border-primary/60 border-t border-r border-b border-border/60 bg-primary/[0.03] p-4 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <Compass className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <h3 className="text-body-xs font-bold uppercase tracking-wider text-primary">
                  Tujuan belajar
                </h3>
                <p className="mt-1 text-body-sm leading-relaxed text-foreground">
                  {section.learningObjective}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      {/* Typed Visuals */}
      {section.visuals && section.visuals.length > 0 ? (
        <div className="space-y-4 py-2">
          {section.visuals.map((visual) => (
            <ProductLearningVisual key={visual.id} spec={visual} />
          ))}
        </div>
      ) : null}

      <div className="space-y-6 py-2">
        {section.blocks.map((block, blockIndex) => {
          if (block.blockType === "worked_example" && block.workedExample) {
            return (
              <div
                key={block.id || blockIndex}
                id={block.id ? `block-${block.id}` : undefined}
                className="scroll-mt-24"
              >
                <ProductWorkedExample
                  title={block.title}
                  content={block.content}
                  workedExample={block.workedExample}
                />
                <BlockVisuals visuals={block.visuals} />
              </div>
            );
          }

          if (
            (block.blockType === "retrieval_prompt" || block.blockType === "retrieval_close") &&
            block.formativeCheck
          ) {
            return (
              <div
                key={block.id || blockIndex}
                id={block.id ? `block-${block.id}` : undefined}
                className="scroll-mt-24"
              >
                <ProductFormativeCheck
                  title={block.title}
                  content={block.content}
                  formativeCheck={block.formativeCheck}
                  locator={{
                    articleId,
                    articleVersion,
                    sectionId: section.id,
                    blockId: block.id,
                  }}
                />
                <BlockVisuals visuals={block.visuals} />
              </div>
            );
          }

          const meta = getBlockMetadata(block.blockType);
          const Icon = meta.icon;
          const genericFormulaTitle = block.blockType === "mathematical_representation" && block.title === "Rumus dan syarat";
          const genericSymbolTitle = block.blockType === "verbal_representation" && block.title === "Simbol, syarat, dan makna";
          const displayTitle = genericFormulaTitle || genericSymbolTitle
            ? null
            : block.title === "Penjelasan inti" ? "Teori" : block.title || meta.label;

          const isCoreDocument =
            block.blockType === "explanation" ||
            block.blockType === "verbal_representation" ||
            block.blockType === "mathematical_representation";

          if (isCoreDocument) {
            return (
              <div
                key={block.id || blockIndex}
                id={block.id ? `block-${block.id}` : undefined}
                className={cn(
                  "space-y-3 py-1 scroll-mt-24",
                  block.blockType === "mathematical_representation" && "space-y-2",
                )}
              >
                {displayTitle &&
                displayTitle !== section.title &&
                displayTitle !== "Penjelasan" &&
                displayTitle !== "Representasi Konseptual" &&
                displayTitle !== "Representasi Matematis" ? (
                  <h3 className="font-heading text-h5 font-bold tracking-tight text-foreground pt-3">
                    {displayTitle}
                  </h3>
                ) : null}
                <div className="text-body-base leading-relaxed text-foreground">
                  <MarkdownRenderer content={block.content} density="default" />
                </div>
                <BlockVisuals visuals={block.visuals} />
              </div>
            );
          }

          return (
            <div
              key={block.id || blockIndex}
              id={block.id ? `block-${block.id}` : undefined}
              className={cn(
                "rounded-r-lg p-4 sm:p-5 space-y-3 shadow-xs my-3 scroll-mt-24",
                meta.containerClass,
              )}
            >
              <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md",
                      meta.badgeClass,
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <h3 className="font-heading text-body-sm font-bold text-foreground">
                    {displayTitle}
                  </h3>
                </div>
              </div>
              <div className="text-body-base leading-relaxed text-foreground">
                <MarkdownRenderer content={block.content} density="compact" />
              </div>
              <BlockVisuals visuals={block.visuals} />
            </div>
          );
        })}
      </div>
    </>
  );
}

export function StructuredArticleReader({
  article,
  course,
  mode = "learner",
  backHref,
  isTocOpen: controlledTocOpen,
  onToggleToc: controlledToggleToc,
  isMobileSheetOpen: controlledMobileSheetOpen,
  onToggleMobileSheet: controlledToggleMobileSheet,
}: StructuredArticleReaderProps) {
  const learnerMode = isLearnerReaderMode(mode);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Active section resolution
  const requestedSlug = searchParams.get("section");
  const [activeSectionSlug, setActiveSectionSlug] = useState<string>(
    () => requestedSlug || article.progress?.lastSectionSlug || article.sections[0]?.slug || "",
  );
  const activeSectionSlugRef = useRef(activeSectionSlug);
  useEffect(() => {
    activeSectionSlugRef.current = activeSectionSlug;
  }, [activeSectionSlug]);

  const activeSection = useMemo(() => {
    return (
      resolveActiveSection(
        article.sections,
        activeSectionSlug || requestedSlug,
        article.progress?.lastSectionSlug,
      ) ??
      article.sections[0] ??
      null
    );
  }, [article.sections, activeSectionSlug, requestedSlug, article.progress?.lastSectionSlug]);

  const activeIndex = useMemo(() => {
    if (!activeSection) return 0;
    const idx = article.sections.findIndex((s) => s.id === activeSection.id);
    return idx >= 0 ? idx : 0;
  }, [article.sections, activeSection]);

  // TOC sidebar & mobile sheet states
  const [internalTocOpen, setInternalTocOpen] = useState(true);
  const [internalMobileSheetOpen, setInternalMobileSheetOpen] = useState(false);

  const isTocOpen = controlledTocOpen !== undefined ? controlledTocOpen : internalTocOpen;
  const isMobileSheetOpen =
    controlledMobileSheetOpen !== undefined ? controlledMobileSheetOpen : internalMobileSheetOpen;
  const setIsMobileSheetOpen = controlledToggleMobileSheet ?? setInternalMobileSheetOpen;

  const [searchQuery, setSearchQuery] = useState("");
  const [temporaryHighlight, setTemporaryHighlight] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus mode state & refs
  const [isFocusMode, setIsFocusMode] = useState(false);
  const focusButtonRef = useRef<HTMLButtonElement | null>(null);
  const exitFocusButtonRef = useRef<HTMLButtonElement | null>(null);

  const enterFocusMode = useCallback(() => {
    setIsFocusMode(true);
    setTimeout(() => {
      exitFocusButtonRef.current?.focus();
    }, 50);
  }, []);

  const exitFocusMode = useCallback(() => {
    setIsFocusMode(false);
    setTimeout(() => {
      focusButtonRef.current?.focus();
    }, 50);
  }, []);

  useEffect(() => {
    if (!isFocusMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exitFocusMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFocusMode, exitFocusMode]);

  // Reading progress tracking state
  const [sectionProgressMap, setSectionProgressMap] = useState<
    Record<string, { maxReadPercent: number; completed: boolean; timeSpentSeconds: number }>
  >(() => {
    return article.progress?.sectionProgress ?? {};
  });

  const activeTimeSpentRef = useRef(0);
  const maxScrollPercentRef = useRef(0);
  const contentContainerRef = useRef<HTMLDivElement | null>(null);
  const completedSectionsSentRef = useRef<Set<string>>(new Set());

  // Initialize completed sections set from article progress
  useEffect(() => {
    const initProg = article.progress?.sectionProgress;
    if (initProg) {
      for (const [id, p] of Object.entries(initProg)) {
        if (p.completed || (p.maxReadPercent ?? 0) >= 90) {
          completedSectionsSentRef.current.add(id);
        }
      }
    }
  }, [article.progress]);

  // Zyra selection hooks & state
  const { openExplain, openChatWithQuestion } = useTutor();
  const selectionAskEnabled = isZyraSelectionAskEnabled();
  const [selectedText, setSelectedText] = useState("");
  const [selectionCoords, setSelectionCoords] = useState<{ top: number; left: number } | null>(null);

  // Smooth scroll to section
  const navigateToSection = useCallback(
    (section: PublicSectionReadModel) => {
      setActiveSectionSlug(section.slug);
      setIsMobileSheetOpen(false);
      const el = document.getElementById(`section-${section.slug}`);
      if (el) {
        const reduceMotion =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("section", section.slug);
        window.history.replaceState(null, "", url.toString());
      } catch {}
    },
    [],
  );

  const navigateToBlock = useCallback(
    (blockId: string) => {
      setIsMobileSheetOpen(false);
      const el = document.getElementById(`block-${blockId}`);
      if (el) {
        const reduceMotion =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    },
    [],
  );

  // Initial scroll effect if a specific section was opened via URL
  const initialScrolledRef = useRef(false);
  useEffect(() => {
    if (initialScrolledRef.current) return;
    const targetSlug = requestedSlug || article.progress?.lastSectionSlug;
    if (targetSlug) {
      const el = document.getElementById(`section-${targetSlug}`);
      if (el) {
        initialScrolledRef.current = true;
        const reduceMotion =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        setTimeout(() => {
          el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        }, 80);
      }
    }
  }, [requestedSlug, article.progress?.lastSectionSlug]);

  // Scroll spy IntersectionObserver for location awareness in continuous reading
  useEffect(() => {
    if (!article.sections.length) return;
    const sectionElements = article.sections
      .map((s) => document.getElementById(`section-${s.slug}`))
      .filter(Boolean) as HTMLElement[];

    if (!sectionElements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((e) => e.isIntersecting);
        if (intersecting.length > 0) {
          const sorted = intersecting.sort((a, b) => {
            return Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top);
          });
          const currentSlug = sorted[0].target.getAttribute("data-section-slug");
          if (currentSlug && currentSlug !== activeSectionSlugRef.current) {
            activeSectionSlugRef.current = currentSlug;
            setActiveSectionSlug(currentSlug);
            try {
              const url = new URL(window.location.href);
              url.searchParams.set("section", currentSlug);
              window.history.replaceState(null, "", url.toString());
            } catch {}
          }
        }
      },
      {
        root: null,
        rootMargin: "-15% 0px -60% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 0.75],
      },
    );

    for (const el of sectionElements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [article.sections]);

  const openSearchResult = useCallback(
    (section: PublicSectionReadModel, query: string, blockId?: string) => {
      navigateToSection(section);
      if (blockId) {
        setTimeout(() => navigateToBlock(blockId), 150);
      }
      setTemporaryHighlight(query);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setTemporaryHighlight(null), 3000);
    },
    [navigateToSection, navigateToBlock],
  );

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
      if (!learnerMode) return;
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
    [article.id, learnerMode],
  );

  // Reset scroll & timer tracking on active section change
  useEffect(() => {
    if (!learnerMode) return;
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
  }, [activeSection, learnerMode, sendProgressUpdate]);

  // Manual section completion helper
  const markSectionCompleted = useCallback(
    (sectionId: string) => {
      completedSectionsSentRef.current.add(sectionId);
      setSectionProgressMap((prev) => ({
        ...prev,
        [sectionId]: {
          maxReadPercent: Math.max(prev[sectionId]?.maxReadPercent ?? 0, 100),
          completed: true,
          timeSpentSeconds:
            (prev[sectionId]?.timeSpentSeconds ?? 0) +
            (activeSection?.id === sectionId ? activeTimeSpentRef.current : 5),
        },
      }));
      sendProgressUpdate(
        sectionId,
        100,
        activeSection?.id === sectionId ? activeTimeSpentRef.current : 5,
        true,
      );
    },
    [activeSection, sendProgressUpdate],
  );

  // Scroll listener to track read percentage and completion across all sections in continuous flow
  useEffect(() => {
    if (!learnerMode) return;
    const handleScroll = () => {
      const el = contentContainerRef.current;
      if (!el) return;

      const windowHeight = window.innerHeight;

      for (const sec of article.sections) {
        const sectionEl = document.getElementById(`section-${sec.slug}`);
        if (!sectionEl) continue;

        const rect = sectionEl.getBoundingClientRect();
        const totalHeight = rect.height;
        if (totalHeight <= 0) continue;

        const scrolledPast = Math.max(0, windowHeight - rect.top);
        const percent = Math.min(100, Math.max(0, Math.round((scrolledPast / totalHeight) * 100)));

        // Read through if 85%+ scrolled or bottom is near upper viewport
        const isReadThrough =
          percent >= 85 || (rect.bottom <= windowHeight * 0.85 && rect.top < windowHeight * 0.4);

        if (isReadThrough) {
          if (!completedSectionsSentRef.current.has(sec.id)) {
            completedSectionsSentRef.current.add(sec.id);
            setSectionProgressMap((prev) => ({
              ...prev,
              [sec.id]: {
                maxReadPercent: Math.max(prev[sec.id]?.maxReadPercent ?? 0, 100),
                completed: true,
                timeSpentSeconds:
                  (prev[sec.id]?.timeSpentSeconds ?? 0) +
                  (activeSection?.id === sec.id ? activeTimeSpentRef.current : 5),
              },
            }));
            sendProgressUpdate(
              sec.id,
              100,
              activeSection?.id === sec.id ? activeTimeSpentRef.current : 5,
              true,
            );
          }
        } else if (activeSection?.id === sec.id && percent > maxScrollPercentRef.current) {
          maxScrollPercentRef.current = percent;
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeSection, article.sections, learnerMode, sendProgressUpdate]);

  // Selection change listener for selection-to-Zyra
  useEffect(() => {
    if (!learnerMode) return;
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
  }, [learnerMode]);

  const handleAskZyra = () => {
    if (!learnerMode) return;
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
    if (learnerMode) {
      for (const sec of article.sections) {
        if (!completedSectionsSentRef.current.has(sec.id)) {
          completedSectionsSentRef.current.add(sec.id);
          sendProgressUpdate(sec.id, 100, 5, true);
        }
      }
    }
    router.push(backHref ?? `/courses/${article.courseId}/material`);
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
                      <p className="font-semibold line-clamp-1">
                        {formatReaderTocTitle(res.sectionTitle)}
                      </p>
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
                Bab Ini
              </span>
              <span className="text-body-xs font-semibold text-muted-foreground">
                {completedCount}/{totalSections} selesai
              </span>
            </div>

            <div className="space-y-1">
              {article.sections.map((section) => {
                const isCurrent = activeSectionSlug === section.slug;
                const prog = sectionProgressMap[section.id];
                const isDone = prog?.completed || (prog?.maxReadPercent ?? 0) >= 90;

                return (
                  <div key={section.id} className="space-y-0.5">
                    <button
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
                      <div className="min-w-0 flex-1 py-0.5">
                        <p className="text-body-xs font-semibold line-clamp-2 leading-snug">
                          {formatReaderTocTitle(section.title)}
                        </p>
                      </div>
                    </button>

                    {/* Subheadings / Key blocks expanded only for active section */}
                    {isCurrent && section.blocks && section.blocks.length > 0 ? (
                      <div className="ml-6 pl-2.5 border-l border-primary/25 space-y-0.5 py-1">
                        {section.blocks
                          .filter(
                            (b) =>
                              b.title &&
                              b.title !== section.title &&
                              b.title.trim().length > 0 &&
                              b.title !== "Penjelasan" &&
                              b.title !== "Representasi Konseptual" &&
                              b.title !== "Representasi Matematis",
                          )
                          .map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => navigateToBlock(b.id)}
                              className="block w-full text-left text-body-2xs text-muted-foreground hover:text-foreground line-clamp-1 py-1 transition-colors"
                            >
                              {b.title}
                            </button>
                          ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full min-w-0 flex-1 bg-background text-foreground flex flex-col">
      {/* Sticky Reader Header / Focus Header - only rendered in learner mode */}
      {learnerMode &&
        (isFocusMode ? (
          <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-sm">
            <div className="flex items-center justify-between px-4 py-2.5 gap-3 max-w-4xl mx-auto w-full">
              <div className="flex items-center gap-2 min-w-0">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-body-xs font-semibold text-primary shrink-0">
                  Mode Fokus
                </span>
                <h1 className="text-body-sm font-bold text-foreground truncate font-heading">
                  {article.chapterNumber ? `Bab ${article.chapterNumber}: ` : ""}
                  {article.title}
                </h1>
              </div>
              <Button
                ref={exitFocusButtonRef}
                variant="outline"
                size="sm"
                onClick={exitFocusMode}
                className="gap-1.5 text-body-xs font-semibold shrink-0"
                aria-label="Keluar mode fokus"
              >
                <Minimize2 className="size-3.5" />
                <span>Keluar Fokus</span>
                <kbd className="hidden sm:inline rounded border border-border bg-muted px-1.5 py-0.5 text-body-2xs font-mono text-muted-foreground">
                  Esc
                </kbd>
              </Button>
            </div>
          </header>
        ) : (
          <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-sm">
            <div className="flex items-center justify-between px-4 py-2.5 gap-3 max-w-7xl mx-auto w-full">
              <div className="flex items-center gap-2 min-w-0">
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="gap-1.5 text-body-xs font-semibold text-muted-foreground hover:text-foreground shrink-0"
                >
                  <Link href={backHref ?? `/courses/${article.courseId}/material`}>
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
                    {article.chapterNumber ? `Bab ${article.chapterNumber}: ` : ""}
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

                {/* Focus Mode Trigger */}
                <Button
                  ref={focusButtonRef}
                  variant="outline"
                  size="sm"
                  onClick={enterFocusMode}
                  className="gap-1.5 text-body-xs"
                  aria-label="Masuk mode fokus"
                >
                  <Maximize2 className="size-3.5" />
                  <span className="hidden sm:inline">Mode Fokus</span>
                </Button>

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
                  onClick={controlledToggleToc ?? (() => setInternalTocOpen(!internalTocOpen))}
                  className="hidden md:flex gap-1.5 text-body-xs"
                >
                  {isTocOpen ? (
                    <>
                      <PanelRightClose className="size-4" />
                      <span>Sembunyikan Menu</span>
                    </>
                  ) : (
                    <>
                      <PanelRight className="size-4" />
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
        ))}

      {/* Mobile Sheet for TOC & Search */}
      <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
        <SheetContent side="right" className="w-[300px] sm:w-[360px] p-0 flex flex-col">
          <SheetHeader className="p-4 border-b border-border/80">
            <SheetTitle className="text-body-sm font-bold font-heading">
              {article.title}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">{renderTocContent()}</div>
        </SheetContent>
      </Sheet>

      {/* Main Layout Body */}
      <div className={cn("flex-1 flex w-full", isFocusMode && "max-w-4xl mx-auto")}>
        {/* Main Content Area (75 character measure) */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8 pb-32">
          {article.sections.length > 0 ? (
            <div
              ref={contentContainerRef}
              id="article-reading-content"
              className={cn(
                "max-w-[75ch] mx-auto space-y-10",
                temporaryHighlight && "ring-2 ring-status-warning/60 ring-offset-4 ring-offset-background",
              )}
            >
              {temporaryHighlight ? (
                <div role="status" className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-body-sm text-foreground">
                  Menampilkan hasil untuk <span className="font-semibold">{temporaryHighlight}</span>. Sorotan akan hilang otomatis.
                </div>
              ) : null}

              {article.sections.map((sec, secIdx) => {
                const isLast = secIdx === article.sections.length - 1;
                const isSecDone = Boolean(
                  sectionProgressMap[sec.id]?.completed ||
                  (sectionProgressMap[sec.id]?.maxReadPercent ?? 0) >= 90
                );
                return (
                  <React.Fragment key={sec.id}>
                    <article
                      id={`section-${sec.slug}`}
                      data-section-slug={sec.slug}
                      className="scroll-mt-20 space-y-6"
                    >
                      <StructuredArticleSectionContent
                        section={sec}
                        articleId={article.id}
                        articleVersion={article.version}
                        completed={isSecDone}
                      />
                    </article>

                    {!isLast ? (
                      <div className="py-10 my-4 flex items-center gap-4 text-muted-foreground/60">
                        <div className="h-px flex-1 bg-border/60" />
                        {isSecDone ? (
                          <div className="flex items-center gap-1.5 text-body-xs font-semibold px-3 py-1 rounded-md bg-status-success/10 border border-status-success/30 text-status-success">
                            <CheckCircle2 className="size-3.5" />
                            <span>Selesai {sec.sectionNumber}</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markSectionCompleted(sec.id)}
                            className="flex items-center gap-1.5 text-body-xs font-semibold px-3 py-1 rounded-md bg-muted/60 hover:bg-muted border border-border text-muted-foreground transition-colors cursor-pointer"
                          >
                            <Circle className="size-3.5" />
                            <span>Tandai selesai {sec.sectionNumber}</span>
                          </button>
                        )}
                        <div className="h-px flex-1 bg-border/60" />
                      </div>
                    ) : null}
                  </React.Fragment>
                );
              })}

              {/* End of chapter card */}
              <div className="mt-16 rounded-xl border border-border bg-card p-6 sm:p-8 text-center space-y-4 shadow-sm">
                <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-status-success/15 text-status-success">
                  <Award className="size-6" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-heading text-h5 font-bold text-foreground">
                    Bab Selesai
                  </h2>
                  <p className="text-body-sm text-muted-foreground max-w-md mx-auto">
                    Anda telah menyelesaikan seluruh materi dalam bab {article.title}.
                  </p>
                </div>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    variant="default"
                    size="lg"
                    onClick={handleFinishArticle}
                    className="rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
                  >
                    <span>Kembali ke Daftar Materi</span>
                    <ChevronRight className="size-4 ml-1.5" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-[75ch] mx-auto text-center py-16 space-y-4">
              <BookOpen className="size-12 text-muted-foreground mx-auto" />
              <h2 className="text-body-lg font-bold">Tidak ada konten bagian</h2>
              <p className="text-body-sm text-muted-foreground">
                Artikel ini belum memiliki bagian materi yang diterbitkan.
              </p>
              <Button asChild variant="outline">
                <Link href={backHref ?? `/courses/${article.courseId}/material`}>
                  Kembali ke Daftar Materi
                </Link>
              </Button>
            </div>
          )}
        </main>

        {/* Desktop Collapsible Table of Contents */}
        {!isFocusMode && isTocOpen && (
          <aside className="hidden md:block w-72 lg:w-80 shrink-0 border-l border-border/80 h-[calc(100vh-53px)] sticky top-[53px] overflow-hidden bg-card/40">
            {renderTocContent()}
          </aside>
        )}
      </div>

      {/* Floating Selection-to-Zyra popover */}
      {learnerMode && selectionCoords && selectedText && (
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
