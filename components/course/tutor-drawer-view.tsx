"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Layers,
  ClipboardList,
  Compass,
  AlertTriangle,
  Loader2,
  Check,
  X,
  ArrowRight,
  RefreshCw,
  FileQuestion,
  Maximize2,
  Minimize2,
  Copy,
  Trash2,
  Send,
  HelpCircle,
  Paperclip,
  Plus,
  Square,
  ArrowUp,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  explainConceptAction,
  analyzeMistakeAction,
  buildStudyPlanAction,
  generatePracticeQuizAction,
  askTutorRagAction,
  saveTutorMessagesAction,
  loadTutorHistoryAction,
  clearTutorHistoryAction,
  getTutorCourseContextAction,
} from "@/app/actions/tutor";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { clampTutorPanelWidth, DEFAULT_TUTOR_PANEL_WIDTH, MAX_TUTOR_PANEL_WIDTH, MIN_TUTOR_PANEL_WIDTH } from "@/lib/tutor-panel-layout";
import { normalizeTutorMathMarkdown } from "@/lib/tutor/math-markdown";
import { getTutorCapabilities } from "@/lib/tutor-capabilities";
import {
  ZyraAttachmentComposer,
  type ZyraAttachmentComposerHandle,
} from "@/components/course/zyra-attachment-composer";
import { ZyraAllowanceSummary } from "@/components/course/zyra-allowance-summary";
import { ZyraMathPalette } from "@/components/course/zyra-math-palette";
import { ZyraFormulaPreview } from "@/components/course/zyra-formula-preview";
import { ZyraMark } from "@/components/course/zyra-mark";
import { useSwipe } from "@/hooks/use-swipe";
import { LearningCanvasRenderer } from "@/components/course/learning-canvas/learning-canvas-renderer";
import type { CanvasSpec } from "@/lib/zyra/canvas";
import { zyraImageFilesFromClipboard } from "@/lib/zyra/images/composer";
import type { ZyraMessageAttachment } from "@/lib/zyra/images/contracts";
import { ZyraMessageAttachments } from "@/components/course/zyra-message-attachments";
import { getFlashcardsForKOAction } from "@/app/actions/tutor-extra";

export type TutorMode = "explain" | "mistake" | "study-plan" | "chat" | null;
type ActiveAction = "none" | "flashcards" | "practice-quiz";

interface ChatMessage {
  id: string;
  role: "student" | "ai";
  content: string;
  sources?: Array<{ type: string; id: string; label: string; href: string }>;
  canvasSpec?: CanvasSpec | null;
  attachments?: ZyraMessageAttachment[];
}

const MIN_SIDEBAR_WIDTH = MIN_TUTOR_PANEL_WIDTH;
const DEFAULT_SIDEBAR_WIDTH = DEFAULT_TUTOR_PANEL_WIDTH;
const MAX_SIDEBAR_WIDTH = MAX_TUTOR_PANEL_WIDTH;
const STORAGE_KEY_WIDTH = "zyra_tutor_sidebar_width";

function safeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function isComprehensionCheck(content: string): boolean {
  if (/cek pemahaman|uji pemahaman/i.test(content)) return true;
  const tail = content.trimEnd().slice(-400);
  return /\?/.test(tail.replace(/[$`\\]/g, ""));
}

const GENERIC_CHIPS = [
  { icon: "example", label: "Contoh Soal", prompt: "Berikan contoh soal serupa dan tuntun aku langkah demi langkah." },
  { icon: "help", label: "Uji Pemahaman", prompt: "Uji pemahamanku dengan 1 pertanyaan konsep singkat tanpa memberi kunci jawaban langsung." },
  { icon: "compass", label: "Analogi", prompt: "Jelaskan dengan analogi sehari-hari yang mudah dibayangkan." },
] as const;

const CHECK_CHIPS = [
  { icon: "help", label: "Beri hint langkah pertama", prompt: "Beri hint untuk langkah pertama saja tanpa mengungkap jawaban akhirnya." },
  { icon: "refresh", label: "Bimbing aku lebih pelan", prompt: "Aku masih bingung. Bimbing aku ulangi penjelasannya lebih pelan, satu langkah pada satu waktu." },
  { icon: "arrow", label: "Tampilkan pembahasan", prompt: "Aku belum bisa menjawab. Tampilkan pembahasan lengkapnya lalu uji aku dengan soal serupa." },
] as const;

function FollowUpChipIcon({ name }: { name: "example" | "help" | "compass" | "refresh" | "arrow" }) {
  if (name === "example") return <FileQuestion className="size-3 text-brand-primary" />;
  if (name === "compass") return <Compass className="size-3 text-brand-primary" />;
  if (name === "refresh") return <RefreshCw className="size-3 text-brand-secondary" />;
  if (name === "arrow") return <ArrowRight className="size-3 text-brand-secondary" />;
  return <HelpCircle className="size-3 text-brand-secondary" />;
}

function FollowUpChips({
  comprehensionCheck,
  onSend,
}: {
  comprehensionCheck: boolean;
  onSend: (prompt: string) => void;
}) {
  const chips = comprehensionCheck ? CHECK_CHIPS : GENERIC_CHIPS;
  return (
    <div className="mt-2 pt-1.5 flex items-center gap-0.5 overflow-x-auto no-scrollbar" aria-label="Aksi belajar lanjutan">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={() => onSend(chip.prompt)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-body-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
        >
          <FollowUpChipIcon name={chip.icon} />
          <span>{chip.label}</span>
        </button>
      ))}
    </div>
  );
}

export interface TutorDrawerViewProps {
  isOpen: boolean;
  onClose: () => void;
  activeMode: TutorMode;
  setActiveMode: (mode: TutorMode) => void;
  koId: string | null;
  questionId: string | null;
  userAnswer: string | null;
  explainMode: "content" | "analogy" | "simplification";
  initialQuestion?: string | null;
  onClearInitialQuestion?: () => void;
}

export function TutorDrawerView({
  isOpen,
  onClose,
  activeMode,
  setActiveMode,
  koId,
  questionId,
  userAnswer,
  explainMode,
  initialQuestion,
  onClearInitialQuestion,
}: TutorDrawerViewProps) {
  const pathname = usePathname();
  const courseIdFromPath = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
  const caps = getTutorCapabilities(courseIdFromPath);
  const imageInputEnabled = caps.imageInput && activeMode === "chat";

  // Loading and response states
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [data, setData] = React.useState<any>(null);

  // Chat state
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [inputVal, setInputVal] = React.useState("");
  const [chatLoading, setChatLoading] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [attachmentIds, setAttachmentIds] = React.useState<string[]>([]);
  const [readyAttachments, setReadyAttachments] = React.useState<ZyraMessageAttachment[]>([]);
  const [_attachmentComposerKey, setAttachmentComposerKey] = React.useState(0);
  const [_attachmentsReady, setAttachmentsReady] = React.useState(true);
  const [copiedMessageId, setCopiedMessageId] = React.useState<string | null>(null);

  const attachmentComposerRef = React.useRef<ZyraAttachmentComposerHandle>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const savedDataRef = React.useRef<any>(null);
  const focusReturnRef = React.useRef<HTMLElement | null>(null);

  const panelRef = React.useRef<HTMLElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Resizable sidebar states
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(DEFAULT_SIDEBAR_WIDTH);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const isDraggingRef = React.useRef(false);
  const dragStartRef = React.useRef<{ startX: number; startWidth: number; latestWidth: number }>({
    startX: 0,
    startWidth: DEFAULT_TUTOR_PANEL_WIDTH,
    latestWidth: DEFAULT_TUTOR_PANEL_WIDTH,
  });

  // Course label for the drawer header
  const [courseLabel, setCourseLabel] = React.useState<string | null>(null);

  // Micro-apps inside drawer
  const [activeAction, setActiveAction] = React.useState<ActiveAction>("none");
  const [actionData, setActionData] = React.useState<any[]>([]);
  const [actionIndex, setActionIndex] = React.useState(0);
  const [actionFlipped, setActionFlipped] = React.useState(false);
  const [actionSelectedAnswer, setActionSelectedAnswer] = React.useState<number | null>(null);
  const [actionQuizSubmitted, setActionQuizSubmitted] = React.useState(false);

  // Initialize stored width safely on client
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_WIDTH);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= MIN_SIDEBAR_WIDTH) {
          setSidebarWidth(clampTutorPanelWidth(parsed, window.innerWidth));
        }
      }
    } catch {}
  }, []);

  // Resolve academic course label
  React.useEffect(() => {
    let cancelled = false;
    if (!courseIdFromPath) {
      setCourseLabel(null);
      return;
    }
    getTutorCourseContextAction(courseIdFromPath)
      .then((title) => {
        if (!cancelled) setCourseLabel(title);
      })
      .catch(() => {
        if (!cancelled) setCourseLabel(null);
      });
    return () => { cancelled = true; };
  }, [courseIdFromPath]);

  // Mobile body scroll lock
  React.useEffect(() => {
    if (!isOpen || !window.matchMedia("(max-width: 767px)").matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  const scrollToBottom = React.useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  React.useEffect(() => {
    if (activeMode === "chat") {
      scrollToBottom();
    }
  }, [messages, activeMode, scrollToBottom]);

  // Load chat history when in chat mode
  React.useEffect(() => {
    if (activeMode !== "chat") return;
    const courseId = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;

    if (courseId) {
      setLoading(true);
      loadTutorHistoryAction(courseId)
        .then((result) => {
          setSessionId(result.sessionId);
          if (result.messages.length > 0) {
            setMessages(result.messages);
          } else {
            setMessages([{
              id: "chat-welcome",
              role: "ai",
              content: "Halo! Aku Zyra, asisten belajar buatan Zyx. Tanyakan apa saja seputar materi kuliah atau soal latihan, aku siap membimbingmu dengan pendekatan Socratic!",
            }]);
          }
        })
        .catch(() => {
          setMessages([{
            id: "chat-welcome",
            role: "ai",
            content: "Halo! Aku Zyra, asisten belajar buatan Zyx. Tanyakan apa saja seputar materi kuliah atau soal latihan, aku siap membimbingmu dengan pendekatan Socratic!",
          }]);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setMessages([{
        id: "chat-welcome",
        role: "ai",
        content: "Halo! Aku Zyra, asisten belajar buatan Zyx. Tanyakan apa saja seputar materi kuliah atau soal latihan, aku siap membimbingmu dengan pendekatan Socratic!",
      }]);
    }
  }, [activeMode, pathname]);

  // Handle initial question if passed
  React.useEffect(() => {
    if (initialQuestion) {
      setInputVal(initialQuestion);
      onClearInitialQuestion?.();
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [initialQuestion, onClearInitialQuestion]);

  // Escape key to close
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Sync execution from backend services on mode triggers
  React.useEffect(() => {
    if (!activeMode) return;
    if (activeMode === "chat") return;
    if (activeMode === "explain" && explainMode !== "content") return;

    async function loadData() {
      setLoading(true);
      setErrors([]);
      setData(null);
      try {
        if (activeMode === "explain" && koId) {
          const res = await explainConceptAction(koId, explainMode);
          if (res.success) {
            setData(res.data);
          } else {
            setErrors(res.errors);
          }
        } else if (activeMode === "mistake" && questionId && userAnswer) {
          const res = await analyzeMistakeAction(questionId, userAnswer);
          if (res.success) {
            setData(res.data);
          } else {
            setErrors(res.errors);
          }
        } else if (activeMode === "study-plan") {
          const res = await buildStudyPlanAction();
          setData(res.plan);
        }
      } catch (err: any) {
        setErrors([err?.message || "Terjadi kesalahan internal. Silakan coba lagi."]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [activeMode, koId, questionId, userAnswer, explainMode]);

  // Synchronize data results to chat messages history
  React.useEffect(() => {
    if (!data) return;
    if (savedDataRef.current === data) return;

    const courseId = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
    let newMessages: ChatMessage[] = [];

    if (activeMode === "explain") {
      const conceptTitle = safeText(data.title, "");
      newMessages = [
        {
          id: `initial-q-${Date.now()}`,
          role: "student",
          content: conceptTitle
            ? `Jelaskan konsep: ${conceptTitle}`
            : "Jelaskan konsep ini.",
        },
        {
          id: `initial-a-${Date.now()}`,
          role: "ai",
          content: safeText(data.content, "Materi konsep ini belum tersedia. Coba buka ulang materi atau tanyakan lewat chat."),
          sources: data.sources || [],
        }
      ];
    } else if (activeMode === "mistake") {
      newMessages = [
        {
          id: `initial-q-${Date.now()}`,
          role: "student",
          content: `Analisis kesalahanku pada soal kuis.`,
        },
        {
          id: `initial-a-${Date.now()}`,
          role: "ai",
          content: `### Temuan Miskonsepsi Utama:\n${safeText(data.detectedMisconception, "Belum terdeteksi dari jawabanmu.")}\n\n### Kesalahan Perhitungan / Substitusi:\n${safeText(data.mathematicalError, "Tidak ditemukan kesalahan hitung yang spesifik.")}\n\n### Panduan Berpikir (Socratic):\n${safeText(data.socraticGuidance, "Coba telusuri ulang langkah penyelesaianmu satu per satu.")}`,
        }
      ];
    } else if (activeMode === "study-plan") {
      const planSteps = Array.isArray(data) ? data : [];
      newMessages = [
        {
          id: `initial-q-${Date.now()}`,
          role: "student",
          content: "Tampilkan rencana belajar mandiriku.",
        },
        {
          id: `initial-a-${Date.now()}`,
          role: "ai",
          content: planSteps.length > 0
            ? planSteps.map((s: any, idx: number) => `**Langkah ${idx + 1}: ${s.title || "Belajar"}**\n${s.description || ""}`).join("\n\n")
            : "Rencana belajarmu sedang disiapkan.",
        }
      ];
    }

    if (newMessages.length > 0) {
      setMessages(newMessages);
      savedDataRef.current = data;

      if (courseId) {
        saveTutorMessagesAction(courseId, newMessages.map(m => ({
          role: m.role,
          content: m.content,
        })), sessionId).catch(() => {});
      }
    }
  }, [data, activeMode, pathname, sessionId]);

  // Resize Pointer Handlers
  const handlePointerDownResize = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const pointerId = e.pointerId;
      const targetEl = e.currentTarget as HTMLElement;
      const asideEl = panelEl();

      function panelEl() {
        return panelRef.current;
      }

      isDraggingRef.current = true;
      setIsDragging(true);

      dragStartRef.current = {
        startX: e.clientX,
        startWidth: asideEl ? asideEl.offsetWidth : sidebarWidth,
        latestWidth: asideEl ? asideEl.offsetWidth : sidebarWidth,
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      if (asideEl) asideEl.style.transition = "none";
      targetEl.classList.add("bg-brand-primary/10");

      let currentWidth = dragStartRef.current.startWidth;
      let hasCapture = false;

      try {
        targetEl.setPointerCapture(pointerId);
        hasCapture = true;
      } catch {}

      const handleMove = (ev: MouseEvent | PointerEvent) => {
        if (!isDraggingRef.current) return;
        ev.preventDefault();
        const delta = dragStartRef.current.startX - ev.clientX;
        const newWidth = clampTutorPanelWidth(dragStartRef.current.startWidth + delta, window.innerWidth);
        dragStartRef.current.latestWidth = newWidth;
        currentWidth = newWidth;

        if (asideEl) {
          asideEl.style.width = `${newWidth}px`;
        }
      };

      const handleUp = () => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        setIsDragging(false);

        if (hasCapture) {
          try {
            targetEl.releasePointerCapture(pointerId);
          } catch {}
        }

        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (asideEl) asideEl.style.transition = "";
        targetEl.classList.remove("bg-brand-primary/10");

        targetEl.removeEventListener("pointermove", handleMove as EventListener);
        targetEl.removeEventListener("pointerup", handleUp as EventListener);
        targetEl.removeEventListener("pointercancel", handleUp as EventListener);

        window.removeEventListener("pointermove", handleMove as EventListener);
        window.removeEventListener("mousemove", handleMove as EventListener);
        window.removeEventListener("pointerup", handleUp as EventListener);
        window.removeEventListener("mouseup", handleUp as EventListener);

        setIsExpanded(false);
        setSidebarWidth(currentWidth);
        try {
          localStorage.setItem(STORAGE_KEY_WIDTH, String(currentWidth));
        } catch {}
      };

      targetEl.addEventListener("pointermove", handleMove as EventListener, { passive: false });
      targetEl.addEventListener("pointerup", handleUp as EventListener);
      targetEl.addEventListener("pointercancel", handleUp as EventListener);

      window.addEventListener("pointermove", handleMove as EventListener, { passive: false });
      window.addEventListener("mousemove", handleMove as EventListener, { passive: false });
      window.addEventListener("pointerup", handleUp as EventListener);
      window.addEventListener("mouseup", handleUp as EventListener);
    },
    [sidebarWidth]
  );

  const handleKeyDownResize = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const next = clampTutorPanelWidth(sidebarWidth + 40, window.innerWidth);
        setIsExpanded(false);
        setSidebarWidth(next);
        try { localStorage.setItem(STORAGE_KEY_WIDTH, String(next)); } catch {}
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = clampTutorPanelWidth(sidebarWidth - 40, window.innerWidth);
        setIsExpanded(false);
        setSidebarWidth(next);
        try { localStorage.setItem(STORAGE_KEY_WIDTH, String(next)); } catch {}
      } else if (e.key === "Home") {
        e.preventDefault();
        setIsExpanded(false);
        setSidebarWidth(MIN_SIDEBAR_WIDTH);
        try { localStorage.setItem(STORAGE_KEY_WIDTH, String(MIN_SIDEBAR_WIDTH)); } catch {}
      } else if (e.key === "End") {
        e.preventDefault();
        const maxW = Math.min(MAX_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.7));
        setIsExpanded(true);
        setSidebarWidth(maxW);
        try { localStorage.setItem(STORAGE_KEY_WIDTH, String(maxW)); } catch {}
      }
    },
    [sidebarWidth]
  );

  const toggleExpand = React.useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Flashcards launcher inside drawer
  const handleLaunchFlashcards = async (targetKoId: string) => {
    setLoading(true);
    try {
      const cards = await getFlashcardsForKOAction(targetKoId);
      if (cards.length > 0) {
        setActionData(cards);
        setActionIndex(0);
        setActionFlipped(false);
        setActiveAction("flashcards");
        toast.success(`Memuat ${cards.length} kartu hafalan.`);
      } else {
        toast.info("Tidak ada kartu hafalan terpasang untuk konsep ini.");
      }
    } catch {
      toast.error("Gagal memuat kartu hafalan.");
    } finally {
      setLoading(false);
    }
  };

  // Practice Quiz launcher inside drawer
  const handleLaunchPracticeQuiz = async (targetKoId: string) => {
    setLoading(true);
    try {
      void generatePracticeQuizAction(targetKoId, "medium");
      const { getQuestionsForKOAction } = await import("@/app/actions/tutor-extra");
      const questions = await getQuestionsForKOAction(targetKoId);
      if (questions.length > 0) {
        setActionData(questions.slice(0, 3));
        setActionIndex(0);
        setActionSelectedAnswer(null);
        setActionQuizSubmitted(false);
        setActiveAction("practice-quiz");
        toast.success("Latihan kuis cepat siap dimulai.");
      } else {
        toast.info("Gagal menemukan latihan kuis. Silakan coba beberapa saat lagi.");
      }
    } catch {
      toast.error("Gagal membuat sesi latihan kuis.");
    } finally {
      setLoading(false);
    }
  };

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setChatLoading(false);
      toast.info("Pemrosesan respons telah dihentikan.");
    }
  };

  // Handle sending arbitrary chat messages with SSE streaming
  const handleSend = async (suggestedQuestion?: string) => {
    const rawQuestion = (suggestedQuestion || inputVal).trim();
    if (!rawQuestion) return;
    const question = normalizeTutorMathMarkdown(rawQuestion);
    const requestedAttachmentIds = [...attachmentIds];
    const requestedAttachments = [...readyAttachments];

    const studentMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "student",
      content: question,
      attachments: requestedAttachments.length > 0 ? requestedAttachments : undefined,
    };

    setMessages((prev) => [...prev, studentMsg]);
    setInputVal("");
    setAttachmentIds([]);
    setReadyAttachments([]);
    setAttachmentsReady(true);
    setAttachmentComposerKey((value) => value + 1);
    setChatLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const courseId = pathname?.startsWith("/courses/")
      ? pathname.split("/")[2]
      : undefined;

    const aiMsgId = `msg-ai-${Date.now()}`;
    let accumulatedContent = "";
    let finalSources: any = undefined;
    let finalCanvasSpec: CanvasSpec | null = null;
    let activeSid = sessionId;

    setMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: "ai", content: "" },
    ]);

    try {
      const response = await fetch("/api/zyra/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          courseId: courseId ?? "unknown",
          conceptId: koId || undefined,
          sessionId: activeSid || undefined,
          attachmentIds: requestedAttachmentIds,
          pathname,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let errText = `Server returned ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.error) errText = errJson.error;
        } catch {}
        throw new Error(errText);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
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
            if (dataStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(dataStr);
              if ((parsed.type === "text-delta" && parsed.textDelta) || (parsed.type === "chunk" && parsed.text)) {
                accumulatedContent += (parsed.textDelta || parsed.text);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, content: accumulatedContent } : m
                  )
                );
              } else if (parsed.type === "data-sources" && parsed.sources) {
                finalSources = parsed.sources;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, sources: parsed.sources } : m
                  )
                );
              } else if (parsed.type === "data-canvas" && parsed.canvasSpec) {
                finalCanvasSpec = parsed.canvasSpec;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, canvasSpec: parsed.canvasSpec } : m
                  )
                );
              } else if (parsed.type === "data-session" && parsed.sessionId) {
                activeSid = parsed.sessionId;
                setSessionId(parsed.sessionId);
              } else if (parsed.type === "data-error" && parsed.data?.message) {
                accumulatedContent = `Maaf, terjadi kendala: ${parsed.data.message}`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, content: accumulatedContent } : m
                  )
                );
              }
            } catch {
              // Ignore parse errors on individual stream chunks
            }
          }
        }
      }
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        accumulatedContent = accumulatedContent || "Tanggapan dihentikan oleh pengguna.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: accumulatedContent } : m
          )
        );
      } else {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan koneksi.";
        accumulatedContent = `Maaf, terjadi kendala saat memproses jawaban: ${msg}`;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: accumulatedContent } : m
          )
        );
      }
    } finally {
      setChatLoading(false);
      abortControllerRef.current = null;
    }

    if (courseId && accumulatedContent) {
      saveTutorMessagesAction(courseId, [
        { role: studentMsg.role, content: studentMsg.content, attachmentIds: requestedAttachmentIds },
        { role: "ai", content: accumulatedContent, sources: finalSources, canvasSpec: finalCanvasSpec },
      ], activeSid).catch(() => {});
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    toast.success("Teks disalin ke clipboard.");
    setTimeout(() => {
      setCopiedMessageId(null);
    }, 2000);
  };

  const handleInsertSnippet = (snippet: string) => {
    const el = textareaRef.current;
    if (!el) {
      setInputVal((prev) => prev + snippet);
      return;
    }
    const start = el.selectionStart ?? inputVal.length;
    const end = el.selectionEnd ?? inputVal.length;
    const next = inputVal.slice(0, start) + snippet + inputVal.slice(end);
    setInputVal(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + snippet.length;
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <>
      {/* Backdrop for Mobile Only */}
      <div
        role="presentation"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-300 md:hidden"
      />

      {/* Non-blocking, Docked Learning Assistant Sidebar */}
      <aside
        ref={panelRef}
        aria-label="Zyra Learning Assistant"
        style={{
          top: 0,
          "--zyra-panel-width": `${isExpanded ? Math.min(MAX_SIDEBAR_WIDTH, typeof window === "undefined" ? MAX_SIDEBAR_WIDTH : window.innerWidth * 0.7) : sidebarWidth}px`,
        } as React.CSSProperties}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[min(var(--zyra-panel-width),100vw)] flex-col overflow-hidden border-l border-border bg-card shadow-2xl md:sticky md:top-0 md:bottom-auto md:right-auto md:self-start md:z-20 md:h-screen md:h-[100svh] md:w-[var(--zyra-panel-width)] md:shrink-0 md:shadow-none",
          "animate-in slide-in-from-right duration-300 ease-out md:animate-none",
          isDragging ? "transition-none select-none" : "transition-[width] duration-150 ease-out"
        )}
      >
        {/* Drag-to-Resize Handle */}
        <div
          onPointerDown={handlePointerDownResize}
          onDoubleClick={toggleExpand}
          onKeyDown={handleKeyDownResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Ubah lebar sidebar Zyra"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={typeof window === "undefined" ? MAX_SIDEBAR_WIDTH : Math.min(MAX_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.7))}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          title="Seret untuk mengubah ukuran, klik dua kali untuk toggle layar penuh, panah kiri/kanan untuk mengatur"
          className={cn(
            "absolute left-0 top-0 bottom-0 z-50 hidden w-2.5 cursor-col-resize touch-none select-none items-center justify-center outline-none transition-colors group hover:bg-brand-primary/20 focus-visible:bg-brand-primary/25 md:flex",
            isDragging && "bg-brand-primary/30"
          )}
        >
          <div
            className={cn(
              "h-10 w-1 rounded-full bg-border-strong transition-all group-hover:bg-brand-primary group-hover:h-16 group-focus-visible:bg-brand-primary",
              isDragging && "h-16 w-1.5 bg-brand-primary"
            )}
          />
        </div>

        {/* Top Header & Ergonomic Activity Rail */}
        <div className="flex flex-col border-b border-border/80 bg-muted/30 shrink-0">
          <div className="flex items-center justify-between px-3.5 py-2.5 gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <ZyraMark className="size-4.5" />
              </div>
              <div className="min-w-0 flex flex-col">
                <span className="truncate font-heading text-body-sm font-bold text-foreground">
                  Zyra
                </span>
                <span className="text-body-xs text-muted-foreground truncate">
                  {courseIdFromPath
                    ? (courseLabel ?? courseIdFromPath)
                    : "Pedagogi Socratic ITB"}
                </span>
              </div>
            </div>

            {/* Window Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setSessionId(null);
                  setMessages([{
                    id: "chat-welcome",
                    role: "ai",
                    content: "Halo! Aku Zyra, asisten belajarmu. Tanyakan konsep, rumus matematika, atau soal latihan!",
                  }]);
                  toast.success("Sesi obrolan baru dimulai.");
                }}
                aria-label="Obrolan baru"
                title="Mulai obrolan baru (+)"
                className="text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={toggleExpand}
                aria-label={isExpanded ? "Kecilkan sidebar" : "Perbesar layar penuh"}
                title={isExpanded ? "Kecilkan tampilan" : "Buka layar penuh"}
                className="text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </Button>

              {activeMode === "chat" && messages.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={async () => {
                    const courseId = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
                    if (courseId) {
                      await clearTutorHistoryAction(courseId);
                    }
                    setMessages([{
                      id: "chat-welcome",
                      role: "ai",
                      content: "Riwayat percakapan dibersihkan. Apa yang ingin kamu diskusikan berikutnya?",
                    }]);
                    toast.success("Riwayat obrolan dibersihkan.");
                  }}
                  aria-label="Bersihkan obrolan"
                  title="Bersihkan riwayat percakapan"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onClose}
                aria-label="Tutup panel asisten"
                title="Tutup asisten (Esc)"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* Activity Modes Switcher */}
          <div className="flex items-center gap-1 overflow-x-auto px-3 py-1.5 border-t border-border/40 no-scrollbar bg-background/50">
            <button
              type="button"
              onClick={() => setActiveMode("chat")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-xs font-medium transition-colors shrink-0",
                activeMode === "chat"
                  ? "bg-brand-primary text-white font-semibold"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              <span>Diskusi</span>
            </button>
            {caps.explain && (
              <button
                type="button"
                onClick={() => setActiveMode("explain")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-xs font-medium transition-colors shrink-0",
                  activeMode === "explain"
                    ? "bg-brand-primary text-white font-semibold"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )}
              >
                <span>Konsep</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveMode("mistake")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-xs font-medium transition-colors shrink-0",
                activeMode === "mistake"
                  ? "bg-brand-primary text-white font-semibold"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              <span>Bedah Jawaban</span>
            </button>
            {caps.studyPlan && (
              <button
                type="button"
                onClick={() => setActiveMode("study-plan")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-xs font-medium transition-colors shrink-0",
                  activeMode === "study-plan"
                    ? "bg-brand-primary text-white font-semibold"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )}
              >
                <span>Rencana Belajar</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Main Workspace / Conversation Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 font-sans text-body-sm bg-background/50">
          {errors.length > 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-destructive text-body-xs">
              {errors.map((err, i) => (
                <div key={i} className="flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-brand-primary" />
              <p className="text-body-xs font-medium">Zyra sedang menyiapkan materi...</p>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => {
                const isStudent = msg.role === "student";
                const isLastAiTurn = !isStudent && index === messages.length - 1;
                const showComprehensionCheck = isLastAiTurn && !chatLoading && isComprehensionCheck(msg.content);

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex flex-col gap-1.5",
                      isStudent ? "items-end" : "items-start"
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground px-1">
                      <span>{isStudent ? "Kamu" : "Zyra"}</span>
                    </div>

                    <div
                      className={cn(
                        "group relative rounded-2xl px-4 py-3 leading-relaxed",
                        isStudent
                          ? "bg-brand-primary text-white rounded-tr-xs max-w-[85%]"
                          : "bg-muted/40 border border-border/80 text-foreground rounded-tl-xs w-full"
                      )}
                    >
                      {msg.attachments && msg.attachments.length > 0 && courseIdFromPath && sessionId && (
                        <div className="mb-2">
                          <ZyraMessageAttachments
                            attachments={msg.attachments}
                            courseId={courseIdFromPath}
                            sessionId={sessionId}
                          />
                        </div>
                      )}

                      {isStudent ? (
                        <div className="whitespace-pre-wrap font-sans text-body-sm text-white">
                          {msg.content}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <MarkdownRenderer content={msg.content} density="compact" />

                          {msg.canvasSpec && (
                            <div className="mt-3">
                              <LearningCanvasRenderer spec={msg.canvasSpec} />
                            </div>
                          )}

                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-border/40 flex flex-wrap gap-1.5 items-center">
                              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Sumber:</span>
                              {msg.sources.map((s, idx) => (
                                <a
                                  key={idx}
                                  href={s.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-body-xs text-brand-primary hover:underline bg-brand-primary/10 px-2 py-0.5 rounded-md"
                                >
                                  {s.label}
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Quick Accelerators / Socratic follow-up chips */}
                          {isLastAiTurn && !chatLoading && (
                            <FollowUpChips
                              comprehensionCheck={showComprehensionCheck}
                              onSend={handleSend}
                            />
                          )}

                          {/* Copy message button */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2">
                            <button
                              type="button"
                              onClick={() => handleCopyText(msg.id, msg.content)}
                              className="p-1 rounded-md bg-background/80 hover:bg-background border border-border text-muted-foreground hover:text-foreground"
                              title="Salin pesan"
                              aria-label="Salin pesan"
                            >
                              {copiedMessageId === msg.id ? (
                                <Check className="size-3 text-status-success" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {chatLoading && (
                <div className="flex items-center gap-2 text-muted-foreground text-body-xs p-2">
                  <Loader2 className="size-4 animate-spin text-brand-primary" />
                  <span>Zyra sedang berpikir...</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleStopStream}
                    className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10"
                  >
                    Hentikan
                  </Button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Composer & Toolbar */}
        <div className="border-t border-border bg-card p-3 shrink-0 flex flex-col gap-2">
          {imageInputEnabled && courseIdFromPath && sessionId && (
            <ZyraAttachmentComposer
              ref={attachmentComposerRef}
              courseId={courseIdFromPath}
              sessionId={sessionId}
              onAttachmentIdsChange={setAttachmentIds}
              onAttachmentsChange={setReadyAttachments}
              onAttachmentsReadyChange={setAttachmentsReady}
            />
          )}

          <div className="relative flex flex-col rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-brand-primary/20 focus-within:border-brand-primary">
            <textarea
              ref={textareaRef}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Tanyakan materi atau rumus..."
              rows={2}
              className="w-full resize-none border-none bg-transparent p-2.5 text-body-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />

            <div className="flex items-center justify-between px-2.5 pb-2 pt-1 border-t border-border/30">
              <div className="flex items-center gap-1">
                <ZyraMathPalette onInsert={handleInsertSnippet} />
                <ZyraFormulaPreview input={inputVal} />
              </div>

              <div className="flex items-center gap-2">
                <ZyraAllowanceSummary />
                <Button
                  size="icon-xs"
                  onClick={() => handleSend()}
                  disabled={chatLoading || !inputVal.trim()}
                  className="rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90"
                  aria-label="Kirim pesan"
                >
                  <Send className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Micro-apps Modal View (Flashcards / Practice Quiz) */}
        {activeAction !== "none" && actionData.length > 0 && (
          <div className="absolute inset-0 z-50 flex flex-col bg-background p-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <span className="font-heading text-body-base font-bold">
                {activeAction === "flashcards" ? "Kartu Hafalan (Flashcards)" : "Latihan Kuis Cepat"}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setActiveAction("none")}
                aria-label="Tutup aktivitas"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-4">
              {activeAction === "flashcards" ? (
                <div
                  onClick={() => setActionFlipped(!actionFlipped)}
                  className="w-full max-w-sm aspect-4/3 rounded-2xl border border-border bg-card p-6 flex flex-col items-center justify-center text-center cursor-pointer shadow-lg transition-transform hover:scale-[1.02]"
                >
                  <span className="text-body-xs font-semibold text-muted-foreground uppercase mb-2">
                    {actionFlipped ? "Jawaban / Pembahasan" : "Pertanyaan"}
                  </span>
                  <p className="font-heading text-body-base text-foreground font-semibold">
                    {actionFlipped ? actionData[actionIndex]?.back : actionData[actionIndex]?.front}
                  </p>
                  <span className="mt-4 text-[10px] text-muted-foreground">Klik kartu untuk membalik</span>
                </div>
              ) : (
                <div className="w-full max-w-sm space-y-4">
                  <p className="font-heading text-body-base font-semibold">
                    {actionData[actionIndex]?.question}
                  </p>
                  <div className="space-y-2">
                    {actionData[actionIndex]?.options?.map((opt: string, optIdx: number) => (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => setActionSelectedAnswer(optIdx)}
                        className={cn(
                          "w-full text-left p-3 rounded-xl border text-body-sm font-medium transition-colors",
                          actionSelectedAnswer === optIdx
                            ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                            : "border-border bg-card hover:bg-muted/50"
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3 mt-4">
              <span className="text-body-xs text-muted-foreground">
                Item {actionIndex + 1} dari {actionData.length}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionIndex === 0}
                  onClick={() => {
                    setActionIndex(actionIndex - 1);
                    setActionFlipped(false);
                    setActionSelectedAnswer(null);
                  }}
                >
                  Sebelumnya
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (actionIndex < actionData.length - 1) {
                      setActionIndex(actionIndex + 1);
                      setActionFlipped(false);
                      setActionSelectedAnswer(null);
                    } else {
                      toast.success("Aktivitas selesai.");
                      setActiveAction("none");
                    }
                  }}
                >
                  {actionIndex === actionData.length - 1 ? "Selesai" : "Berikutnya"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
