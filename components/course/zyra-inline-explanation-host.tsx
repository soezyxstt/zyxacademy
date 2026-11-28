"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ChevronDown,
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
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
} from "@ui-sdk/react/popover";
import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@ui-sdk/react/drawer";
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

export interface ZyraInlineAskRequest {
  anchorBlockId: string;
  snippet: string;
  surroundingText?: string;
}

export interface ZyraInlineAskContextValue {
  openAskSheet: (request: ZyraInlineAskRequest) => void;
}

const ZyraInlineAskContext = createContext<ZyraInlineAskContextValue | null>(null);

export function useZyraInlineAsk(): ZyraInlineAskContextValue | null {
  return useContext(ZyraInlineAskContext);
}

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

function isTouchOrNarrowViewport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(max-width: 767.98px)").matches
  );
}

function findAnchorBlockId(range: Range, hostEl: HTMLElement): string | null {
  const candidates: Array<Node | null> = [
    range.endContainer,
    range.commonAncestorContainer,
    range.startContainer,
  ];

  for (const node of candidates) {
    if (!node) continue;
    const el = node instanceof Element ? node : node.parentElement;
    if (!el || !hostEl.contains(el)) continue;
    const blockEl = el.closest("[data-assessment-block-id]");
    if (blockEl && hostEl.contains(blockEl)) {
      const id = blockEl.getAttribute("data-assessment-block-id")?.trim();
      if (id) return id;
    }
  }
  return null;
}

function findFirstBlockId(hostEl: HTMLElement | null): string | null {
  if (!hostEl) return null;
  const first = hostEl.querySelector("[data-assessment-block-id]");
  const id = first?.getAttribute("data-assessment-block-id")?.trim();
  return id || null;
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
    return `Buat visualisasi interaktif berupa grafik 2D atau adegan 3D (termasuk benda putar 3D dengan potongan cakram/cincin/kulit tabung jika berkaitan dengan volume benda putar) untuk bagian ini: "${shortSnippet}"`;
  }
  return `Jelaskan bagian ini secara ringkas dan jelas: "${shortSnippet}"`;
}

function extractMessageText(message: UIMessage): string {
  if (!Array.isArray(message.parts)) return "";
  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
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
      <div className="space-y-1 border-l-2 border-brand-primary/50 pl-3 py-0.5">
        {block.title && (
          <p className="font-heading text-body-xs font-semibold text-foreground">
            {block.title}
          </p>
        )}
        <div className="overflow-x-auto text-body-sm text-foreground [&_.katex-display]:my-0 [&_.katex-display]:py-0 [&_.katex-display]:text-left [&_.katex-display>.katex]:text-left [&_.math-text>span]:my-0 [&_.math-text>span]:py-0">
          <MathText as="div" bareMath>
            {block.latex}
          </MathText>
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
        ? "border-status-warning/60"
        : block.tone === "tip"
          ? "border-status-success/60"
          : "border-border";
    return (
      <div className={cn("border-l-2 pl-3 py-0.5 space-y-1", toneClass)}>
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
      <Collapsible defaultOpen={block.defaultOpen ?? false} className="border-y border-border/60">
        <CollapsibleTrigger className="group flex w-full items-center justify-between py-2 text-left text-body-xs font-semibold text-foreground transition-colors hover:text-brand-primary">
          <span>{block.title}</span>
          <ChevronDown
            className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-open:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div className="pb-2.5 pt-1 pl-2 space-y-1.5">
            {block.blocks.map((child) => (
              <FallbackBlock key={child.id} block={child} />
            ))}
          </div>
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
    <div className="border-l-2 border-border pl-3 py-1 text-body-xs text-muted-foreground">
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

interface ZyraAskFormProps {
  customInput: string;
  onCustomInputChange: (val: string) => void;
  onLaunchIntent: (intent: InlineExplanationIntent) => void;
  onCustomSubmit: (e: React.FormEvent) => void;
  preventFocusLoss?: boolean;
}

function ZyraAskActions({
  customInput,
  onCustomInputChange,
  onLaunchIntent,
  onCustomSubmit,
  preventFocusLoss = false,
}: ZyraAskFormProps) {
  const preventMouseDown = preventFocusLoss
    ? (e: React.MouseEvent) => e.preventDefault()
    : undefined;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5" onMouseDown={preventMouseDown}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onMouseDown={preventMouseDown}
          onClick={() => onLaunchIntent("explain")}
          className="h-8 gap-1.5 px-2.5 text-body-xs"
        >
          <MessageSquareText className="size-3.5 text-brand-primary" aria-hidden />
          <span>Jelaskan bagian ini</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onMouseDown={preventMouseDown}
          onClick={() => onLaunchIntent("step_by_step")}
          className="h-8 gap-1.5 px-2.5 text-body-xs"
        >
          <ListOrdered className="size-3.5 text-brand-primary" aria-hidden />
          <span>Langkah demi langkah</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onMouseDown={preventMouseDown}
          onClick={() => onLaunchIntent("visualize")}
          className="h-8 gap-1.5 px-2.5 text-body-xs"
        >
          <LineChart className="size-3.5 text-brand-primary" aria-hidden />
          <span>Buat visualisasi</span>
        </Button>
      </div>

      <form onSubmit={onCustomSubmit} className="flex items-center gap-1.5">
        <Input
          value={customInput}
          onChange={(e) => onCustomInputChange(e.target.value)}
          placeholder="Tulis pertanyaan tentang bagian ini..."
          className="h-9 text-body-sm bg-background"
          aria-label="Pertanyaan khusus untuk Zyra"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!customInput.trim()}
          aria-label="Kirim ke Zyra"
          className="size-9 shrink-0"
        >
          <Send className="size-3.5" aria-hidden />
        </Button>
      </form>
    </div>
  );
}

