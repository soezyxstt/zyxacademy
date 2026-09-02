"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  X,
  Send,
  Loader2,
  Trash2,
  Sparkles,
  RotateCcw,
  Bot,
  Copy,
  Check,
  Square,
  ChevronDown,
  Plus,
  MessageSquare,
  Clock,
  ArrowUp,
  Maximize2,
  Minimize2,
  Layers,
} from "lucide-react";
import { useOpsAiContext } from "./ops-ai-context";
import {
  loadOpsAiMessages,
  saveOpsAiMessages,
  clearOpsAiMessages,
  loadOpsAiSessions,
  saveOpsAiSessions,
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
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type {
  OpsAiWorkStep,
  OpsAiCitation,
  OpsAiActionProposalV2,
  OpsAiErrorData,
} from "@/lib/admin-ops-ai/contracts";

const DEFAULT_SUGGESTIONS = [
  "Jelaskan fitur dan fungsi halaman ini",
  "Bagaimana format token aktivasi di Zyx Academy?",
  "Cek status feature flags yang sedang aktif",
  "Buatkan token aktivasi untuk kelompok 5 orang",
  "Bagaimana prosedur darurat rollback cache?",
];

function formatSessionTime(timestamp: number): string {
  try {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) {
      return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

export function OpsAiPanel({ initialMessages }: { initialMessages?: OpsAiMessageV2[] } = {}) {
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
    return loadOpsAiSessions();
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return loadActiveSessionId();
  });
  const [messages, setMessages] = useState<OpsAiMessageV2[]>(() => initialMessages ?? []);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showSessionsDropdown, setShowSessionsDropdown] = useState(false);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Set mounted flag on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Hydration-safe initial load from localStorage and external update sync
  useEffect(() => {
    if (!initialMessages) {
      const loadedSessions = loadOpsAiSessions();
      setSessions(loadedSessions);

      let curSessionId = loadActiveSessionId();
      if (!curSessionId && loadedSessions.length > 0) {
        curSessionId = loadedSessions[0].id;
        saveActiveSessionId(curSessionId);
      }

      if (curSessionId) {
        setActiveSessionId(curSessionId);
        const curSession = loadedSessions.find((s) => s.id === curSessionId);
        if (curSession) {
          setMessages(curSession.messages);
        }
      } else {
        const loaded = loadOpsAiMessages();
        if (loaded.length > 0) {
          setMessages(loaded);
        }
      }
    }
    setHasHydrated(true);

    const handleExternalUpdate = () => {
      const reloadedSessions = loadOpsAiSessions();
      setSessions(reloadedSessions);
      const curId = loadActiveSessionId();
      if (curId) {
        const current = reloadedSessions.find((s) => s.id === curId);
        if (current) setMessages(current.messages);
      } else {
        const reloaded = loadOpsAiMessages();
        setMessages(reloaded);
      }
    };

    window.addEventListener("zyx:ops-ai-messages-updated", handleExternalUpdate);
    window.addEventListener("zyx:ops-ai-sessions-updated", handleExternalUpdate);
    return () => {
      window.removeEventListener("zyx:ops-ai-messages-updated", handleExternalUpdate);
      window.removeEventListener("zyx:ops-ai-sessions-updated", handleExternalUpdate);
    };
  }, [initialMessages]);

  // Synchronize messages with persistent session storage after client mount
  useEffect(() => {
    if (hasHydrated) {
      if (activeSessionId) {
        updateOpsAiSessionMessages(activeSessionId, messages);
      } else {
        saveOpsAiMessages(messages, true);
      }
    }
  }, [messages, hasHydrated, activeSessionId]);

  // Internal container auto-scroll: Strictly scrolls drawer without moving outer page
  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isOpen, isStreaming]);

  // Focus textarea when panel opens without causing mobile horizontal page shift
  useEffect(() => {
    if (isOpen && !showSessionsDropdown) {
      setTimeout(() => {
        textareaRef.current?.focus({ preventScroll: true });
      }, 100);
    }
  }, [isOpen, showSessionsDropdown]);

  // Mobile focus trap
  const handleKeyDownTrap = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" || isDesktop) return;

      const container = panelRef.current;
      if (!container) return;

      const focusables = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex="0"], a[href]'
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

  // Pointer drag resize: Smooth, jank-free, without pointer capture lockups
  const handlePointerDownResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      const startX = e.clientX;
      const startWidth = width;

      if (typeof document !== "undefined") {
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }

      const handlePointerMove = (ev: PointerEvent) => {
        ev.preventDefault();
        const delta = startX - ev.clientX; // Leftward drag expands right panel
        const newWidth = clampOpsAiWidth(startWidth + delta, window.innerWidth);
        setWidth(newWidth);
      };

      const handlePointerUp = () => {
        setIsDragging(false);
        if (typeof document !== "undefined") {
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        }
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove, { passive: false });
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [width, setWidth]
  );

  // Handle creating a new session
  const handleCreateNewSession = () => {
    const newSession = createOpsAiSession();
    const updatedSessions = [newSession, ...sessions];
    setSessions(updatedSessions);
    setActiveSessionId(newSession.id);
    setMessages([]);
    setShowSessionsDropdown(false);
    toast.success("Sesi percakapan baru telah dimulai.");
  };

  // Handle switching active session
  const handleSwitchSession = (session: OpsAiSession) => {
    setActiveSessionId(session.id);
    saveActiveSessionId(session.id);
    setMessages(session.messages);
    setShowSessionsDropdown(false);
  };

  // Handle deleting a single session
  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const remaining = deleteOpsAiSession(sessionId);
    setSessions(remaining);

    if (activeSessionId === sessionId) {
      if (remaining.length > 0) {
        setActiveSessionId(remaining[0].id);
        setMessages(remaining[0].messages);
      } else {
        const fresh = createOpsAiSession();
        setSessions([fresh]);
        setActiveSessionId(fresh.id);
        setMessages([]);
      }
    }
    toast.success("Sesi percakapan berhasil dihapus.");
  };

  // Handle clearing history of active session
  const handleClearActiveHistory = () => {
    setMessages([]);
    clearOpsAiMessages();
    if (activeSessionId) {
      updateOpsAiSessionMessages(activeSessionId, []);
      const reloaded = loadOpsAiSessions();
      setSessions(reloaded);
    }
    toast.success("Riwayat percakapan sesi ini telah dibersihkan.");
  };

  // Handle clearing all sessions completely
  const handleClearAllSessions = () => {
    clearAllOpsAiSessions();
    const fresh = createOpsAiSession();
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
    setMessages([]);
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

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      toast.info("Pemrosesan respons telah dihentikan.");
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isStreaming) return;

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      const fresh = createOpsAiSession();
      targetSessionId = fresh.id;
      setActiveSessionId(fresh.id);
      setSessions((prev) => [fresh, ...prev]);
    }

    const userMsg: OpsAiMessageV2 = {
      id: `msg-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: "user",
      content: query,
      createdAt: Date.now(),
    };

    const assistantMsgId = `msg-asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const assistantMsg: OpsAiMessageV2 = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      workSteps: [],
      citations: [],
      proposals: [],
    };

    const nextMessages = [...messages, userMsg, assistantMsg];
    setMessages(nextMessages);
    setInput("");
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const qParams: Record<string, string> = {};
      searchParams?.forEach((val, key) => {
        qParams[key] = val;
      });

      const res = await fetch("/api/admin/ops-ai", {
        method: "POST",
        signal: abortController.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .filter((m) => m.role === "user" || (m.role === "assistant" && m.content.length > 0))
            .map((m) => ({
              role: m.role === "user" ? "user" : "assistant",
              content: m.content,
            })),
          context: {
            currentPath: pathname || "/admin",
            queryParams: qParams,
          },
        }),
      });

      if (!res.ok) {
        let errText = "Gagal menghubungi layanan Zyx Ops AI.";
        try {
          const errJson = await res.json();
          if (errJson.error) errText = errJson.error;
        } catch {
          // Ignore parse errors
        }
        throw new Error(errText);
      }

      if (!res.body) {
        throw new Error("Respons stream tidak tersedia.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === "[DONE]") {
            break;
          }

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.type === "text-delta" && typeof parsed.textDelta === "string") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + parsed.textDelta }
                    : m
                )
              );
            } else if (parsed.type === "data-work-step" && parsed.data) {
              const step: OpsAiWorkStep = parsed.data;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMsgId) return m;
                  const existing = m.workSteps || [];
                  const stepIdx = existing.findIndex((s) => s.stepId === step.stepId);
                  let updatedSteps: OpsAiWorkStep[];
                  if (stepIdx >= 0) {
                    updatedSteps = [...existing];
                    updatedSteps[stepIdx] = step;
                  } else {
                    updatedSteps = [...existing, step];
                  }
                  return { ...m, workSteps: updatedSteps };
                })
              );
            } else if (parsed.type === "data-citation" && parsed.data) {
              const citation: OpsAiCitation = parsed.data;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMsgId) return m;
                  const existing = m.citations || [];
                  if (existing.some((c) => c.id === citation.id)) return m;
                  return { ...m, citations: [...existing, citation] };
                })
              );
            } else if (parsed.type === "data-proposal" && parsed.data) {
              const proposal: OpsAiActionProposalV2 = parsed.data;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMsgId) return m;
                  const existing = m.proposals || [];
                  if (existing.some((p) => p.id === proposal.id)) return m;
                  return { ...m, proposals: [...existing, proposal] };
                })
              );
            } else if (parsed.type === "data-error" && parsed.data) {
              const errData: OpsAiErrorData = parsed.data;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        error: errData,
                        content: m.content || `Terjadi kendala: ${errData.message}`,
                      }
                    : m
                )
              );
            }
          } catch {
            // Ignore parse errors on individual stream chunks
          }
        }
      }
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantMsgId) return m;
            const updatedSteps = (m.workSteps || []).map((s) =>
              s.status === "running" ? { ...s, status: "cancelled" as const } : s
            );
            return {
              ...m,
              workSteps: updatedSteps,
              content: m.content || "Permintaan dihentikan oleh pengguna.",
            };
          })
        );
      } else {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan sistem saat streaming.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content:
                    m.content ||
                    `Maaf, terjadi kesalahan saat menghubungi layanan AI: ${msg}`,
                }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleRetryLast = () => {
    if (isStreaming) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    setMessages((prev) => {
      const copy = [...prev];
      if (copy.length > 0 && copy[copy.length - 1]?.role === "assistant") {
        copy.pop();
      }
      return copy;
    });

    handleSendMessage(lastUser.content);
  };

  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  const currentSession = sessions.find((s) => s.id === activeSessionId);
  const activeTitle =
    currentSession?.title && currentSession.title !== "Percakapan Baru"
      ? currentSession.title
      : "Zyx Ops Assistant";

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity lg:hidden"
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Active Resize Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none pointer-events-auto" />
      )}

      {/* Main Panel Container: Cloudflare Style Layout */}
      <aside
        ref={panelRef}
        id="ops-ai-panel"
        role="complementary"
        aria-label="Zyx Ops AI Assistant"
        suppressHydrationWarning
        onKeyDown={handleKeyDownTrap}
        style={{ width: mounted && isDesktop ? `${width}px` : undefined }}
        className={cn(
          "flex flex-col border-l border-border bg-background select-text overflow-hidden",
          "bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px]",
          isDragging ? "transition-none select-none" : "transition-[width] duration-75",
          "fixed inset-0 z-50 w-full sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[480px] h-full shadow-2xl",
          "lg:sticky lg:top-0 lg:self-start lg:h-screen lg:shrink-0 lg:z-20 lg:shadow-none"
        )}
      >
        {/* Resize Handle: Desktop only */}
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
          className={cn(
            "hidden lg:flex absolute -left-2 inset-y-0 w-4 cursor-col-resize items-center justify-center group touch-none select-none z-30",
            isDragging && "cursor-col-resize"
          )}
        >
          <div
            className={cn(
              "w-1 h-12 rounded-sm bg-border transition-colors flex items-center justify-center",
              "group-hover:bg-primary group-hover:w-1.5 group-focus-visible:bg-primary group-focus-visible:w-1.5",
              isDragging && "bg-primary w-1.5"
            )}
          />
        </div>

        {/* 1. Header: Cloudflare Style (Title Dropdown + Minimal Action Icons) */}
        <header className="shrink-0 border-b border-border/80 px-3.5 py-2.5 bg-background/80 backdrop-blur-md flex items-center justify-between z-20 gap-2">
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
              <div className="absolute top-full left-0 mt-1 w-[320px] rounded-xl border border-border bg-background shadow-xl p-2 z-50 space-y-1">
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>Daftar Sesi ({sessions.length})</span>
                  <button
                    type="button"
                    onClick={handleCreateNewSession}
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
                          onClick={() => handleSwitchSession(sess)}
                          className={cn(
                            "flex items-center justify-between gap-2 p-2 rounded-lg text-body-xs cursor-pointer transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary font-semibold"
                              : "hover:bg-muted text-foreground"
                          )}
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-1.5">
                            <MessageSquare className="size-3 shrink-0 opacity-70" />
                            <span className="truncate">{sess.title || "Percakapan Baru"}</span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {sess.messages.length}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSession(e, sess.id)}
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
                      onClick={handleClearAllSessions}
                      className="text-[11px] text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      Hapus Semua Sesi
                    </button>
                    {messages.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearActiveHistory}
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
              onClick={handleCreateNewSession}
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
        </header>

        {/* 2. Conversation Flow: Natural Stream Without Heavy Card Wrapper */}
        <div
          ref={scrollContainerRef}
          role="region"
          aria-label="Riwayat percakapan"
          tabIndex={0}
          className="flex-1 overflow-y-auto min-h-0 p-4 space-y-6 focus-visible:outline-none"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-2 py-12 space-y-4">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h4 className="font-heading text-body-base font-bold text-foreground">
                  Zyx Ops AI
                </h4>
                <p className="mt-1 text-body-xs text-muted-foreground max-w-[320px]">
                  Asisten operasional Zyx Academy. Tanyakan konfigurasi, jalankan query skema, atau buat token aktivasi.
                </p>
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
                // User Message Bubble (Cloudflare Style: Compact Right-Aligned Bubble)
                return (
                  <div key={msg.id || index} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-muted/90 text-foreground px-4 py-2.5 text-body-sm leading-relaxed shadow-2xs">
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                  </div>
                );
              }

              // Assistant Message Stream (Cloudflare Style: Direct In-Line Flow)
              return (
                <div key={msg.id || index} className="space-y-2 select-text">
                  {/* Reasoning / Work Trace (In-line top) */}
                  {msg.workSteps && msg.workSteps.length > 0 && (
                    <WorkTraceView steps={msg.workSteps} />
                  )}

                  {/* Agent Header Label */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-heading text-body-xs font-bold text-primary">
                      Agent
                    </span>
                  </div>

                  {/* Message Content Flow (Natural typography, no heavy outer card) */}
                  {msg.content ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none break-words text-body-sm leading-relaxed">
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  ) : isStreaming && index === messages.length - 1 ? (
                    <div className="flex items-center gap-2 text-body-xs text-muted-foreground italic py-1">
                      <Loader2 className="size-3 animate-spin text-primary" />
                      <span>Sedang menganalisis dokumen dan konteks...</span>
                    </div>
                  ) : null}

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
                          onExecuted={(proposalId, result) => {
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
                </div>
              );
            })
          )}
        </div>

        {/* 3. Floating Modern Composer (Cloudflare Style) */}
        <footer className="shrink-0 border-t border-border/40 p-3 pt-2">
          <div className="relative rounded-2xl border border-border bg-background/95 backdrop-blur-md shadow-md focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20 transition-all p-2.5">
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDownInput}
              disabled={isStreaming}
              placeholder={
                isStreaming
                  ? "Asisten sedang merespons..."
                  : "Tanyakan apa saja seputar operasional Zyx..."
              }
              aria-label="Ketik pesan untuk Zyx Ops AI"
              className="w-full resize-none bg-transparent px-1.5 py-1 text-body-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 min-h-[44px]"
            />

            <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-border/40 px-1">
              {/* Left: Pill action tag */}
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-2.5 py-0.5 text-[11px] font-medium text-foreground/80 border border-border/40">
                  <Sparkles className="size-2.5 text-primary" />
                  <span>Ops Assistant</span>
                </span>
              </div>

              {/* Right: Send / Stop Circular Action Button */}
              <div className="flex items-center gap-1.5">
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStopStream}
                    aria-label="Hentikan respons"
                    title="Hentikan respons"
                    className="flex size-7.5 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer shadow-xs"
                  >
                    <Square className="size-3 fill-current" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={!input.trim()}
                    aria-label="Kirim pesan"
                    title="Kirim pesan"
                    className="flex size-7.5 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </footer>
      </aside>
    </>
  );
}
