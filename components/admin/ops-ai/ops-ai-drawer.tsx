"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  X,
  Send,
  Loader2,
  Trash2,
  Sparkles,
  BookOpen,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Bot,
  User as UserIcon,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { type OpsAiMessage, type OpsAiDocumentSource } from "@/lib/admin-ops-ai/types";
import { ActionProposalCard } from "./action-proposal-card";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "zyx_ops_ai_messages_v1";

const DEFAULT_SUGGESTIONS = [
  "Jelaskan fitur dan fungsi halaman ini",
  "Bagaimana format token aktivasi di Zyx Academy?",
  "Cek status feature flags yang sedang aktif",
  "Buatkan token aktivasi untuk kelompok 5 orang",
  "Bagaimana prosedur darurat rollback cache?",
];

export function OpsAiDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<OpsAiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setMessages(JSON.parse(saved));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save chat history
  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
  }, [messages]);

  // Global event listener for toggle and keyboard shortcut Cmd+/ or Ctrl+/
  useEffect(() => {
    const handleToggleEvent = () => setIsOpen((prev) => !prev);
    const handleOpenEvent = () => setIsOpen(true);
    const handleCloseEvent = () => setIsOpen(false);

    window.addEventListener("zyx:toggle-ops-ai", handleToggleEvent);
    window.addEventListener("zyx:open-ops-ai", handleOpenEvent);
    window.addEventListener("zyx:close-ops-ai", handleCloseEvent);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("zyx:toggle-ops-ai", handleToggleEvent);
      window.removeEventListener("zyx:open-ops-ai", handleOpenEvent);
      window.removeEventListener("zyx:close-ops-ai", handleCloseEvent);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Auto-scroll
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, loading]);

  const handleClearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const toggleSourceExpand = (id: string) => {
    setExpandedSources((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMessage: OpsAiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
      createdAt: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const qParams: Record<string, string> = {};
      searchParams?.forEach((val, key) => {
        qParams[key] = val;
      });

      const res = await fetch("/api/admin/ops-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          })),
          context: {
            currentPath: pathname || "/admin",
            queryParams: qParams,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memproses permintaan");
      }

      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      }
    } catch (err: any) {
      const errorMessage: OpsAiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Maaf, terjadi kesalahan saat menghubungi layanan AI: ${err.message || "Kesalahan internal."}`,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity sm:hidden"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <aside
        aria-label="Zyx Ops AI Assistant"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-background shadow-2xl transition-transform duration-200 ease-in-out sm:w-[440px] md:w-[480px]"
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 bg-card/60 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-body-sm font-bold text-foreground">Zyx Ops AI</h3>
                <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                  Ops Console
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Konteks: <span className="font-mono text-foreground/80">{pathname || "/admin"}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                title="Reset Sesi"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Reset sesi"
              >
                <Trash2 className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Tutup panel"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                  Tanyakan panduan fitur, skema basis data, atau minta bantuan menjalankan aksi administratif dengan konfirmasi.
                </p>
              </div>

              {/* Suggestions */}
              <div className="w-full space-y-1.5 pt-2 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  Rekomendasi Pertanyaan
                </span>
                {DEFAULT_SUGGESTIONS.map((sug, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSendMessage(sug)}
                    className="w-full text-left rounded-md border border-border/80 bg-card p-2.5 text-body-sm text-foreground/90 transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col space-y-1.5",
                  msg.role === "user" ? "items-end" : "items-start"
                )}
              >
                {/* Role header */}
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

                {/* Bubble */}
                <div
                  className={cn(
                    "max-w-[92%] rounded-lg p-3 text-body-sm shadow-xs",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground font-normal"
                      : "bg-card border border-border/80 text-foreground"
                  )}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="space-y-3">
                      {/* Markdown content */}
                      {msg.content && (
                        <div className="prose-admin text-body-sm leading-relaxed">
                          <MarkdownRenderer content={msg.content} />
                        </div>
                      )}

                      {/* Action Proposal Card if present */}
                      {msg.proposal && <ActionProposalCard proposal={msg.proposal} />}

                      {/* Tool Summary if present */}
                      {msg.toolResult && !msg.proposal && (
                        <div className="rounded-md border border-border/60 bg-muted/40 p-2 text-body-xs text-muted-foreground font-mono">
                          <span className="font-semibold text-foreground/80">Tool: {msg.toolResult.toolName}</span>
                          <p className="mt-0.5">{msg.toolResult.summary}</p>
                        </div>
                      )}

                      {/* RAG Sources list */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="pt-2 border-t border-border/50">
                          <button
                            type="button"
                            onClick={() => toggleSourceExpand(msg.id)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <BookOpen className="size-3" />
                            <span>{msg.sources.length} Referensi Dokumen</span>
                            {expandedSources[msg.id] ? (
                              <ChevronUp className="size-3" />
                            ) : (
                              <ChevronDown className="size-3" />
                            )}
                          </button>

                          {expandedSources[msg.id] && (
                            <div className="mt-2 space-y-1.5">
                              {msg.sources.map((src, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground border border-border/40"
                                >
                                  <div className="flex items-center justify-between font-semibold text-foreground/90">
                                    <span>{src.title} ({src.section || "Umum"})</span>
                                    <span className="font-mono text-[10px] text-muted-foreground">{src.filePath}</span>
                                  </div>
                                  <p className="mt-1 line-clamp-3 italic">{src.snippet}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-card p-3 text-body-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Zyx Ops AI sedang menganalisis dan memproses...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Composer */}
        <div className="shrink-0 border-t border-border p-3 bg-card/60 backdrop-blur-md">
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
                onKeyDown={handleKeyDown}
                rows={2}
                placeholder="Ketik pertanyaan atau aksi admin... (Enter untuk kirim)"
                disabled={loading}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
              <div className="absolute right-2 bottom-2 text-[10px] text-muted-foreground hidden sm:block">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">Cmd</kbd> +{" "}
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">/</kbd>
              </div>
            </div>

            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="inline-flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              aria-label="Kirim pesan"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