interface ZyraInlineThreadCardProps {
  thread: InlineThreadRecord;
  baseContext: Omit<
    InlineExplanationContext,
    "selectedSnippet" | "anchorBlockId" | "surroundingText" | "intent"
  >;
  renderUiSpec?: (spec: AssessmentUiSpec) => React.ReactNode;
  onSetCollapsed: (threadId: string, collapsed: boolean) => void;
  onClose: (threadId: string) => void;
}

function ZyraInlineThreadCard({
  thread,
  baseContext,
  renderUiSpec,
  onSetCollapsed,
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
    [baseContext, thread.anchorBlockId, thread.intent, thread.snippet, thread.surroundingText],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/zyra/explanation-inline",
        body: {
          context: requestContext,
        },
      }),
    [requestContext],
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

  const derivedUi = useMemo(() => deriveInlineUiFromMessages(messages), [messages]);
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
      className="my-3 border-l-2 border-brand-primary/60 pl-4"
    >
      <Collapsible
        open={!thread.collapsed}
        onOpenChange={(open) => onSetCollapsed(thread.id, !open)}
      >
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
            <MessageSquareText className="size-3.5 shrink-0 text-brand-primary" aria-hidden />
            <span className="font-heading text-body-xs font-bold text-foreground shrink-0">
              Zyra
            </span>
            <span className="truncate text-body-xs text-muted-foreground">
              {thread.snippet}
            </span>
            <ChevronDown
              className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-open:rotate-180 motion-reduce:transition-none"
              aria-hidden
            />
          </CollapsibleTrigger>

          <div className="flex items-center gap-1 shrink-0">
            {isBusy && (
              <span className="inline-flex items-center gap-1 text-body-2xs text-muted-foreground pr-1">
                <Loader2 className="size-3 animate-spin text-brand-primary" aria-hidden />
                <span>{derivedUi.isStreamingTool ? "Memperbarui tampilan" : "Menjelaskan"}</span>
              </span>
            )}
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
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>

        <CollapsiblePanel>
          <div className="space-y-3 pt-3">
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
                  <ChevronDown
                    className="size-3.5 shrink-0 transition-transform duration-200 group-data-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden
                  />
                  <span>Riwayat diskusi ({historyMessages.length})</span>
                </CollapsibleTrigger>
                <CollapsiblePanel>
                  <div className="mt-2 space-y-2 border-l border-border/60 pl-3">
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
                  </div>
                </CollapsiblePanel>
              </Collapsible>
            )}

            {isBusy && visibleMessages.length === 0 && !derivedUi.spec && (
              <div className="flex items-center gap-2 py-1 text-body-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-brand-primary" aria-hidden />
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
                  <RotateCcw className="size-3" aria-hidden />
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
                  <Square className="size-3.5" aria-hidden />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!followUp.trim()}
                  aria-label="Kirim pertanyaan lanjutan"
                  className="size-8 shrink-0"
                >
                  <Send className="size-3.5" aria-hidden />
                </Button>
              )}
            </form>
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </section>
  );
}

