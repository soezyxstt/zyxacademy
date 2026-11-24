"use client";

import { usePanelViewport } from "@/hooks/use-panel-viewport";
import { useDialogHistory } from "@/hooks/use-dialog-history";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  X,
  Loader2,
  Trash2,
  SquareTerminal,
  Copy,
  Check,
  Square,
  ChevronDown,
  ChevronRight,
  Plus,
  MessageSquare,
  Maximize2,
  Minimize2,
  CircleHelp,
  Compass,
  LayoutTemplate,
  BarChart3,
  UserCheck,
  BookOpenCheck,
  KeyRound,
  Layers,
  ClipboardList,
  FileText,
  CalendarClock,
  LayoutGrid,
  RotateCcw,
} from "lucide-react";
import { useOpsAiContext } from "./ops-ai-context";
import {
  loadOpsAiMessages,
  saveOpsAiMessages,
  clearOpsAiMessages,
  loadOpsAiSessions,
  loadActiveSessionId,
  saveActiveSessionId,
  createOpsAiSession,
  updateOpsAiSessionMessages,
  deleteOpsAiSession,
  clearAllOpsAiSessions,
  type OpsAiMessageV2,
  type OpsAiSession,
  clampOpsAiWidth,
  OPS_AI_MIN_WIDTH,
  OPS_AI_DEFAULT_WIDTH,
} from "./ops-ai-storage";
import { WorkTraceView } from "./work-trace-view";
import { CitationCards } from "./citation-cards";
import { ActionProposalCard } from "./action-proposal-card";
import { QuickActionsBar, stripOpsFollowupMarkup } from "./quick-actions-bar";
import {
  CAPABILITY_OVERVIEW_PRESET,
  resolveDynamicOpsPresets,
  type OpsAiPreset,
  type OpsAiPresetIcon,
} from "./ops-ai-presets";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useOpsAiChat } from "./use-ops-ai-chat";
import { OPS_AI_POLICY_BOUNDS } from "@/lib/admin-ops-ai/contracts";
import { ZyraComposerInput, type ZyraComposerInputHandle } from "@/components/course/zyra-composer-input";
import { ZyraChatComposer, ZyraChatHeader, ZyraChatHistory, ZyraSendButton } from "@/components/course/zyra-chat-frame";
import { TutorAssistantSurface, TutorStudentMessage } from "@/components/course/tutor-message-frame";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type PresetFilter = "all" | "ask" | "action";

function PresetIcon({ icon, className }: { icon: OpsAiPresetIcon; className?: string }) {
  const cls = cn("size-4 shrink-0", className);
  switch (icon) {
    case "compass":
      return <Compass className={cls} aria-hidden="true" />;
    case "layout":
      return <LayoutTemplate className={cls} aria-hidden="true" />;
    case "analytics":
      return <BarChart3 className={cls} aria-hidden="true" />;
    case "user-check":
      return <UserCheck className={cls} aria-hidden="true" />;
    case "book-check":
      return <BookOpenCheck className={cls} aria-hidden="true" />;
    case "key":
      return <KeyRound className={cls} aria-hidden="true" />;
    case "layers":
      return <Layers className={cls} aria-hidden="true" />;
    case "form":
      return <ClipboardList className={cls} aria-hidden="true" />;
    case "article":
      return <FileText className={cls} aria-hidden="true" />;
    case "calendar":
      return <CalendarClock className={cls} aria-hidden="true" />;
  }
}

