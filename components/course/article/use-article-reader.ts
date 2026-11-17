"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { emitActivityUpdated } from "@/lib/activity-signal";
import { useTutor } from "@/components/course/tutor-drawer";
import { isZyraSelectionAskEnabled } from "@/lib/zyra/murid";
import { extractZyraSelection, type ZyraSelectionContext } from "@/lib/zyra/selection-serializer";
import { type PublicSectionReadModel, resolveActiveSection, searchArticleContent } from "@/lib/articles/structured-read-model";
import { isLearnerReaderMode } from "@/lib/materials/reader-mode";
import { useTranslations } from "@/lib/i18n/client";
import { mergeSectionProgress, type ProgressUpdate, type SavedSectionProgress } from "@/lib/articles/progress-client";
import type { StructuredArticleReaderProps } from "@/lib/articles/reader-types";

export function useArticleReader({
  article,
  course,
  mode = "learner",
  backHref,
  prevMaterial,
  nextMaterial,
  isTocOpen: controlledTocOpen,
  isMobileSheetOpen: controlledMobileSheetOpen,
  onToggleMobileSheet: controlledToggleMobileSheet,
  adapter,
  saveProgress,
}: StructuredArticleReaderProps & { saveProgress?: (update: ProgressUpdate) => Promise<SavedSectionProgress> }) {
  const t = useTranslations("studentCourse");
  const learnerMode = isLearnerReaderMode(mode);
  const canTrackProgress = learnerMode && !adapter && Boolean(saveProgress);
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
  const takeReadingTime = useCallback(() => {
    const elapsed = activeTimeSpentRef.current;
    activeTimeSpentRef.current = 0;
    return elapsed;
  }, []);
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
  const [isMobileSelection, setIsMobileSelection] = useState(false);
  const selectionActionPressedRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileSelection(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!learnerMode || !selectionAskEnabled || !isMobileSelection || isTutorOpen) return;
    let frame = 0;
    const handleSelectionChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // A touch can collapse native selection before the button receives its click.
        if (selectionActionPressedRef.current) return;
        const selection = window.getSelection();
        const container = contentContainerRef.current;
        const valid = selection && !selection.isCollapsed &&
          container?.contains(selection.anchorNode) && container.contains(selection.focusNode);
        const extracted = valid ? extractZyraSelection(selection, article.title) : null;
        const context = extracted && extracted.cleanText.length >= 2 ? extracted : null;
        setSelectionContext(context);
        setIsSelectionToolbarOpen(Boolean(context));
      });
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [learnerMode, selectionAskEnabled, isMobileSelection, isTutorOpen, article.title]);

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
    [setIsMobileSheetOpen],
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
    [setIsMobileSheetOpen],
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
    (section: PublicSectionReadModel, query: string, blockId?: string, elementId?: string) => {
      navigateToSection(section);
      if (elementId) {
        setTimeout(() => document.getElementById(elementId)?.scrollIntoView({ behavior: "auto", block: "start" }), 150);
      } else if (blockId) {
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
      if (!learnerMode || adapter || !saveProgress) return;
      try {
        const data = await saveProgress({
          sectionId, percent: Math.round(percent), timeSpentSeconds: Math.round(timeSpent), completed: markCompleted,
        });
        setSectionProgressMap((previous) => ({
          ...previous, [sectionId]: mergeSectionProgress(previous[sectionId], data),
        }));
        if (data.completed) {
          completedSectionsSentRef.current.add(sectionId);
          emitActivityUpdated({ type: "article", courseId: course?.id, materialId: article.id, sectionId });
        }
      } catch {
        // A failed request must not permanently suppress a later completion attempt.
        if (markCompleted) completedSectionsSentRef.current.delete(sectionId);
      }
    },
    [article.id, course?.id, learnerMode, adapter, saveProgress],
  );

  // Reset scroll & timer tracking on active section change
  useEffect(() => {
    if (!canTrackProgress) return;
    activeTimeSpentRef.current = 0;
    maxScrollPercentRef.current = 0;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") activeTimeSpentRef.current += 1;
    }, 1000);

    return () => {
      clearInterval(interval);
      if (activeSection && activeTimeSpentRef.current > 2) {
        sendProgressUpdate(
          activeSection.id,
          maxScrollPercentRef.current,
          takeReadingTime(),
        );
      }
    };
  }, [activeSection, canTrackProgress, sendProgressUpdate, takeReadingTime]);

  // Scroll listener to track read percentage and completion across all sections in continuous flow
  useEffect(() => {
    if (!canTrackProgress) return;
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
            sendProgressUpdate(
              sec.id,
              100,
              activeSection?.id === sec.id ? takeReadingTime() : 0,
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
  }, [activeSection, article.sections, canTrackProgress, sendProgressUpdate, takeReadingTime]);

  // Selection listener for selection-to-Zyra toolbar using mouseup and keyup
  useEffect(() => {
    if (!learnerMode || !selectionAskEnabled || isMobileSelection) return;

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
  }, [learnerMode, selectionAskEnabled, article.title, isMobileSelection]);

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
    if (!isMobileSelection) window.getSelection()?.removeAllRanges();

    const sectionTitle = currentContext.sectionTitle || activeSection?.title || "";
    let questionText = customQuestion?.trim();
    if (!questionText) {
      if (intent === "example") {
        questionText = t("articleReader.zyraPrompts.example");
      } else if (intent === "step_by_step") {
        questionText = t("articleReader.zyraPrompts.stepByStep");
      } else if (intent === "rationale") {
        questionText = t("articleReader.zyraPrompts.rationale");
      } else if (intent === "intuition") {
        questionText = t("articleReader.zyraPrompts.intuition");
      } else if (intent === "define") {
        questionText = t("articleReader.zyraPrompts.define");
      } else {
        questionText = t("articleReader.zyraPrompts.selection", { text: currentContext.cleanText });
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
    if (adapter?.completed) return article.sections.length;
    return article.sections.filter((s) => {
      const p = sectionProgressMap[s.id];
      return p?.completed || (p?.maxReadPercent ?? 0) >= 90;
    }).length;
  }, [article.sections, sectionProgressMap, adapter?.completed]);

  const overallPercent = Math.min(100, Math.round((completedCount / totalSections) * 100));

  const handleFinishArticle = () => {
    if (learnerMode && !adapter && !saveProgress) return;
    if (adapter) { if (adapter.ready) { adapter.onComplete(); router.push(backHref ?? `/courses/${article.courseId}/material`); } return; }
    if (learnerMode) {
      for (const sec of article.sections) {
        if (!completedSectionsSentRef.current.has(sec.id)) {
          completedSectionsSentRef.current.add(sec.id);
          sendProgressUpdate(sec.id, 100, sec.id === activeSection?.id ? takeReadingTime() : 0, true);
        }
      }
    }
    router.push(backHref ?? `/courses/${article.courseId}/material`);
  };

  const handleNextMaterial = () => {
    if (learnerMode && !adapter && !saveProgress) return;
    if (learnerMode) {
      for (const sec of article.sections) {
        if (!completedSectionsSentRef.current.has(sec.id)) {
          completedSectionsSentRef.current.add(sec.id);
          sendProgressUpdate(sec.id, 100, sec.id === activeSection?.id ? takeReadingTime() : 0, true);
        }
      }
    }
    if (nextMaterial?.href) {
      router.push(nextMaterial.href);
    }
  };

  const handlePrevMaterial = () => {
    if (learnerMode && !adapter && !saveProgress) return;
    if (learnerMode) {
      for (const sec of article.sections) {
        if (!completedSectionsSentRef.current.has(sec.id)) {
          completedSectionsSentRef.current.add(sec.id);
          sendProgressUpdate(sec.id, 100, sec.id === activeSection?.id ? takeReadingTime() : 0, true);
        }
      }
    }
    if (prevMaterial?.href) {
      router.push(prevMaterial.href);
    }
  };

  const courseTitle = course?.title || t("articleReader.courseMaterial");

  return { t, learnerMode, activeSection, activeSectionSlug, searchQuery, setSearchQuery, searchResults, openSearchResult, sectionProgressMap, completedCount, totalSections, navigateToSection, navigateToBlock, isFocusMode, focusButtonRef, exitFocusButtonRef, enterFocusMode, exitFocusMode, courseTitle, overallPercent, isTocOpen, internalTocOpen, setInternalTocOpen, isMobileSheetOpen, setIsMobileSheetOpen, contentContainerRef, temporaryHighlight, handleFinishArticle, handleNextMaterial, handlePrevMaterial, selectionAskEnabled, isMobileSelection, isTutorOpen, isSelectionToolbarOpen, selectionContext, selectionCoords, selectionActionPressedRef, handleAskZyra, handleToolbarOpenChange };
}
