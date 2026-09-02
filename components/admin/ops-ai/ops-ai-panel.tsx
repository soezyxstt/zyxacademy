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
  User as UserIcon,
  Copy,
  Check,
  Square,
  ChevronRight,
  GripVertical,
} from "lucide-react";
import { useOpsAiContext } from "./ops-ai-context";
import {
  loadOpsAiMessages,
  saveOpsAiMessages,
  clearOpsAiMessages,
  type OpsAiMessageV2,
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

export function OpsAiPanel({ initialMessages }: { initialMessages?: OpsAiMessageV2[] } = {}) {
  const {
    isOpen,
    closePanel,
    width,
    setWidth,
    isDesktop,
    maxWidth,
  } = useOpsAiContext();

  const [messages, setMessages] = useState<OpsAiMessageV2[]>(() => initialMessages ?? []);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
      const loaded = loadOpsAiMessages();
      if (loaded.length > 0) {
        setMessages(loaded);
      }
    }
    setHasHydrated(true);

    const handleExternalUpdate = () => {
      const reloaded = loadOpsAiMessages();
      setMessages(reloaded);
    };

    window.addEventListener("zyx:ops-ai-messages-updated", handleExternalUpdate);
    return () => {
      window.removeEventListener("zyx:ops-ai-messages-updated", handleExternalUpdate);
    };
  }, [initialMessages]);

  // Synchronize messages with persistent storage after client mount
  useEffect(() => {
    if (hasHydrated) {
      saveOpsAiMessages(messages, true);
    }
  }, [messages, hasHydrated]);

  // Auto-scroll conversation container
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isStreaming]);

  // Focus textarea when panel opens without causing mobile horizontal page shift
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus({ preventScroll: true });
      }, 100);
    }
  }, [isOpen]);

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

  // Pointer drag resize
  const handlePointerDownResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const handlePointerMove = (ev: PointerEvent) => {
        const delta = startX - ev.clientX; // Leftward drag expands right panel
        const newWidth = clampOpsAiWidth(startWidth + delta, window.innerWidth);
        setWidth(newWidth);
      };

      const handlePointerUp = (ev: PointerEvent) => {
        try {
          target.releasePointerCapture(ev.pointerId);
        } catch {
          // Ignore
        }
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [width, setWidth]
  );

  const handleClearHistory = () => {
    setMessages([]);
    clearOpsAiMessages();
    toast.success("Riwayat percakapan telah dibersihkan.");
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

    // Prune trailing assistant response if empty or errored
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

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity lg:hidden"
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Main Panel Container: Desktop in-flow participant, Mobile fixed sheet */}
      <aside
        ref={panelRef}
        id="ops-ai-panel"
        role="complementary"
        aria-label="Zyx Ops AI Assistant"
        suppressHydrationWarning
        onKeyDown={handleKeyDownTrap}
        style={{ width: mounted && isDesktop ? `${width}px` : undefined }}
        className={cn(
          "flex flex-col border-l border-border bg-background transition-[width] duration-75 select-text overflow-hidden",
          "fixed inset-0 z-50 w-full sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[480px] h-full shadow-2xl",
          "lg:relative lg:inset-auto lg:top-0 lg:h-screen lg:shrink-0 lg:z-20 lg:shadow-none"
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
          className="hidden lg:flex absolute left-0 inset-y-0 w-2 -translate-x-1/2 cursor-col-resize items-center justify-center group touch-none select-none z-30"
        >
          <div className="w-1 h-10 rounded-sm bg-border group-hover:bg-primary group-focus-visible:bg-primary transition-colors flex items-center justify-center">
            <GripVertical className="size-2.5 text-muted-foreground group-hover:text-primary-foreground opacity-70" />
          </div>
        </div>

        {/* 1. Sticky Panel Header */}
        <header className="shrink-0 border-b border-border px-4 py-3 bg-card/60 backdrop-blur-md flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-body-sm font-bold text-foreground truncate">
                  Zyx Ops AI
                </h3>
                <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary shrink-0">
                  Ops Console
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate font-mono">
                {pathname || "/admin"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                aria-label="Bersihkan riwayat percakapan"
                title="Bersihkan riwayat percakapan"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <Trash2 className="size-4" />
              </button>
            )}

            <button
              type="button"
              onClick={closePanel}
              aria-label="Ciutkan panel"
              title="Ciutkan panel"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <ChevronRight className="size-4" />
            </button>

            <button
              type="button"
              onClick={closePanel}
              aria-label="Tutup panel"
              title="Tutup panel"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* 2. Conversation Area: The ONLY scrollable container */}
        <div
          role="region"
          aria-label="Riwayat percakapan"
          tabIndex={0}
          className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4 focus-visible:outline-none"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-2 py-8 space-y-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bot className="size-6" />
              </div>
              <div>
                <h4 className="font-heading text-body-base font-bold text-foreground">
                  Asisten Operasional Panel Admin
                </h4>
                <p className="mt-1 text-body-xs text-muted-foreground max-w-[320px]">
                  Tanyakan panduan fitur, skema basis data, atau minta bantuan menjalankan aksi administratif dengan konfirmasi aman.
                </p>
              </div>

              {/* Default Suggestions */}
              <div className="w-full space-y-1.5 pt-2 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1 block">
                  Rekomendasi Pertanyaan
                </span>
                {DEFAULT_SUGGESTIONS.map((sug, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSendMessage(sug)}
                    className="w-full text-left rounded-md border border-border/80 bg-card p-2.5 text-body-sm text-foreground/90 transition-colors hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isAssistant = msg.role === "assistant";
              const isLatestAssistant =
                isAssistant && index === messages.length - 1;

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex flex-col space-y-1.5",
                    msg.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  {/* Sender Header */}
                  <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                    {msg.role === "user" ? (
                      <>
                        <span>Administrator</span>
                        <UserIcon className="size-3" />
                      </>
                    ) : (
                      <>
                        <Bot className="size-3 text-primary" />
                        <span className="font-medium text-primary">Zyx Ops AI</span>
                      </>
                    )}
                  </div>

                  {/* Bubble Container */}
                  <div
                    className={cn(
                      "max-w-[94%] rounded-lg p-3 text-body-sm shadow-xs",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground font-normal"
                        : "bg-card border border-border/80 text-foreground w-full"
                    )}
                  >
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="space-y-3">
                        {/* 1. Work Trace Audit Section */}
                        {msg.workSteps && msg.workSteps.length > 0 && (
                          <WorkTraceView
                            steps={msg.workSteps}
                            defaultExpanded={isLatestAssistant && isStreaming}
                          />
                        )}

                        {/* 2. Markdown Answer Text */}
                        {msg.content && (
                          <div className="prose-admin text-body-sm leading-relaxed">
                            <MarkdownRenderer content={msg.content} />
                          </div>
                        )}

                        {/* 3. Citations Card: "Sumber yang diberikan kepada model" */}
                        {msg.citations && msg.citations.length > 0 && (
                          <CitationCards citations={msg.citations} />
                        )}

                        {/* 4. Action Proposal Cards */}
                        {msg.proposals && msg.proposals.length > 0 && (
                          <div className="space-y-2">
                            {msg.proposals.map((prop) => (
                              <ActionProposalCard key={prop.id} proposal={prop} />
                            ))}
                          </div>
                        )}

                        {/* Message Actions (Copy & Retry) */}
                        <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                            aria-label="Salin respons"
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="size-3 text-status-success" />
                                <span className="text-status-success">Tersalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="size-3" />
                                <span>Salin</span>
                              </>
                            )}
                          </button>

                          {isLatestAssistant && !isStreaming && lastUserMessage && (
                            <button
                              type="button"
                              onClick={handleRetryLast}
                              aria-label="Ulangi permintaan terakhir"
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                            >
                              <RotateCcw className="size-3" />
                              <span>Ulangi</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isStreaming && (
            <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-card p-3 text-body-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Zyx Ops AI sedang menganalisis dan memproses respons...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 3. Sticky Input Composer */}
        <footer className="shrink-0 border-t border-border p-3 bg-card/60 backdrop-blur-md z-10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2"
          >
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDownInput}
                rows={2}
                placeholder="Ketik pertanyaan atau aksi admin... (Enter untuk kirim)"
                disabled={isStreaming}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
              <div className="absolute right-2 bottom-2 text-[10px] text-muted-foreground hidden sm:block select-none pointer-events-none">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">Cmd</kbd> +{" "}
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">/</kbd>
              </div>
            </div>

            {isStreaming ? (
              <button
                type="button"
                onClick={handleStopStream}
                aria-label="Hentikan respons"
                className="inline-flex size-9 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90 cursor-pointer shrink-0"
              >
                <Square className="size-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Kirim pesan"
                className="inline-flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer shrink-0"
              >
                <Send className="size-4" />
              </button>
            )}
          </form>
        </footer>
      </aside>
    </>
  );
}