export function OpsAiPanel({ initialMessages, accountId }: { initialMessages?: OpsAiMessageV2[]; accountId?: string } = {}) {
  const {
    isOpen,
    closePanel,
    width,
    setWidth,
    isDesktop,
    maxWidth,
  } = useOpsAiContext();

  const [sessions, setSessions] = useState<OpsAiSession[]>(() => {
    if (typeof window === "undefined") return [];
    return loadOpsAiSessions(accountId);
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return loadActiveSessionId(accountId);
  });
  const [hasHydrated, setHasHydrated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(typeof window === "undefined" ? isOpen : false);
  const [isFullWidth, setIsFullWidth] = useState(false);
  const [showSessionsDropdown, setShowSessionsDropdown] = useState(false);
  const [showPresetsPopover, setShowPresetsPopover] = useState(false);
  const [presetFilter, setPresetFilter] = useState<PresetFilter>("all");
  const [chatMode, setChatMode] = useState<"ask" | "edit">("edit");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const sessionsMenuRef = useRef<HTMLDivElement>(null);

  const pathname = usePathname();
  const tab = useSearchParams()?.get("tab");
  const { messages, setMessages, input, setInput, isStreaming, stop, sendMessage } = useOpsAiChat({
    initialMessages,
    context: {
      currentPath: pathname || "/admin",
      mode: chatMode,
      ...(tab && /^[\w-]{1,80}$/.test(tab) ? { queryParams: { tab } } : {}),
    },
  });
  const [revoking, setRevoking] = useState(false);
  const approvalPending = useRef(false);
  const [isApproving, setIsApproving] = useState(false);
  const handleApprovalPending = (pending: boolean) => {
    if (pending && approvalPending.current) return false;
    approvalPending.current = pending;
    setIsApproving(pending);
    return true;
  };
  const [grants, setGrants] = useState<Array<{ id: string; chatId: string; until: number }>>([]);
  const activeGrants = grants.filter(grant => grant.chatId === activeSessionId);
  const nextGrantExpiry = Math.min(...activeGrants.map(grant => grant.until));
  useEffect(() => {
    if (!Number.isFinite(nextGrantExpiry)) return;
    const timer = window.setTimeout(() => setGrants(current => current.filter(grant => grant.until > Date.now())), Math.max(0, nextGrantExpiry - Date.now()));
    return () => window.clearTimeout(timer);
  }, [nextGrantExpiry]);
  useDialogHistory(isOpen, closePanel);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<ZyraComposerInputHandle>(null);
  const panelRef = useRef<HTMLElement>(null);
  usePanelViewport(panelRef, isVisible);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startWidth: number; latestWidth: number }>({
    startX: 0,
    startWidth: 480,
    latestWidth: 480,
  });

  // Set mounted flag on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Smooth open/close presence state for both mobile overlay and desktop docked sheet
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      let frame1 = 0;
      let frame2 = 0;
      frame1 = window.requestAnimationFrame(() => {
        frame2 = window.requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
      return () => {
        window.cancelAnimationFrame(frame1);
        window.cancelAnimationFrame(frame2);
      };
    }

    setIsVisible(false);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShouldRender(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShouldRender(false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  // Hydration-safe initial load from localStorage and external update sync
  useEffect(() => {
    if (!initialMessages) {
      const loadedSessions = loadOpsAiSessions(accountId);
      setSessions(loadedSessions);

      let curSessionId = loadActiveSessionId(accountId);
      if (!curSessionId && loadedSessions.length > 0) {
        curSessionId = loadedSessions[0].id;
        saveActiveSessionId(curSessionId, accountId);
      }

      if (curSessionId) {
        setActiveSessionId(curSessionId);
        const curSession = loadedSessions.find((s) => s.id === curSessionId);
        if (curSession) {
          setMessages(curSession.messages);
        }
      } else {
        const loaded = loadOpsAiMessages(accountId);
        if (loaded.length > 0) {
          setMessages(loaded);
        }
      }
    }
    setHasHydrated(true);

    const handleExternalUpdate = () => {
      const reloadedSessions = loadOpsAiSessions(accountId);
      setSessions(reloadedSessions);
      const curId = loadActiveSessionId(accountId);
      if (curId) {
        const current = reloadedSessions.find((s) => s.id === curId);
        if (current) setMessages(current.messages);
      } else {
        const reloaded = loadOpsAiMessages(accountId);
        setMessages(reloaded);
      }
    };

    window.addEventListener("zyx:ops-ai-messages-updated", handleExternalUpdate);
    window.addEventListener("zyx:ops-ai-sessions-updated", handleExternalUpdate);
    return () => {
      window.removeEventListener("zyx:ops-ai-messages-updated", handleExternalUpdate);
      window.removeEventListener("zyx:ops-ai-sessions-updated", handleExternalUpdate);
    };
  }, [initialMessages, accountId, setMessages]);

  // Synchronize messages with persistent session storage after client mount
  useEffect(() => {
    if (hasHydrated) {
      if (activeSessionId) {
        updateOpsAiSessionMessages(activeSessionId, messages, accountId);
      } else {
        saveOpsAiMessages(messages, true, accountId);
      }
    }
  }, [messages, hasHydrated, activeSessionId, accountId]);

  // Internal container auto-scroll: Strictly scrolls drawer without moving outer page
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!isOpen || !el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 140 || messages.length <= 2) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isOpen, isStreaming]);

  // Dismiss session dropdown on outside click or Escape
  useEffect(() => {
    if (!showSessionsDropdown) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (sessionsMenuRef.current && !sessionsMenuRef.current.contains(event.target as Node)) {
        setShowSessionsDropdown(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowSessionsDropdown(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showSessionsDropdown]);

  // Focus textarea when panel opens without causing mobile horizontal page shift
  useEffect(() => {
    if (isOpen && !showSessionsDropdown) {
      const timer = window.setTimeout(() => textareaRef.current?.focus(), 100);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, showSessionsDropdown]);

  // Lock background page scroll when desktop panel is expanded to full width
  useEffect(() => {
    if (typeof document === "undefined" || !isOpen || !isDesktop || !isFullWidth) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, isDesktop, isFullWidth]);

  // Mobile and full-width focus trap
  const handleKeyDownTrap = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" || (isDesktop && !isFullWidth)) return;

      const container = panelRef.current;
      if (!container) return;

      const focusables = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [contenteditable="true"], [tabindex="0"], a[href]'
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last || !container.contains(document.activeElement)) {
          e.preventDefault();
          first?.focus();
        }
      }
    },
    [isDesktop, isFullWidth]
  );

  // Keyboard resize for accessibility (separator role)
  const handleKeyDownResize = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setWidth((prev) => clampOpsAiWidth(prev + 20, window.innerWidth));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setWidth((prev) => clampOpsAiWidth(prev - 20, window.innerWidth));
      } else if (e.key === "Home") {
        e.preventDefault();
        setWidth(OPS_AI_MIN_WIDTH);
      } else if (e.key === "End") {
        e.preventDefault();
        setWidth(maxWidth);
      }
    },
    [setWidth, maxWidth]
  );

  // Bulletproof Drag Resize: Direct 120fps DOM mutation + Dual target/window listeners
  const handlePointerDownResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const asideEl = panelRef.current;
      const mainEl = typeof document !== "undefined" ? document.getElementById("main-content") : null;
      const targetEl = e.currentTarget;

      const startX = e.clientX;
      const startWidth = asideEl ? asideEl.getBoundingClientRect().width : width;
      let currentWidth = startWidth;

      isDraggingRef.current = true;
      dragStartRef.current = {
        startX,
        startWidth,
        latestWidth: startWidth,
      };

      // Disable CSS transitions immediately for instant 120fps tracking
      if (asideEl) asideEl.style.transition = "none";
      if (mainEl) mainEl.style.transition = "none";
      targetEl.classList.add("bg-primary/10");

      if (typeof document !== "undefined") {
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }

      const pointerId = e.pointerId;
      let hasCapture = false;
      try {
        targetEl.setPointerCapture(pointerId);
        hasCapture = true;
      } catch {
        // Fallback to window listeners if capture not supported
      }

      const handleMove = (ev: MouseEvent | PointerEvent) => {
        if (!isDraggingRef.current) return;
        ev.preventDefault();
        const delta = dragStartRef.current.startX - ev.clientX; // Leftward drag expands right panel
        const newWidth = clampOpsAiWidth(dragStartRef.current.startWidth + delta, window.innerWidth);
        dragStartRef.current.latestWidth = newWidth;
        currentWidth = newWidth;

        // Mutate DOM style directly at 120 FPS without React re-render lag
        if (asideEl) {
          asideEl.style.width = `${newWidth}px`;
        }
      };

      const handleUp = () => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;

        if (hasCapture) {
          try {
            targetEl.releasePointerCapture(pointerId);
          } catch {
            // Ignore
          }
        }

        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        if (asideEl) asideEl.style.transition = "";
        if (mainEl) mainEl.style.transition = "";
        targetEl.classList.remove("bg-primary/10");

        // Remove from target element (captured events)
        targetEl.removeEventListener("pointermove", handleMove as EventListener);
        targetEl.removeEventListener("pointerup", handleUp as EventListener);
        targetEl.removeEventListener("pointercancel", handleUp as EventListener);

        // Remove from window (bubbled / fallback events)
        window.removeEventListener("pointermove", handleMove as EventListener);
        window.removeEventListener("mousemove", handleMove as EventListener);
        window.removeEventListener("pointerup", handleUp as EventListener);
        window.removeEventListener("mouseup", handleUp as EventListener);

        // Commit final width to React state and persistent storage once upon drag end
        setWidth(currentWidth);
      };

      // Listen on BOTH targetEl (for captured events) AND window (for bubbling / fallback)
      targetEl.addEventListener("pointermove", handleMove as EventListener, { passive: false });
      targetEl.addEventListener("pointerup", handleUp as EventListener);
      targetEl.addEventListener("pointercancel", handleUp as EventListener);

      window.addEventListener("pointermove", handleMove as EventListener, { passive: false });
      window.addEventListener("mousemove", handleMove as EventListener, { passive: false });
      window.addEventListener("pointerup", handleUp as EventListener);
      window.addEventListener("mouseup", handleUp as EventListener);
    },
    [width, setWidth]
  );

  // Handle creating a new session
  const handleCreateNewSession = () => {
    if (approvalPending.current) return;
    stop();
    const newSession = createOpsAiSession(undefined, accountId);
    setSessions(loadOpsAiSessions(accountId));
    setActiveSessionId(newSession.id);
    setMessages([]);
    setInput("");
    setShowSessionsDropdown(false);
    toast.success("Sesi percakapan baru telah dimulai.");
  };

  // Handle switching active session
  const handleSwitchSession = (session: OpsAiSession) => {
    if (approvalPending.current) return;
    stop();
    setActiveSessionId(session.id);
    saveActiveSessionId(session.id, accountId);
    setMessages(loadOpsAiSessions(accountId).find(current => current.id === session.id)?.messages ?? session.messages);
    setInput("");
    setShowSessionsDropdown(false);
  };

  // Handle deleting a single session
  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    if (approvalPending.current) return;
    if (activeSessionId === sessionId) stop();
    setGrants(current => current.filter(grant => grant.chatId !== sessionId));
    e.stopPropagation();
    const remaining = deleteOpsAiSession(sessionId, accountId);
    setSessions(remaining);

    if (activeSessionId === sessionId) {
      setInput("");
      if (remaining.length > 0) {
        setActiveSessionId(remaining[0].id);
        setMessages(remaining[0].messages);
      } else {
        const fresh = createOpsAiSession(undefined, accountId);
        setSessions([fresh]);
        setActiveSessionId(fresh.id);
        setMessages([]);
      }
    }
    toast.success("Sesi percakapan berhasil dihapus.");
  };

  // Handle clearing history of active session
  const handleClearActiveHistory = () => {
    if (approvalPending.current) return;
    stop();
    setGrants(current => current.filter(grant => grant.chatId !== activeSessionId));
    setMessages([]);
    clearOpsAiMessages(accountId);
    if (activeSessionId) {
      updateOpsAiSessionMessages(activeSessionId, [], accountId);
      const reloaded = loadOpsAiSessions(accountId);
      setSessions(reloaded);
    }
    toast.success("Riwayat percakapan sesi ini telah dibersihkan.");
  };

  // Handle clearing all sessions completely
  const handleClearAllSessions = () => {
    if (approvalPending.current) return;
    stop();
    setGrants([]);
    clearAllOpsAiSessions(accountId);
    const fresh = createOpsAiSession(undefined, accountId);
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
    setMessages([]);
    setInput("");
    setShowSessionsDropdown(false);
    toast.success("Seluruh riwayat sesi telah dibersihkan.");
  };

  const handleToggleExpandWidth = () => {
    setIsFullWidth((prev) => !prev);
  };

  const handleCopyMessage = (id: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(stripOpsFollowupMarkup(text));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success("Jawaban berhasil disalin ke papan klip.");
    }
  };

  const handleSendMessage = (textToSend?: string, modeOverride?: "ask" | "edit") => {
    const query = (textToSend ?? input).trim();
    if (!query || isStreaming || approvalPending.current || revoking || query.length > OPS_AI_POLICY_BOUNDS.maxMessageCharLength) return;
    let chatId = activeSessionId;
    if (!chatId) {
      const fresh = createOpsAiSession(undefined, accountId);
      chatId = fresh.id;
      setActiveSessionId(chatId);
      setSessions(loadOpsAiSessions(accountId));
    }
    const effectiveMode = modeOverride ?? chatMode;
    if (modeOverride && modeOverride !== chatMode) {
      setChatMode(modeOverride);
    }
    const grantIds = activeGrants.filter(grant => grant.until > Date.now()).map(grant => grant.id);
    void sendMessage(query, { chatId, grantIds, mode: effectiveMode });
  };

  const handleSelectPreset = (preset: OpsAiPreset) => {
    setShowPresetsPopover(false);
    handleSendMessage(preset.prompt, preset.recommendedMode);
  };

  const handleRevokeGrants = async () => {
    if (revoking || !activeSessionId || !activeGrants.length) return;
    const revokeGrantIds = activeGrants.map(grant => grant.id);
    setRevoking(true);
    try {
      const response = await fetch("/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: activeSessionId, revokeGrantIds }),
      });
      if (!response.ok) throw new Error();
      setGrants(current => current.filter(grant => !revokeGrantIds.includes(grant.id)));
    } catch {
      toast.error("Izin chat belum bisa diakhiri. Coba lagi.");
    } finally {
      setRevoking(false);
    }
  };

  if (!shouldRender) return null;

  const currentSession = sessions.find((s) => s.id === activeSessionId);
  const activeTitle =
    currentSession?.title && currentSession.title !== "Percakapan Baru"
      ? currentSession.title
      : messages.find(message => message.role === "user")?.content.trim().slice(0, 48) || "Zyx Ops AI";

  const dynamicPresets = resolveDynamicOpsPresets({
    pathname,
    mode: chatMode,
    hasMessages: messages.length > 0,
  });
  const askPresets = resolveDynamicOpsPresets({
    pathname,
    mode: "ask",
    hasMessages: false,
  }).presets;
  const editPresets = resolveDynamicOpsPresets({
    pathname,
    mode: "edit",
    hasMessages: false,
  }).presets;
  const actionOnlyPresets = editPresets.filter((item) => item.category === "action");
  const visiblePresets =
    presetFilter === "all"
      ? dynamicPresets.presets
      : presetFilter === "ask"
        ? askPresets
        : actionOnlyPresets.length > 0
          ? actionOnlyPresets
          : editPresets;

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div
        data-state={isVisible ? "open" : "closed"}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity duration-300 ease-out motion-reduce:transition-none lg:hidden",
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Main Panel Container */}
      <aside
        ref={panelRef}
        id="ops-ai-panel"
        role="complementary"
        aria-label="Zyx Ops AI Assistant"
        data-state={isVisible ? "open" : "closed"}
        data-full-width={isFullWidth ? "true" : "false"}
        suppressHydrationWarning
        onKeyDown={handleKeyDownTrap}
        style={{
          "--ops-ai-width": `${width}px`,
          width: mounted && isDesktop && !isFullWidth ? (isVisible ? `${width}px` : "0px") : undefined,
        } as React.CSSProperties}
        className={cn(
          "flex flex-col overflow-hidden border-border bg-background select-text relative min-w-0",
          "transition-[transform,width,opacity,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          "fixed inset-y-0 left-0 right-0 z-50 w-full top-[var(--panel-visible-top,0px)] h-[var(--panel-visible-height,100dvh)]",
          !isFullWidth && "sm:border-l sm:left-auto sm:w-[480px] sm:shadow-2xl lg:sticky lg:self-start lg:shrink-0 lg:z-40 lg:shadow-none",
          isVisible
            ? "translate-x-0 opacity-100"
            : cn("translate-x-full opacity-0 pointer-events-none", !isFullWidth && "lg:translate-x-0 lg:border-l-transparent")
        )}
      >
        <div
          className={cn(
            "relative flex h-full min-h-0 w-full flex-col transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            !isFullWidth && "lg:min-w-[var(--ops-ai-width)]",
            !isFullWidth && (isVisible ? "lg:translate-x-0" : "lg:translate-x-4")
          )}
        >
        {/* Resize Handle: Desktop & Tablet with wide hit area */}
        <div
          role="separator"
          tabIndex={0}
          aria-label="Ubah ukuran panel Ops AI"
          aria-orientation="vertical"
          aria-valuenow={mounted ? width : OPS_AI_DEFAULT_WIDTH}
          aria-valuemin={OPS_AI_MIN_WIDTH}
          aria-valuemax={maxWidth}
          suppressHydrationWarning
          onDoubleClick={handleToggleExpandWidth}
          onKeyDown={handleKeyDownResize}
          onPointerDown={handlePointerDownResize}
          style={{ touchAction: "none" }}
          className={cn(
            "hidden sm:flex absolute left-0 inset-y-0 w-3.5 cursor-col-resize items-center justify-center group select-none z-50 hover:bg-primary/5 active:bg-primary/10 transition-colors",
            isFullWidth && "lg:hidden"
          )}
        >
          <div
            className="w-1 h-16 rounded-full bg-border/90 transition-all duration-150 flex items-center justify-center group-hover:bg-primary group-hover:w-1.5 group-focus-visible:bg-primary group-focus-visible:w-1.5 active:bg-primary active:w-1.5"
          />
        </div>

        {/* 1. Header */}
        <ZyraChatHeader>
          {/* Left: Session Dropdown Selector */}
          <div ref={sessionsMenuRef} className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setShowSessionsDropdown((prev) => !prev)}
              aria-expanded={showSessionsDropdown}
              aria-label="Daftar riwayat sesi"
              className="flex items-center gap-2 text-left text-body-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer truncate max-w-full group rounded-md py-0.5 pr-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <SquareTerminal className="size-3.5" aria-hidden="true" />
              </span>
              <span className="truncate max-w-[220px]">{activeTitle}</span>
              <ChevronDown
                className={cn(
                  "size-3.5 text-muted-foreground group-hover:text-primary transition-transform shrink-0",
                  showSessionsDropdown && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>

            {/* Session Dropdown Menu */}
            {showSessionsDropdown && (
              <div className="absolute top-full left-0 mt-1.5 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-border bg-popover text-popover-foreground shadow-lg p-2 z-50 space-y-1.5">
                <div className="flex items-center justify-between px-2 py-1 text-body-xs font-semibold text-muted-foreground">
                  <span>Riwayat sesi ({sessions.length})</span>
                  <button
                    type="button"
                    onClick={handleCreateNewSession}
                    disabled={isApproving}
                    aria-label="Percakapan baru"
                    className="text-primary hover:underline text-body-xs font-medium cursor-pointer"
                  >
                    + Sesi baru
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1">
                  {sessions.length === 0 ? (
                    <div className="p-3 text-center text-body-xs text-muted-foreground">
                      Belum ada sesi.
                    </div>
                  ) : (
                    sessions.map((sess) => {
                      const isActive = sess.id === activeSessionId;
                      return (
                        <div
                          key={sess.id}
                          className={cn(
                            "flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-body-xs transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary font-semibold"
                              : "hover:bg-muted text-foreground"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => handleSwitchSession(sess)}
                            disabled={isApproving}
                            aria-current={isActive ? "true" : undefined}
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-body-sm cursor-pointer"
                          >
                            <MessageSquare className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                            <span className="truncate">{sess.title || "Percakapan baru"}</span>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-body-2xs text-muted-foreground font-mono">
                              {sess.messages.length}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSession(e, sess.id)}
                              disabled={isApproving}
                              aria-label={`Hapus sesi ${sess.title}`}
                              className="size-6 inline-flex items-center justify-center text-muted-foreground hover:text-destructive rounded-md cursor-pointer"
                            >
                              <Trash2 className="size-3" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {sessions.length > 0 && (
                  <div className="pt-1.5 border-t border-border/60 flex justify-between px-1">
                    <button
                      type="button"
                      onClick={handleClearAllSessions}
                      disabled={isApproving}
                      className="text-body-xs text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      Hapus semua sesi
                    </button>
                    {messages.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearActiveHistory}
                        disabled={isApproving}
                        aria-label="Bersihkan riwayat percakapan"
                        className="text-body-xs text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        Bersihkan chat ini
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Help Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Bantuan Zyx Ops AI"
                  title="Bantuan Zyx Ops AI"
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <CircleHelp className="size-4" aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-3 space-y-2 text-body-xs">
                <p className="font-heading text-body-sm font-bold text-foreground">Cara pakai Zyx Ops AI</p>
                <ul className="space-y-1.5 text-body-xs text-muted-foreground list-disc pl-4">
                  <li>Gunakan mode <span className="font-medium text-foreground">Tanya</span> untuk memeriksa data, SOP, dan fitur tanpa mengubah data.</li>
                  <li>Gunakan mode <span className="font-medium text-foreground">Aksi</span> untuk menyiapkan perubahan seperti token, bab, formulir, jadwal, atau blog.</li>
                  <li>Setiap perubahan data selalu menampilkan kartu persetujuan sebelum dijalankan.</li>
                </ul>
              </PopoverContent>
            </Popover>

            {/* New Chat Button */}
            <button
              type="button"
              onClick={handleCreateNewSession}
              disabled={isApproving}
              aria-label="Percakapan baru"
              title="Percakapan baru"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>

            {/* Expand / Maximize Button (Desktop only) */}
            <button
              type="button"
              onClick={handleToggleExpandWidth}
              aria-label={isFullWidth ? "Kembalikan lebar panel" : "Perbesar ke layar penuh"}
              aria-pressed={isFullWidth}
              title={isFullWidth ? "Kembalikan lebar panel" : "Perbesar ke layar penuh"}
              className="hidden lg:inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              {isFullWidth ? (
                <Minimize2 className="size-3.5" aria-hidden="true" />
              ) : (
                <Maximize2 className="size-3.5" aria-hidden="true" />
              )}
            </button>

            {/* Close / Collapse Button */}
            <button
              type="button"
              onClick={closePanel}
              aria-label="Ciutkan panel"
              title="Ciutkan panel"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="size-4" aria-hidden="true" />
            </button>

            {/* Dedicated accessible close button for test contracts */}
            <button
              type="button"
              onClick={closePanel}
              aria-label="Tutup panel"
              className="sr-only"
            >
              Tutup
            </button>
          </div>
        </ZyraChatHeader>

        {/* 2. Conversation Flow */}
        <ZyraChatHistory ref={scrollContainerRef} aria-label="Riwayat percakapan">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-3">
              {/* Featured Capability Discovery Preset */}
              <button
                type="button"
                onClick={() => handleSelectPreset(CAPABILITY_OVERVIEW_PRESET)}
                className="group w-full flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/10 cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Compass className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <span className="block font-heading text-body-base font-bold text-foreground">
                      {CAPABILITY_OVERVIEW_PRESET.label}
                    </span>
                    <span className="block text-body-xs text-muted-foreground">
                      Lihat daftar pertanyaan dan aksi yang tersedia
                    </span>
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-primary/70 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>

              {/* Filterable Interactive Presets */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div
                    role="group"
                    aria-label="Filter kategori preset"
                    className="inline-flex items-center gap-1 rounded-lg bg-muted/70 p-0.5"
                  >
                    {(
                      [
                        { key: "all", label: "Semua" },
                        { key: "ask", label: "Tanya" },
                        { key: "action", label: "Aksi" },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        aria-pressed={presetFilter === item.key}
                        onClick={() => setPresetFilter(item.key)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-body-xs font-medium transition-colors cursor-pointer",
                          presetFilter === item.key
                            ? "bg-background text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-border/60 rounded-xl border border-border/80 bg-card overflow-hidden">
                  {visiblePresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className="group w-full flex items-center justify-between gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PresetIcon
                          icon={preset.icon}
                          className={cn(
                            preset.category === "action"
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-foreground"
                          )}
                        />
                        <span className="text-body-sm text-foreground leading-snug break-words">
                          {preset.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-body-2xs font-medium",
                            preset.category === "action"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {preset.category === "action" ? "Aksi" : "Tanya"}
                        </span>
                        <ChevronRight className="size-3.5 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isAssistant = msg.role === "assistant";

              if (!isAssistant) {
                return (
                  <TutorStudentMessage key={msg.id || index}>
                    <MarkdownRenderer content={msg.content} density="compact" />
                  </TutorStudentMessage>
                );
              }

              const precedingUserMessage = messages
                .slice(0, index)
                .reverse()
                .find((item) => item.role === "user");

              return (
                <div key={msg.id || index} className="space-y-2 select-text">
                  <TutorAssistantSurface>
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <SquareTerminal className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="font-heading text-body-xs font-bold text-foreground">
                        Zyx Ops AI
                      </span>
                    </div>

                    {msg.workSteps && msg.workSteps.length > 0 && <WorkTraceView steps={msg.workSteps} />}

                    {(() => {
                      const cleanedContent = stripOpsFollowupMarkup(msg.content);
                      const isLatestAssistant = index === messages.length - 1;
                      const showFollowups =
                        isLatestAssistant &&
                        !isStreaming &&
                        !msg.error &&
                        !msg.proposals?.length &&
                        (msg.followups?.length ?? 0) > 0;

                      return (
                        <>
                          {cleanedContent ? (
                            <div className="min-w-0 max-w-full wrap-break-word text-body-base text-foreground">
                              <MarkdownRenderer content={cleanedContent} density="compact" />
                            </div>
                          ) : isStreaming && isLatestAssistant ? (
                            <div role="status" className="flex items-center gap-2 py-1 text-body-xs text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" />
                              <span>Menyiapkan respons</span>
                            </div>
                          ) : null}

                          {/* Deterministic Follow-up Chips */}
                          {showFollowups && (
                            <QuickActionsBar
                              followups={msg.followups ?? []}
                              onSelect={(chip) => handleSendMessage(chip.prompt, chip.mode)}
                              disabled={isStreaming || revoking || isApproving}
                            />
                          )}
                        </>
                      );
                    })()}

                    {msg.error && msg.content !== `Terjadi kendala: ${msg.error.message}` && (
                      <div role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-body-xs text-destructive">
                        <span className="min-w-0 break-words">{msg.error.message}</span>
                        {precedingUserMessage && !isStreaming && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendMessage(precedingUserMessage.content)}
                            className="h-7 shrink-0 rounded-md px-2 text-body-xs"
                          >
                            <RotateCcw className="size-3" aria-hidden="true" />
                            <span>Coba lagi</span>
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Official Grounded Citations (In-line bottom) */}
                    {msg.citations && msg.citations.length > 0 && (
                      <CitationCards citations={msg.citations} />
                    )}

                    {/* Action Proposals */}
                    {msg.proposals && msg.proposals.length > 0 && (
                      <div className="my-3 space-y-2">
                        {msg.proposals.map((prop) => (
                          <ActionProposalCard
                            key={prop.id}
                            proposal={prop}
                            chatId={activeSessionId ?? undefined}
                            disabled={isStreaming || revoking || isApproving}
                            onExecutionChange={handleApprovalPending}
                            onExecuted={(proposalId, result, grantUntil) => {
                              if (grantUntil && grantUntil > Date.now() && activeSessionId) {
                                const chatId = activeSessionId;
                                setGrants(current => [...current.filter(grant => grant.id !== proposalId && grant.until > Date.now()), { id: proposalId, chatId, until: grantUntil }].slice(-8));
                              }
                              setMessages((prev) =>
                                prev.map((m) => {
                                  if (!m.proposals) return m;
                                  return {
                                    ...m,
                                    proposals: m.proposals.map((p) =>
                                      p.id === proposalId
                                        ? {
                                            ...p,
                                            status: "executed" as const,
                                            result:
                                              typeof result === "object" && result !== null
                                                ? (result as Record<string, unknown>)
                                                : { result },
                                            confirmedAt: Date.now(),
                                          }
                                        : p
                                    ),
                                  };
                                })
                              );
                            }}
                          />
                        ))}
                      </div>
                    )}

                    {/* Copy button */}
                    {msg.content && (
                      <div className="flex items-center gap-2 pt-1 text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          aria-label="Salin jawaban"
                          title="Salin jawaban"
                          className="inline-flex items-center gap-1 text-body-xs hover:text-foreground transition-colors cursor-pointer py-0.5 px-1.5 rounded-md hover:bg-muted"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="size-3 text-status-success" aria-hidden="true" />
                              <span>Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" aria-hidden="true" />
                              <span>Salin</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </TutorAssistantSurface>
                </div>
              );
            })
          )}
        </ZyraChatHistory>

        <ZyraChatComposer>
          <ZyraComposerInput
            ref={textareaRef}
            value={input}
            onChange={setInput}
            onSubmit={() => handleSendMessage()}
            disabled={isStreaming || revoking || isApproving}
            placeholder={
              chatMode === "ask"
                ? "Tanyakan data, SOP, atau fitur halaman ini"
                : "Tanyakan atau minta aksi admin"
            }
            aria-label="Ketik pesan untuk Zyx Ops AI"
          />
          {input.length > OPS_AI_POLICY_BOUNDS.maxMessageCharLength && (
            <p role="status" className="px-1 text-body-xs text-destructive">Pesan maksimal {OPS_AI_POLICY_BOUNDS.maxMessageCharLength} karakter.</p>
          )}
          <div className="flex items-center justify-between gap-2 pt-1.5">
            {/* Left controls: Mode toggle + Mid-chat Preset Launcher */}
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                role="group"
                aria-label="Mode percakapan"
                className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-muted/50 p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={chatMode === "edit"}
                  disabled={isStreaming}
                  onClick={() => {
                    setChatMode("edit");
                    setPresetFilter("all");
                  }}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-body-xs font-medium transition-colors cursor-pointer disabled:opacity-50",
                    chatMode === "edit"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Aksi
                </button>
                <button
                  type="button"
                  aria-pressed={chatMode === "ask"}
                  disabled={isStreaming}
                  onClick={() => {
                    setChatMode("ask");
                    setPresetFilter("all");
                  }}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-body-xs font-medium transition-colors cursor-pointer disabled:opacity-50",
                    chatMode === "ask"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Tanya
                </button>
              </div>

              {messages.length > 0 && (
                <Popover open={showPresetsPopover} onOpenChange={setShowPresetsPopover}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isStreaming || revoking || isApproving}
                      aria-label="Buka daftar preset pertanyaan dan aksi"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-background px-2 text-body-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <LayoutGrid className="size-3.5" aria-hidden="true" />
                      <span>Preset</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" className="w-72 p-1.5 space-y-1">
                    <button
                      type="button"
                      onClick={() => handleSelectPreset(CAPABILITY_OVERVIEW_PRESET)}
                      className="w-full flex items-center gap-2 rounded-lg bg-primary/5 px-2.5 py-2 text-left text-body-xs font-semibold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                    >
                      <Compass className="size-3.5 shrink-0" aria-hidden="true" />
                      <span>{CAPABILITY_OVERVIEW_PRESET.label}</span>
                    </button>
                    <div className="max-h-56 overflow-y-auto divide-y divide-border/50">
                      {dynamicPresets.presets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectPreset(preset)}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left text-body-xs text-foreground hover:bg-muted/60 rounded-md transition-colors cursor-pointer"
                        >
                          <span className="truncate">{preset.label}</span>
                          <span className="text-body-2xs text-muted-foreground shrink-0">
                            {preset.category === "action" ? "Aksi" : "Tanya"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Right controls: Revoke grant + Send/Stop */}
            <div className="flex items-center gap-1.5 shrink-0">
              {activeGrants.length > 0 && (
                <Button type="button" size="sm" variant="ghost" disabled={isStreaming || revoking || isApproving} onClick={() => void handleRevokeGrants()}>
                  Akhiri izin chat
                </Button>
              )}
              {isStreaming ? (
                <TooltipProvider><Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" size="icon-xs" variant="outline" onClick={stop} aria-label="Hentikan respons" className="size-8">
                      <Square className="size-3 fill-current" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Hentikan respons</TooltipContent>
                </Tooltip></TooltipProvider>
              ) : (
                <ZyraSendButton label="Kirim pesan" onClick={() => handleSendMessage()} disabled={revoking || isApproving || !input.trim() || input.length > OPS_AI_POLICY_BOUNDS.maxMessageCharLength} />
              )}
            </div>
          </div>
        </ZyraChatComposer>
        </div>
      </aside>
    </>
  );
}
