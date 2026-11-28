"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ChevronDown,
  ChevronUp,
  LineChart,
  ListOrdered,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent } from "@ui-sdk/react/popover";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/react/collapsible";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";
import { extractZyraSelection } from "@/lib/zyra/selection-serializer";
import {
  deriveInlineUiFromMessages,
  type AssessmentUiBlock,
  type AssessmentUiSpec,
  type InlineExplanationContext,
  type InlineExplanationIntent,
} from "@/lib/zyra/inline-explanation";

export interface ZyraInlineExplanationHostProps {
  courseId: string;
  assessmentKind: "quiz" | "tryout";
  assessmentId: string;
  questionId: string;
  questionPrompt: string;
  studentAnswer?: string;
  correctAnswer?: string;
  explanationSpec?: AssessmentUiSpec | null;
  explanationMarkdown?: string | null;
  renderUiSpec?: (spec: AssessmentUiSpec) => React.ReactNode;
  children: (renderBlockAfter: (blockId: string) => React.ReactNode) => React.ReactNode;
}

interface PendingSelection {
  anchorBlockId: string;
  snippet: string;
  surroundingText?: string;
  coords: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

interface InlineThreadRecord {
  id: string;
  anchorBlockId: string;
  snippet: string;
  surroundingText?: string;
  intent: InlineExplanationIntent;
  initialPrompt: string;
  collapsed: boolean;
}

function findAnchorBlockId(range: Range, hostEl: HTMLElement): string | null {
  const candidates: Array<Node | null> = [
    range.endContainer,
    range.commonAncestorContainer,
    range.startContainer,
  ];

  for (const node of candidates) {
    if (!node) continue;
    const el =
      node instanceof Element ? node : node.parentElement;
    if (!el || !hostEl.contains(el)) continue;
    const blockEl = el.closest("[data-assessment-block-id]");
    if (blockEl && hostEl.contains(blockEl)) {
      const id = blockEl.getAttribute("data-assessment-block-id")?.trim();
      if (id) return id;
    }
  }
  return null;
}

function isInsideInlineThread(node: Node | null): boolean {
  if (!node) return false;
  const el = node instanceof Element ? node : node.parentElement;
  return Boolean(el?.closest("[data-zyra-inline-thread]"));
}

function buildQuickPrompt(intent: InlineExplanationIntent, snippet: string): string {
  const shortSnippet = snippet.length > 220 ? `${snippet.slice(0, 220)}...` : snippet;
  if (intent === "step_by_step") {
    return `Uraikan langkah demi langkah untuk bagian ini: "${shortSnippet}"`;
  }
  if (intent === "visualize") {
    return `Buat visualisasi atau skema yang mempermudah pemahaman bagian ini: "${shortSnippet}"`;
  }
  return `Jelaskan bagian ini secara ringkas dan jelas: "${shortSnippet}"`;
}

function extractMessageText(message: UIMessage): string {
  if (!Array.isArray(message.parts)) return "";
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
}

function FallbackBlock({ block }: { block: AssessmentUiBlock }) {
  if (block.type === "markdown") {
    return <MarkdownRenderer content={block.content} density="compact" />;
  }

  if (block.type === "formula_card") {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 space-y-1">
        {block.title && (
          <p className="font-heading text-body-xs font-semibold text-foreground">
            {block.title}
          </p>
        )}
        <div className="text-body-sm text-foreground overflow-x-auto">
          <MathText>{`$$${block.latex}$$`}</MathText>
        </div>
        {block.note && (
          <p className="text-body-xs text-muted-foreground">{block.note}</p>
        )}
      </div>
    );
  }

  if (block.type === "callout") {
    const toneClass =
      block.tone === "warning" || block.tone === "mistake"
        ? "border-status-warning/40 bg-status-warning/10"
        : block.tone === "tip"
          ? "border-status-success/40 bg-status-success/10"
          : "border-border bg-muted/30";
    return (
      <div className={cn("rounded-lg border px-3 py-2.5 space-y-1", toneClass)}>
        {block.title && (
          <p className="font-heading text-body-xs font-semibold text-foreground">
            {block.title}
          </p>
        )}
        <div className="text-body-sm text-foreground">
          <MarkdownRenderer content={block.content} density="compact" />
        </div>
      </div>
    );
  }

