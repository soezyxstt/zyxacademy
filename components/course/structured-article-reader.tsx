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
  ChevronLeft,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { useTutor } from "@/components/course/tutor-drawer";
import { isZyraSelectionAskEnabled, normalizeZyraSelection } from "@/lib/zyra/murid";
import { extractZyraSelection, type ZyraSelectionContext } from "@/lib/zyra/selection-serializer";
import { ZyraSelectionToolbar } from "@/components/course/zyra-selection-toolbar";
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
import { formatReaderTocTitle, resolveReaderBlockTitle } from "@/lib/materials/reader-toc";
import { isLearnerReaderMode, type MaterialReaderMode } from "@/lib/materials/reader-mode";

export interface MaterialNavigationItem {
  id: string;
  title: string;
  href: string;
}

export interface StructuredArticleReaderProps {
  article: PublicArticleReadModel;
  course?: { id?: string; title: string } | null;
  mode?: MaterialReaderMode;
  backHref?: string;
  prevMaterial?: MaterialNavigationItem | null;
  nextMaterial?: MaterialNavigationItem | null;
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

function getBlockTitle(block: PublicSectionReadModel["blocks"][number], sectionTitle: string) {
  const fallback = block.blockType === "worked_example" && block.workedExample
    ? "Contoh dan Pembahasan Bertahap"
    : block.formativeCheck ? "Cek Pemahaman Mandiri" : getBlockMetadata(block.blockType).label;
  return resolveReaderBlockTitle(block.title, fallback, sectionTitle);
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
          <div className="mt-3 border-l-2 border-primary/60 pl-3.5 py-1">
            <p className="text-body-base leading-relaxed text-muted-foreground">
              {section.learningObjective}
            </p>
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
                data-block-type="worked_example"
                data-block-title={block.title || "Contoh dan Pembahasan"}
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
                data-block-type={block.blockType}
                data-block-title={block.title || "Cek Pemahaman"}
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
          const displayTitle = getBlockTitle(block, section.title);

          const isCoreDocument =
            block.blockType === "explanation" ||
            block.blockType === "verbal_representation" ||
            block.blockType === "mathematical_representation";

          if (isCoreDocument) {
            return (
              <div
                key={block.id || blockIndex}
                id={block.id ? `block-${block.id}` : undefined}
                data-block-type={block.blockType}
                data-block-title={displayTitle || meta.label}
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
              data-block-type={block.blockType}
              data-block-title={displayTitle || meta.label}
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
  prevMaterial,
  nextMaterial,
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
  const { openExplain, openChatWithQuestion, isOpen: isTutorOpen } = useTutor();
  const selectionAskEnabled = isZyraSelectionAskEnabled();
  const [selectionContext, setSelectionContext] = useState<ZyraSelectionContext | null>(null);
  const [selectionCoords, setSelectionCoords] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [isSelectionToolbarOpen, setIsSelectionToolbarOpen] = useState(false);

  // Auto-collapse TOC ("BAB INI") on laptop screens when Zyra panel opens
  const tocWasOpenBeforeTutorRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (isTutorOpen) {
      const isConstrained = typeof window !== "undefined" && window.innerWidth < 1440;
      if (isConstrained && internalTocOpen) {
        tocWasOpenBeforeTutorRef.current = true;
        setInternalTocOpen(false);
      }
    } else if (tocWasOpenBeforeTutorRef.current) {
      setInternalTocOpen(true);
      tocWasOpenBeforeTutorRef.current = null;
    }
  }, [isTutorOpen, internalTocOpen]);

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

  // Selection listener for selection-to-Zyra toolbar using mouseup and keyup
  useEffect(() => {
    if (!learnerMode || !selectionAskEnabled) return;

    const handleMouseUp = (e: MouseEvent) => {
      // If clicking inside the popover itself, do not recalculate or close
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('[data-slot="popover-content"]') ||
        target?.closest('[data-slot="zyra-selection-anchor"]')
      ) {
        return;
      }

      // Defer slightly so browser finalizes the range selection
      requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const rawText = selection.toString().trim();
        if (!rawText || rawText.length < 2) return;

        const anchorNode = selection.anchorNode;
        if (!anchorNode || !contentContainerRef.current?.contains(anchorNode)) {
          return;
        }

        const extracted = extractZyraSelection(selection, article.title);
        if (!extracted || extracted.cleanText.length < 2) return;

        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            setSelectionCoords({
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            });
            setSelectionContext(extracted);
            setIsSelectionToolbarOpen(true);
          }
        } catch {
          // Safe fallback
        }
      });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift" || e.key.startsWith("Arrow")) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          const fakeEvent = new MouseEvent("mouseup");
          handleMouseUp(fakeEvent);
        }
      }
    };

    const container = contentContainerRef.current;
    if (container) {
      container.addEventListener("mouseup", handleMouseUp);
      container.addEventListener("keyup", handleKeyUp);
    }

    return () => {
      if (container) {
        container.removeEventListener("mouseup", handleMouseUp);
        container.removeEventListener("keyup", handleKeyUp);
      }
    };
  }, [learnerMode, selectionAskEnabled, article.title]);

  const handleToolbarOpenChange = (open: boolean) => {
    setIsSelectionToolbarOpen(open);
    if (!open) {
      setSelectionCoords(null);
      setSelectionContext(null);
    }
  };

  const handleAskZyra = (intent: string, customQuestion?: string) => {
    if (!learnerMode || !selectionContext) return;
    const currentContext = selectionContext;

    // Close the toolbar popover and clear selection
    handleToolbarOpenChange(false);
    window.getSelection()?.removeAllRanges();

    const sectionTitle = currentContext.sectionTitle || activeSection?.title || "";
    let questionText = customQuestion?.trim();
    if (!questionText) {
      if (intent === "example") {
        questionText = "Berikan contoh konkret atau latihan terkait materi ini.";
      } else if (intent === "step_by_step") {
        questionText = "Bedah langkah perhitungan ini secara bertahap dan jelaskan logikanya.";
      } else if (intent === "rationale") {
        questionText = "Kenapa metode atau cara ini yang digunakan pada langkah ini?";
      } else if (intent === "intuition") {
        questionText = "Apa intuisi dasar atau analogi di balik pernyataan ini?";
      } else if (intent === "define") {
        questionText = "Jelaskan definisi istilah atau simbol ini secara padat.";
      } else {
        questionText = `Bantu saya memahami bagian ini: "${currentContext.cleanText}".`;
      }
    }

    const quotedContext = {
      title: article.title,
      sectionTitle,
      snippet: currentContext.cleanText,
      blockType: currentContext.blockType,
      surroundingText: currentContext.surroundingText,
      intent: intent as any,
    };

    if (selectionAskEnabled && currentContext.cleanText.length >= 2) {
      openChatWithQuestion(questionText, quotedContext);
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

  const handleNextMaterial = () => {
    if (learnerMode) {
      for (const sec of article.sections) {
        if (!completedSectionsSentRef.current.has(sec.id)) {
          completedSectionsSentRef.current.add(sec.id);
          sendProgressUpdate(sec.id, 100, 5, true);
        }
      }
    }
    if (nextMaterial?.href) {
      router.push(nextMaterial.href);
    }
  };

  const handlePrevMaterial = () => {
    if (learnerMode) {
      for (const sec of article.sections) {
        if (!completedSectionsSentRef.current.has(sec.id)) {
          completedSectionsSentRef.current.add(sec.id);
          sendProgressUpdate(sec.id, 100, 5, true);
        }
      }
    }
    if (prevMaterial?.href) {
      router.push(prevMaterial.href);
    }
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
                const subheadings = section.blocks.map(block => ({ block, title: getBlockTitle(block, section.title) })).filter(item => item.title);

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
                    {isCurrent && subheadings.length > 0 ? (
                      <div className="ml-6 pl-2.5 border-l border-primary/25 space-y-0.5 py-1">
                        {subheadings.map(({ block: b, title }) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => navigateToBlock(b.id)}
                              className="block w-full text-left text-body-2xs text-muted-foreground hover:text-foreground line-clamp-1 py-1 transition-colors"
                            >
                              {title}
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
            <div className="flex items-center justify-between px-4 py-2 gap-3 max-w-4xl mx-auto w-full">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-body-2xs font-semibold text-primary uppercase tracking-wider shrink-0">
                  Mode Fokus
                </span>
                <h1 className="text-body-sm font-bold text-foreground truncate font-heading leading-tight">
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
                <span className="hidden sm:inline">Keluar Fokus</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-body-2xs font-mono text-muted-foreground">
                  Esc
                </kbd>
              </Button>
            </div>
          </header>
        ) : (
          <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-sm">
            <TooltipProvider delayDuration={150}>
              <div className="flex items-center justify-between px-4 py-2 gap-3 max-w-7xl mx-auto w-full">
                {/* Left: Back button + Chapter Title */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        asChild
                        className="text-muted-foreground hover:text-foreground shrink-0 rounded-lg"
                        aria-label="Kembali ke materi"
                      >
                        <Link href={backHref ?? `/courses/${article.courseId}/material`}>
                          <ArrowLeft className="size-4" />
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start">
                      <span>Kembali ke materi</span>
                    </TooltipContent>
                  </Tooltip>

                  <div className="h-4 w-px bg-border/70 shrink-0" />

                  <div className="min-w-0">
                    <p className="truncate text-body-2xs font-medium text-muted-foreground uppercase tracking-wider">
                      {courseTitle}
                    </p>
                    <h1 className="text-body-sm font-bold text-foreground truncate font-heading leading-tight">
                      {article.chapterNumber ? `Bab ${article.chapterNumber}: ` : ""}
                      {article.title}
                    </h1>
                  </div>
                </div>

                {/* Right: Progress + Action controls */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Reading Progress indicator */}
                  <div
                    className="hidden sm:flex items-center gap-2 text-body-xs text-muted-foreground pr-1"
                    title={`Progres membaca: ${overallPercent}%`}
                  >
                    <div className="w-20 h-1.5 rounded-full bg-muted/80 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300 rounded-full"
                        style={{ width: `${overallPercent}%` }}
                      />
                    </div>
                    <span className="font-mono text-body-2xs font-semibold text-foreground">{overallPercent}%</span>
                  </div>

                  <div className="hidden sm:block h-4 w-px bg-border/70 mx-1" />

                  {/* Focus Mode Trigger (icon only with tooltip) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        ref={focusButtonRef}
                        variant="ghost"
                        size="icon-sm"
                        onClick={enterFocusMode}
                        className="text-muted-foreground hover:text-foreground rounded-lg"
                        aria-label="Masuk mode fokus"
                      >
                        <Maximize2 className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <span>Mode fokus</span>
                    </TooltipContent>
                  </Tooltip>

                  {/* Mobile Sheet Trigger */}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setIsMobileSheetOpen(true)}
                    className="md:hidden text-muted-foreground hover:text-foreground rounded-lg"
                    aria-label="Buka daftar isi"
                  >
                    <Menu className="size-4" />
                  </Button>

                  {/* Desktop TOC Toggle (icon only with tooltip) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={controlledToggleToc ?? (() => setInternalTocOpen(!internalTocOpen))}
                        className={cn(
                          "hidden md:flex rounded-lg transition-colors",
                          isTocOpen
                            ? "text-primary bg-primary/10 hover:bg-primary/15"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        aria-label={isTocOpen ? "Sembunyikan daftar isi" : "Buka daftar isi"}
                      >
                        {isTocOpen ? (
                          <PanelRightClose className="size-4" />
                        ) : (
                          <PanelRight className="size-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                      <span>{isTocOpen ? "Sembunyikan daftar isi" : "Buka daftar isi"}</span>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </TooltipProvider>

            {/* Bottom progress track */}
            <div className="w-full h-[2px] bg-border/40">
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
                      <hr className="my-12 border-t border-border/80" />
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
                  {nextMaterial && (
                    <p className="text-body-xs text-muted-foreground pt-1">
                      Materi berikutnya: <span className="font-semibold text-foreground">{nextMaterial.title}</span>
                    </p>
                  )}
                </div>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  {prevMaterial && (
                    <Button
                      variant="outline"
                      size="default"
                      onClick={handlePrevMaterial}
                      className="rounded-lg font-semibold gap-1.5"
                    >
                      <ChevronLeft className="size-4" />
                      <span>Materi Sebelumnya</span>
                    </Button>
                  )}

                  {nextMaterial ? (
                    <Button
                      variant="default"
                      size="default"
                      onClick={handleNextMaterial}
                      className="rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-semibold gap-1.5"
                    >
                      <span>Materi Berikutnya</span>
                      <ChevronRight className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="default"
                      onClick={handleFinishArticle}
                      className="rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-semibold gap-1.5"
                    >
                      <span>Kembali ke Daftar Materi</span>
                      <ChevronRight className="size-4" />
                    </Button>
                  )}

                  {nextMaterial && (
                    <Button
                      variant="ghost"
                      size="default"
                      asChild
                      className="rounded-lg text-muted-foreground hover:text-foreground font-semibold"
                    >
                      <Link href={backHref ?? `/courses/${article.courseId}/material`}>
                        <span>Daftar Materi</span>
                      </Link>
                    </Button>
                  )}
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

      {/* Floating Selection-to-Zyra toolbar using Shadcn Popover with Progressive Disclosure */}
      {learnerMode && selectionCoords && selectionContext && (
        <ZyraSelectionToolbar
          courseId={article.courseId}
          selectionContext={selectionContext}
          coords={selectionCoords}
          open={isSelectionToolbarOpen}
          onOpenChange={handleToolbarOpenChange}
          onAskZyra={handleAskZyra}
        />
      )}
    </div>
  );
}
