"use client";

import { usePanelViewport } from "@/hooks/use-panel-viewport";
import { useDialogHistory } from "@/hooks/use-dialog-history";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  X,
  Loader2,
  Trash2,
  Bot,
  Copy,
  Check,
  Square,
  ChevronDown,
  Plus,
  MessageSquare,
  Maximize2,
  Minimize2,
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
import { QuickActionsBar, extractQuickActions } from "./quick-actions-bar";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useOpsAiChat } from "./use-ops-ai-chat";
import { OPS_AI_POLICY_BOUNDS } from "@/lib/admin-ops-ai/contracts";
import { ZyraComposerInput, type ZyraComposerInputHandle } from "@/components/course/zyra-composer-input";
import { ZyraChatComposer, ZyraChatHeader, ZyraChatHistory, ZyraSendButton } from "@/components/course/zyra-chat-frame";
import { TutorAssistantLabel, TutorAssistantSurface, TutorStudentMessage } from "@/components/course/tutor-message-frame";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const DEFAULT_SUGGESTIONS = [
  "Jelaskan fitur dan fungsi halaman ini",
  "Bagaimana format token aktivasi di Zyx Academy?",
  "Cek status feature flags yang sedang aktif",
  "Buatkan token aktivasi untuk kelompok 5 orang",
  "Bagaimana prosedur darurat rollback cache?",
];

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
  const [showSessionsDropdown, setShowSessionsDropdown] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pathname = usePathname();
  const tab = useSearchParams()?.get("tab");
  const { messages, setMessages, input, setInput, isStreaming, stop, sendMessage } = useOpsAiChat({
    initialMessages,
    context: {
      currentPath: pathname || "/admin",
      mode: "edit",
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
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isOpen, isStreaming]);

  // Focus textarea when panel opens without causing mobile horizontal page shift
  useEffect(() => {
    if (isOpen && !showSessionsDropdown) {
      const timer = window.setTimeout(() => textareaRef.current?.focus(), 100);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, showSessionsDropdown]);

  // Mobile focus trap
  const handleKeyDownTrap = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" || isDesktop) return;

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
    [isDesktop]
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
    if (width >= maxWidth - 20) {
      setWidth(OPS_AI_DEFAULT_WIDTH);
    } else {
      setWidth(maxWidth);
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success("Jawaban berhasil disalin ke papan klip.");
    }
  };

  const handleSendMessage = (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || isStreaming || approvalPending.current || revoking || query.length > OPS_AI_POLICY_BOUNDS.maxMessageCharLength) return;
    let chatId = activeSessionId;
    if (!chatId) {
      const fresh = createOpsAiSession(undefined, accountId);
      chatId = fresh.id;
      setActiveSessionId(chatId);
      setSessions(loadOpsAiSessions(accountId));
    }
    const grantIds = activeGrants.filter(grant => grant.until > Date.now()).map(grant => grant.id);
    void sendMessage(query, { chatId, grantIds });
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

      {/* Main Panel Container: Cloudflare Style Layout */}
      <aside
        ref={panelRef}
        id="ops-ai-panel"
        role="complementary"
        aria-label="Zyx Ops AI Assistant"
        data-state={isVisible ? "open" : "closed"}
        suppressHydrationWarning
        onKeyDown={handleKeyDownTrap}
        style={{
          "--ops-ai-width": `${width}px`,
          width: mounted && isDesktop ? (isVisible ? `${width}px` : "0px") : undefined,
        } as React.CSSProperties}
        className={cn(
          "flex flex-col overflow-hidden border-l border-border bg-background select-text relative min-w-0",
          "bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px]",
          "transition-[transform,width,opacity,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          "fixed inset-y-0 right-0 left-4 z-50 sm:left-auto sm:w-[480px] shadow-2xl top-[var(--panel-visible-top,0px)] h-[var(--panel-visible-height,100dvh)]",
          "lg:sticky lg:self-start lg:shrink-0 lg:z-40 lg:shadow-none",
          isVisible
            ? "translate-x-0 opacity-100"
            : "translate-x-full opacity-0 pointer-events-none lg:translate-x-0 lg:border-l-transparent"
        )}
      >
        <div
          className={cn(
            "relative flex h-full min-h-0 w-full flex-col lg:min-w-[var(--ops-ai-width)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            isVisible ? "lg:translate-x-0" : "lg:translate-x-4"
          )}
        >
        {/* Resize Handle: Desktop & Tablet with wide 24px hit area */}
        <div
          role="separator"
          tabIndex={0}
          aria-label="Ubah ukuran panel Ops AI"
          aria-orientation="vertical"
          aria-valuenow={mounted ? width : OPS_AI_DEFAULT_WIDTH}
          aria-valuemin={OPS_AI_MIN_WIDTH}
          aria-valuemax={maxWidth}
          suppressHydrationWarning
          onKeyDown={handleKeyDownResize}
          onPointerDown={handlePointerDownResize}
          style={{ touchAction: "none" }}
          className="flex absolute left-0 inset-y-0 w-3.5 cursor-col-resize items-center justify-center group select-none z-50 hover:bg-primary/5 active:bg-primary/10 transition-colors"
        >
          <div
            className="w-1 h-16 rounded-full bg-border/90 transition-all duration-150 flex items-center justify-center group-hover:bg-primary group-hover:w-1.5 group-focus-visible:bg-primary group-focus-visible:w-1.5 active:bg-primary active:w-1.5"
          />
        </div>

        {/* 1. Header: Cloudflare Style (Title Dropdown + Minimal Action Icons) */}
        <ZyraChatHeader>
          {/* Left: Session Dropdown Selector */}
          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setShowSessionsDropdown((prev) => !prev)}
              aria-expanded={showSessionsDropdown}
              aria-label="Daftar riwayat sesi"
              className="flex items-center gap-1.5 text-left text-body-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer truncate max-w-full group"
            >
              <span className="truncate max-w-[240px]">{activeTitle}</span>
              <ChevronDown className="size-3.5 text-muted-foreground group-hover:text-primary transition-transform shrink-0" />
            </button>

            {/* Session Dropdown Menu */}
            {showSessionsDropdown && (
              <div className="absolute top-full left-0 mt-1 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-border bg-background shadow-xl p-2 z-50 space-y-1">
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>Daftar Sesi ({sessions.length})</span>
                  <button
                    type="button"
                    onClick={handleCreateNewSession} disabled={isApproving}
                    aria-label="Percakapan baru"
                    className="text-primary hover:underline text-[11px] font-medium cursor-pointer"
                  >
                    + Sesi Baru
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
                            "flex items-center justify-between gap-2 p-2 rounded-lg text-body-xs cursor-pointer transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary font-semibold"
                              : "hover:bg-muted text-foreground"
                          )}
                        >
                          <button type="button" onClick={() => handleSwitchSession(sess)} disabled={isApproving} aria-current={isActive ? "true" : undefined} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-body-sm">
                            <MessageSquare className="size-3 shrink-0 opacity-70" aria-hidden="true" />
                            <span className="truncate">{sess.title || "Percakapan baru"}</span>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {sess.messages.length}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSession(e, sess.id)} disabled={isApproving}
                              aria-label={`Hapus sesi ${sess.title}`}
                              className="size-6 inline-flex items-center justify-center text-muted-foreground hover:text-destructive rounded-sm"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {sessions.length > 0 && (
                  <div className="pt-1 border-t border-border/50 flex justify-between px-1">
                    <button
                      type="button"
                      onClick={handleClearAllSessions} disabled={isApproving}
                      className="text-[11px] text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      Hapus Semua Sesi
                    </button>
                    {messages.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearActiveHistory} disabled={isApproving}
                        aria-label="Bersihkan riwayat percakapan"
                        className="text-[11px] text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        Bersihkan Chat Ini
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Cloudflare Minimal Action Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {/* New Chat Button */}
            <button
              type="button"
              onClick={handleCreateNewSession} disabled={isApproving}
              aria-label="Percakapan baru"
              title="Percakapan baru"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Plus className="size-4" />
            </button>

            {/* Expand / Maximize Button (Desktop only) */}
            <button
              type="button"
              onClick={handleToggleExpandWidth}
              aria-label="Ubah lebar panel"
              title="Ubah lebar panel"
              className="hidden lg:inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              {width >= maxWidth - 20 ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
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
              <X className="size-4" />
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

        {/* 2. Conversation Flow: Natural Stream Without Heavy Card Wrapper */}
        <ZyraChatHistory ref={scrollContainerRef} aria-label="Riwayat percakapan">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-2 py-12 space-y-4">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bot className="size-5" />
              </div>
              <div>
                <h4 className="font-heading text-body-base font-bold text-foreground">
                  Zyx Ops AI
                </h4>
              </div>

              {/* Suggestions */}
              <div className="w-full space-y-1.5 pt-4 text-left">
                {DEFAULT_SUGGESTIONS.map((sug, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSendMessage(sug)}
                    className="w-full text-left rounded-xl border border-border/70 bg-background/80 p-2.5 text-body-sm text-foreground/90 transition-colors hover:border-primary/50 hover:bg-primary/5 cursor-pointer shadow-2xs"
                  >
                    {sug}
                  </button>
                ))}
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

              return (
                <div key={msg.id || index} className="space-y-2 select-text">
                  <TutorAssistantSurface>
                    <TutorAssistantLabel label="Zyx Ops AI" />
                    {msg.workSteps && msg.workSteps.length > 0 && <WorkTraceView steps={msg.workSteps} />}
                    {/* Message Content Flow (Natural typography, no heavy outer card) */}
                    {(() => {
                      const { cleanedContent, quickActions } = extractQuickActions(msg.content);
                      const isLatestAssistant = index === messages.length - 1;

                      return (
                        <>
                          {cleanedContent ? (
                            <div className="min-w-0 max-w-full wrap-break-word text-body-base text-foreground">
                              <MarkdownRenderer content={cleanedContent} density="compact" />
                            </div>
                          ) : isStreaming && isLatestAssistant ? (
                            <div role="status" className="flex items-center gap-2 py-1 text-body-xs text-muted-foreground">
                              <Loader2 className="size-3 animate-spin text-primary" />
                              <span>Menyiapkan respons</span>
                            </div>
                          ) : null}

                          {/* Interactive Quick Actions Bar */}
                          {quickActions.length > 0 && isLatestAssistant && !msg.proposals?.length && (
                            <QuickActionsBar
                              options={quickActions}
                              onSelect={(opt) => handleSendMessage(opt)}
                              disabled={isStreaming}
                            />
                          )}
                        </>
                      );
                    })()}

                    {msg.error && msg.content !== `Terjadi kendala: ${msg.error.message}` && (
                      <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-body-xs text-destructive">
                        {msg.error.message}
                      </p>
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
                          className="inline-flex items-center gap-1 text-[11px] hover:text-foreground transition-colors cursor-pointer py-0.5 px-1.5 rounded-md hover:bg-muted"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="size-3 text-emerald-500" />
                              <span>Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" />
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
            placeholder="Tanyakan atau minta aksi admin"
            aria-label="Ketik pesan untuk Zyx Ops AI"
          />
          {input.length > OPS_AI_POLICY_BOUNDS.maxMessageCharLength && (
            <p role="status" className="px-1 text-body-xs text-destructive">Pesan maksimal {OPS_AI_POLICY_BOUNDS.maxMessageCharLength} karakter.</p>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
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
        </ZyraChatComposer>
        </div>
      </aside>
    </>
  );
}