  if (block.type === "steps") {
    return (
      <div className="space-y-2">
        {block.title && (
          <p className="font-heading text-body-xs font-semibold text-foreground">
            {block.title}
          </p>
        )}
        <ol className="space-y-2 border-l border-border pl-3">
          {block.steps.map((step, idx) => (
            <li key={step.id} className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-body-2xs font-semibold text-muted-foreground tabular-nums">
                  {idx + 1}.
                </span>
                <span className="font-heading text-body-sm font-semibold text-foreground">
                  {step.title}
                </span>
              </div>
              {step.summary && (
                <p className="text-body-xs text-muted-foreground">{step.summary}</p>
              )}
              <div className="space-y-1.5">
                {step.blocks.map((child) => (
                  <FallbackBlock key={child.id} block={child} />
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (block.type === "collapsible") {
    return (
      <Collapsible defaultOpen={block.defaultOpen ?? false}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-left text-body-xs font-semibold text-foreground hover:bg-muted/60">
          <span>{block.title}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsiblePanel className="pt-2 pl-2 space-y-1.5">
          {block.blocks.map((child) => (
            <FallbackBlock key={child.id} block={child} />
          ))}
        </CollapsiblePanel>
      </Collapsible>
    );
  }

  if (block.type === "image") {
    return (
      <figure className="space-y-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={block.src}
          alt={block.alt}
          className="max-w-full rounded-lg border border-border object-contain"
        />
        {block.caption && (
          <figcaption className="text-body-xs text-muted-foreground">
            {block.caption}
          </figcaption>
        )}
      </figure>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-body-xs text-muted-foreground">
      {block.title ? `${block.title} (${block.type})` : `Visual ${block.type}`}
    </div>
  );
}

function FallbackInlineUiRenderer({ spec }: { spec: AssessmentUiSpec }) {
  return (
    <div className="space-y-2.5">
      {spec.blocks.map((block) => (
        <FallbackBlock key={block.id} block={block} />
      ))}
    </div>
  );
}

interface ZyraInlineThreadCardProps {
  thread: InlineThreadRecord;
  baseContext: Omit<InlineExplanationContext, "selectedSnippet" | "anchorBlockId" | "surroundingText" | "intent">;
  renderUiSpec?: (spec: AssessmentUiSpec) => React.ReactNode;
  onToggleCollapse: (threadId: string) => void;
  onClose: (threadId: string) => void;
}

function ZyraInlineThreadCard({
  thread,
  baseContext,
  renderUiSpec,
  onToggleCollapse,
  onClose,
}: ZyraInlineThreadCardProps) {
  const [followUp, setFollowUp] = useState("");
  const sentInitialRef = useRef(false);

  const requestContext: InlineExplanationContext = useMemo(
    () => ({
      ...baseContext,
      selectedSnippet: thread.snippet,
      anchorBlockId: thread.anchorBlockId,
      surroundingText: thread.surroundingText,
      intent: thread.intent,
    }),
    [baseContext, thread.anchorBlockId, thread.intent, thread.snippet, thread.surroundingText]
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/zyra/explanation-inline",
        body: {
          context: requestContext,
        },
      }),
    [requestContext]
  );

  const { messages, sendMessage, regenerate, stop, status, error } = useChat({
    id: thread.id,
    transport,
  });

  useEffect(() => {
    if (sentInitialRef.current) return;
    sentInitialRef.current = true;
    void sendMessage({ text: thread.initialPrompt });
  }, [sendMessage, thread.initialPrompt]);

  const derivedUi = useMemo(
    () => deriveInlineUiFromMessages(messages),
    [messages]
  );

  const isBusy = status === "submitted" || status === "streaming";

  const handleSubmitFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = followUp.trim();
    if (!trimmed || isBusy) return;
    setFollowUp("");
    void sendMessage({ text: trimmed });
  };

  const visibleMessages = useMemo(() => {
    return messages
      .map((msg, idx) => ({
        id: msg.id,
        role: msg.role,
        text: extractMessageText(msg),
        isInitialUserPrompt: idx === 0 && msg.role === "user",
      }))
      .filter((item) => !item.isInitialUserPrompt && item.text.length > 0);
  }, [messages]);

  const latestAssistantMessage = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
      if (visibleMessages[i].role === "assistant") return visibleMessages[i];
    }
    return null;
  }, [visibleMessages]);

  const historyMessages = useMemo(() => {
    if (!latestAssistantMessage) return visibleMessages;
    return visibleMessages.filter((item) => item.id !== latestAssistantMessage.id);
  }, [visibleMessages, latestAssistantMessage]);

  return (
    <section
      data-zyra-inline-thread={thread.id}
      data-anchor-block-id={thread.anchorBlockId}
      aria-label="Penjelasan inline Zyra"
      className="my-4 border-l-2 border-brand-primary/60 pl-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquareText className="size-3.5 shrink-0 text-brand-primary" aria-hidden />
          <span className="font-heading text-body-xs font-bold text-foreground shrink-0">
            Zyra
          </span>
          <span className="truncate text-body-xs text-muted-foreground">
            {thread.snippet}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isBusy && (
            <span className="inline-flex items-center gap-1 text-body-2xs text-muted-foreground pr-1">
              <Loader2 className="size-3 animate-spin text-brand-primary" />
              <span>{derivedUi.isStreamingTool ? "Memperbarui tampilan" : "Menjelaskan"}</span>
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onToggleCollapse(thread.id)}
            aria-label={thread.collapsed ? "Buka penjelasan Zyra" : "Lipat penjelasan Zyra"}
            className="size-6 text-muted-foreground hover:text-foreground"
          >
            {thread.collapsed ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronUp className="size-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (isBusy) stop();
              onClose(thread.id);
            }}
            aria-label="Tutup penjelasan Zyra"
            className="size-6 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {!thread.collapsed && (
        <div className="space-y-3">
          {latestAssistantMessage && (
            <div className="text-body-sm leading-relaxed text-foreground">
              <MarkdownRenderer content={latestAssistantMessage.text} density="compact" />
            </div>
          )}

          {derivedUi.spec && derivedUi.spec.blocks.length > 0 && (
            <div data-zyra-inline-ui className="space-y-2.5 pt-1">
              {renderUiSpec ? (
                renderUiSpec(derivedUi.spec)
              ) : (
                <FallbackInlineUiRenderer spec={derivedUi.spec} />
              )}
            </div>
          )}

          {historyMessages.length > 0 && (
            <Collapsible defaultOpen={false} className="border-t border-border/50 pt-2">
              <CollapsibleTrigger className="group flex items-center gap-1.5 text-body-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                <ChevronDown className="size-3.5 shrink-0 transition-transform group-aria-expanded:rotate-180" aria-hidden />
                <span>Riwayat diskusi ({historyMessages.length})</span>
              </CollapsibleTrigger>
              <CollapsiblePanel className="mt-2 space-y-2 border-l border-border/60 pl-3">
                {historyMessages.map((item) => (
                  <div key={item.id} className="text-body-xs leading-relaxed">
                    <span className="font-semibold text-muted-foreground">
                      {item.role === "user" ? "Anda: " : "Zyra: "}
                    </span>
                    {item.role === "user" ? (
                      <span className="text-foreground">{item.text}</span>
                    ) : (
                      <div className="mt-0.5 text-muted-foreground">
                        <MarkdownRenderer content={item.text} density="compact" />
                      </div>
                    )}
                  </div>
                ))}
              </CollapsiblePanel>
            </Collapsible>
          )}

          {isBusy && visibleMessages.length === 0 && !derivedUi.spec && (
            <div className="flex items-center gap-2 py-1 text-body-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-brand-primary" />
              <span>Zyra sedang menyiapkan penjelasan...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between gap-2 border-l-2 border-status-error pl-3 py-1">
              <p className="text-body-xs text-status-error">
                Gagal memuat penjelasan Zyra. Coba kirim ulang.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void regenerate()}
                className="h-7 gap-1 text-body-xs"
              >
                <RotateCcw className="size-3" />
                <span>Coba lagi</span>
              </Button>
            </div>
          )}

          <form
            onSubmit={handleSubmitFollowUp}
            className="flex items-center gap-2 pt-2 border-t border-border/50"
          >
            <Input
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder="Tanya lanjutan atau minta ubah tampilan..."
              disabled={isBusy}
              className="h-8 text-body-sm bg-background"
              aria-label="Pertanyaan lanjutan untuk Zyra"
            />
            {isBusy ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => stop()}
                aria-label="Hentikan respons Zyra"
                className="size-8 shrink-0"
              >
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!followUp.trim()}
                aria-label="Kirim pertanyaan lanjutan"
                className="size-8 shrink-0"
              >
                <Send className="size-3.5" />
              </Button>
            )}
          </form>
        </div>
      )}
    </section>
  );
}