export function ZyraInlineAskButton({
  anchorBlockId,
  snippet,
  surroundingText,
  label = "Tanya Zyra",
  className,
}: {
  anchorBlockId?: string;
  snippet: string;
  surroundingText?: string;
  label?: string;
  className?: string;
}) {
  const ctx = useZyraInlineAsk();
  if (!ctx) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() =>
        ctx.openAskSheet({
          anchorBlockId: anchorBlockId ?? "",
          snippet,
          surroundingText,
        })
      }
      className={cn(
        "h-7 gap-1.5 px-2 text-body-xs font-medium text-muted-foreground hover:text-brand-primary",
        className,
      )}
    >
      <MessageSquareText className="size-3.5 text-brand-primary" aria-hidden />
      <span>{label}</span>
    </Button>
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
  const prefersReducedMotion = useReducedMotion();
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [touchSelection, setTouchSelection] = useState<ZyraInlineAskRequest | null>(null);
  const [drawerRequest, setDrawerRequest] = useState<ZyraInlineAskRequest | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [threads, setThreads] = useState<InlineThreadRecord[]>([]);

  const resolveAnchorBlockId = useCallback((requestedId: string): string => {
    if (requestedId.trim()) return requestedId.trim();
    return findFirstBlockId(hostRef.current) ?? "explanation-root";
  }, []);

  const captureCurrentSelection = useCallback((mode: "desktop" | "touch") => {
    const hostEl = hostRef.current;
    if (!hostEl || typeof window === "undefined") return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      if (mode === "touch") setTouchSelection(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (
      !hostEl.contains(range.commonAncestorContainer) ||
      isInsideInlineThread(range.startContainer) ||
      isInsideInlineThread(range.endContainer)
    ) {
      if (mode === "touch") setTouchSelection(null);
      return;
    }

    const anchorBlockId = findAnchorBlockId(range, hostEl);
    if (!anchorBlockId) return;

    const serialized = extractZyraSelection(selection);
    if (!serialized || serialized.cleanText.length < 2) return;

    if (mode === "touch") {
      setPendingSelection(null);
      setTouchSelection({
        anchorBlockId,
        snippet: serialized.cleanText,
        surroundingText: serialized.surroundingText,
      });
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    setTouchSelection(null);
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

  const handleDesktopSelection = useCallback(() => {
    if (isTouchOrNarrowViewport()) return;
    captureCurrentSelection("desktop");
  }, [captureCurrentSelection]);

  // On touch devices, track selectionchange so we can offer a bottom bar far from the native OS callout.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onSelectionChange = () => {
      if (!isTouchOrNarrowViewport()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        captureCurrentSelection("touch");
      }, 120);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [captureCurrentSelection]);

  const dismissPopover = useCallback(() => {
    setPendingSelection(null);
    setCustomInput("");
  }, []);

  const dismissDrawer = useCallback(() => {
    setDrawerRequest(null);
    setCustomInput("");
  }, []);

  const openAskSheet = useCallback(
    (request: ZyraInlineAskRequest) => {
      const anchorBlockId = resolveAnchorBlockId(request.anchorBlockId);
      setPendingSelection(null);
      setTouchSelection(null);
      setCustomInput("");
      if (typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges();
      }
      setDrawerRequest({
        anchorBlockId,
        snippet: request.snippet.trim() || "Pembahasan soal ini",
        surroundingText: request.surroundingText,
      });
    },
    [resolveAnchorBlockId],
  );

  const launchInlineThread = useCallback(
    (
      target: ZyraInlineAskRequest,
      intent: InlineExplanationIntent,
      customQuestion?: string,
    ) => {
      const anchorBlockId = resolveAnchorBlockId(target.anchorBlockId);
      const prompt = customQuestion?.trim() || buildQuickPrompt(intent, target.snippet);

      const newThread: InlineThreadRecord = {
        id: `zyra-inline-${questionId}-${anchorBlockId}-${Date.now()}`,
        anchorBlockId,
        snippet: target.snippet,
        surroundingText: target.surroundingText,
        intent,
        initialPrompt: prompt,
        collapsed: false,
      };

      setThreads((prev) => [...prev, newThread]);
      dismissPopover();
      dismissDrawer();
      setTouchSelection(null);

      if (typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges();
      }
    },
    [dismissDrawer, dismissPopover, questionId, resolveAnchorBlockId],
  );

  const handleSetCollapsed = useCallback((threadId: string, collapsed: boolean) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, collapsed } : t)),
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
    ],
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
          <AnimatePresence initial={false}>
            {anchored.map((thread) => (
              <motion.div
                key={thread.id}
                initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <ZyraInlineThreadCard
                  thread={thread}
                  baseContext={baseContext}
                  renderUiSpec={renderUiSpec}
                  onSetCollapsed={handleSetCollapsed}
                  onClose={handleCloseThread}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      );
    },
    [
      baseContext,
      handleCloseThread,
      handleSetCollapsed,
      prefersReducedMotion,
      renderUiSpec,
      threadsByBlockId,
    ],
  );

  const askContextValue = useMemo<ZyraInlineAskContextValue>(
    () => ({ openAskSheet }),
    [openAskSheet],
  );

  return (
    <ZyraInlineAskContext.Provider value={askContextValue}>
      <div
        ref={hostRef}
        onMouseUp={handleDesktopSelection}
        onKeyUp={handleDesktopSelection}
        className="relative"
      >
        {children(renderBlockAfter)}
        {renderBlockAfter("explanation-root")}

        {/* Desktop text-selection popover */}
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
              className="z-[100] w-[320px] sm:w-[360px] rounded-xl border border-border bg-card p-3 shadow-lg text-foreground"
            >
              <div className="space-y-2.5">
                <div
                  className="flex items-center justify-between gap-2"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <PopoverTitle className="flex items-center gap-1.5 text-body-xs font-semibold text-foreground">
                    <MessageSquareText className="size-3.5 text-primary" aria-hidden />
                    <span>Tanya Zyra</span>
                  </PopoverTitle>
                  <PopoverClose
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="Tutup menu Tanya Zyra"
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden />
                  </PopoverClose>
                </div>

                <ZyraAskActions
                  customInput={customInput}
                  onCustomInputChange={setCustomInput}
                  preventFocusLoss
                  onLaunchIntent={(intent) => launchInlineThread(pendingSelection, intent)}
                  onCustomSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = customInput.trim();
                    if (!trimmed) return;
                    launchInlineThread(pendingSelection, "custom", trimmed);
                  }}
                />
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Mobile/touch selection bottom bar, kept away from the native OS text selection menu */}
        <AnimatePresence>
          {touchSelection && !drawerRequest && (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-2 rounded-full border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm"
            >
              <button
                type="button"
                onClick={() => openAskSheet(touchSelection)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-body-xs font-semibold text-foreground"
              >
                <MessageSquareText className="size-4 shrink-0 text-brand-primary" aria-hidden />
                <span className="shrink-0 text-brand-primary">Tanya Zyra</span>
                <span className="truncate font-normal text-muted-foreground">
                  {touchSelection.snippet}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setTouchSelection(null);
                  if (typeof window !== "undefined") {
                    window.getSelection()?.removeAllRanges();
                  }
                }}
                aria-label="Tutup bilah Tanya Zyra"
                className="size-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Drawer sheet for one-tap mobile/desktop "Tanya Zyra" */}
        <Drawer
          open={Boolean(drawerRequest)}
          side="bottom"
          onOpenChange={(open) => {
            if (!open) dismissDrawer();
          }}
        >
          <DrawerBackdrop className="bg-black/40 backdrop-blur-[1px]" />
          <DrawerContent className="mx-auto w-full max-w-lg rounded-t-2xl border-t border-x border-border bg-card px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-foreground shadow-xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <DrawerTitle className="flex items-center gap-1.5 font-heading text-body-sm font-bold text-foreground">
                    <MessageSquareText className="size-4 text-brand-primary" aria-hidden />
                    <span>Tanya Zyra</span>
                  </DrawerTitle>
                  {drawerRequest && (
                    <DrawerDescription className="line-clamp-2 text-body-xs text-muted-foreground">
                      {drawerRequest.snippet}
                    </DrawerDescription>
                  )}
                </div>
                <DrawerClose
                  aria-label="Tutup panel Tanya Zyra"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" aria-hidden />
                </DrawerClose>
              </div>

              {drawerRequest && (
                <ZyraAskActions
                  customInput={customInput}
                  onCustomInputChange={setCustomInput}
                  onLaunchIntent={(intent) => launchInlineThread(drawerRequest, intent)}
                  onCustomSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = customInput.trim();
                    if (!trimmed) return;
                    launchInlineThread(drawerRequest, "custom", trimmed);
                  }}
                />
              )}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </ZyraInlineAskContext.Provider>
  );
}