export function ZyraInlineExplanationHost({
  courseId,
  assessmentKind,
  assessmentId,
  questionId,
  questionPrompt,
  studentAnswer,
  correctAnswer,
  explanationSpec,
  explanationMarkdown,
  renderUiSpec,
  children,
}: ZyraInlineExplanationHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [threads, setThreads] = useState<InlineThreadRecord[]>([]);

  const handleSelectionCapture = useCallback(() => {
    const hostEl = hostRef.current;
    if (!hostEl || typeof window === "undefined") return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (
      !hostEl.contains(range.commonAncestorContainer) ||
      isInsideInlineThread(range.startContainer) ||
      isInsideInlineThread(range.endContainer)
    ) {
      return;
    }

    const anchorBlockId = findAnchorBlockId(range, hostEl);
    if (!anchorBlockId) return;

    const serialized = extractZyraSelection(selection);
    if (!serialized || serialized.cleanText.length < 2) return;

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    setPendingSelection({
      anchorBlockId,
      snippet: serialized.cleanText,
      surroundingText: serialized.surroundingText,
      coords: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    });
  }, []);

  const dismissPopover = useCallback(() => {
    setPendingSelection(null);
    setCustomInput("");
  }, []);

  const launchInlineThread = useCallback(
    (intent: InlineExplanationIntent, customQuestion?: string) => {
      if (!pendingSelection) return;
      const prompt =
        customQuestion?.trim() || buildQuickPrompt(intent, pendingSelection.snippet);

      const newThread: InlineThreadRecord = {
        id: `zyra-inline-${questionId}-${pendingSelection.anchorBlockId}-${Date.now()}`,
        anchorBlockId: pendingSelection.anchorBlockId,
        snippet: pendingSelection.snippet,
        surroundingText: pendingSelection.surroundingText,
        intent,
        initialPrompt: prompt,
        collapsed: false,
      };

      setThreads((prev) => [...prev, newThread]);
      dismissPopover();

      if (typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges();
      }
    },
    [dismissPopover, pendingSelection, questionId]
  );

  const handleToggleCollapse = useCallback((threadId: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, collapsed: !t.collapsed } : t))
    );
  }, []);

  const handleCloseThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
  }, []);

  const baseContext = useMemo(
    () => ({
      courseId,
      assessmentKind,
      assessmentId,
      questionId,
      questionPrompt,
      studentAnswer,
      correctAnswer,
      explanationSpec: explanationSpec ?? null,
      explanationMarkdown: explanationMarkdown ?? null,
    }),
    [
      assessmentId,
      assessmentKind,
      correctAnswer,
      courseId,
      explanationMarkdown,
      explanationSpec,
      questionId,
      questionPrompt,
      studentAnswer,
    ]
  );

  const threadsByBlockId = useMemo(() => {
    const map = new Map<string, InlineThreadRecord[]>();
    for (const thread of threads) {
      const existing = map.get(thread.anchorBlockId);
      if (existing) {
        existing.push(thread);
      } else {
        map.set(thread.anchorBlockId, [thread]);
      }
    }
    return map;
  }, [threads]);

  const renderBlockAfter = useCallback(
    (blockId: string): React.ReactNode => {
      const anchored = threadsByBlockId.get(blockId);
      if (!anchored || anchored.length === 0) return null;
      return (
        <div data-zyra-inline-slot={blockId} className="space-y-2">
          {anchored.map((thread) => (
            <ZyraInlineThreadCard
              key={thread.id}
              thread={thread}
              baseContext={baseContext}
              renderUiSpec={renderUiSpec}
              onToggleCollapse={handleToggleCollapse}
              onClose={handleCloseThread}
            />
          ))}
        </div>
      );
    },
    [baseContext, handleCloseThread, handleToggleCollapse, renderUiSpec, threadsByBlockId]
  );

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customInput.trim();
    if (!trimmed) return;
    launchInlineThread("custom", trimmed);
  };

  return (
    <div
      ref={hostRef}
      onMouseUp={handleSelectionCapture}
      onKeyUp={handleSelectionCapture}
      onTouchEnd={handleSelectionCapture}
      className="relative"
    >
      {children(renderBlockAfter)}

      {pendingSelection && (
        <Popover
          open={Boolean(pendingSelection)}
          modal={false}
          onOpenChange={(open) => {
            if (!open) dismissPopover();
          }}
        >
          <PopoverContent
            anchor={{
              getBoundingClientRect: () => ({
                x: pendingSelection.coords.left,
                y: pendingSelection.coords.top,
                width: Math.max(pendingSelection.coords.width, 1),
                height: Math.max(pendingSelection.coords.height, 1),
              }),
            }}
            side="top"
            align="center"
            sideOffset={8}
            collisionPadding={8}
            initialFocus="none"
            finalFocus="none"
            className="z-[100] w-[320px] sm:w-[360px] rounded-xl border border-border bg-card p-2.5 shadow-lg text-foreground"
          >
            <div className="space-y-2">
              <div
                className="flex items-center justify-between gap-2"
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="flex items-center gap-1.5 text-body-xs font-semibold text-foreground">
                  <MessageSquareText className="size-3.5 text-primary" />
                  <span>Tanya Zyra</span>
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={dismissPopover}
                  aria-label="Tutup menu Tanya Zyra"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              <div
                className="flex flex-wrap items-center gap-1"
                onMouseDown={(e) => e.preventDefault()}
              >
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => launchInlineThread("explain")}
                  className="h-7 gap-1 px-2 text-body-xs"
                >
                  <MessageSquareText className="size-3 text-primary" />
                  <span>Jelaskan bagian ini</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => launchInlineThread("step_by_step")}
                  className="h-7 gap-1 px-2 text-body-xs"
                >
                  <ListOrdered className="size-3 text-primary" />
                  <span>Langkah demi langkah</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => launchInlineThread("visualize")}
                  className="h-7 gap-1 px-2 text-body-xs"
                >
                  <LineChart className="size-3 text-primary" />
                  <span>Buat visualisasi</span>
                </Button>
              </div>

              <form onSubmit={handleCustomSubmit} className="flex items-center gap-1.5">
                <Input
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Tulis pertanyaan tentang bagian ini..."
                  className="h-8 text-body-sm bg-background"
                  aria-label="Pertanyaan khusus untuk Zyra"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!customInput.trim()}
                  aria-label="Kirim ke Zyra"
                  className="size-8 shrink-0"
                >
                  <Send className="size-3.5" />
                </Button>
              </form>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
