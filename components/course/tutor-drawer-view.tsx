"use client";

import * as React from "react";
import Link from "next/link";
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
  ChevronDown,
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
import { consumeZyraStream } from "@/lib/zyra/stream-consumer";

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
  const [zyraAccessTier, setZyraAccessTier] = React.useState<"free" | "standard" | null>(null);
  // Allow existing standard modes unless the server has explicitly identified
  // this actor as Free. A temporary allowance-summary failure must not hide
  // standard functionality for the rest of the drawer session.
  const advancedModesEnabled = zyraAccessTier !== "free";
  const imageInputEnabled = caps.imageInput && activeMode === "chat" && advancedModesEnabled;

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
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
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

  // Header state & menu dropdown
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Course label for the drawer header
  const [courseLabel, setCourseLabel] = React.useState<string | null>(null);

  // Click outside to close dropdown menu
  React.useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

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

  // Dynamic header title matching Zyx Ops AI style
  const currentTitle = React.useMemo(() => {
    if (activeMode === "explain") {
      return data?.title ? `Konsep: ${data.title}` : "Penjelasan Konsep";
    }
    if (activeMode === "mistake") {
      return "Bedah Jawaban Kuis";
    }
    if (activeMode === "study-plan") {
      return "Rencana Belajar Mandiri";
    }
    const firstStudent = messages.find((m) => m.role === "student");
    if (firstStudent?.content) {
      return firstStudent.content;
    }
    return courseLabel || "Tanya Zyra";
  }, [activeMode, data, messages, courseLabel]);

  // Mobile body scroll lock
  React.useEffect(() => {
    if (!isOpen || !window.matchMedia("(max-width: 767px)").matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  // Internal container auto-scroll: strictly scrolls drawer container without moving main page
  React.useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isOpen, chatLoading]);

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
        textareaRef.current?.focus({ preventScroll: true });
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
    if (!advancedModesEnabled) return;
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
  }, [activeMode, koId, questionId, userAnswer, explainMode, advancedModesEnabled]);

  // Free accounts only receive the text chat lane. Reset a mode that may have
  // been selected before the allowance tier finished loading, and keep the
  // server-enforced tier aligned with the visible client experience.
  React.useEffect(() => {
    if (zyraAccessTier !== "free") return;
    setData(null);
    setErrors([]);
    setActiveAction("none");
    if (activeMode !== "chat") setActiveMode("chat");
  }, [activeMode, setActiveMode, zyraAccessTier]);

  // Synchronize data results to chat messages history
  React.useEffect(() => {
    if (!data || !advancedModesEnabled) return;
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
  }, [data, activeMode, pathname, sessionId, advancedModesEnabled, zyraAccessTier]);

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
    if (!advancedModesEnabled) return;
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
    if (!advancedModesEnabled) return;
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

    if (zyraAccessTier === "free" && requestedAttachmentIds.length > 0) {
      toast.error("Paket Free hanya mendukung pertanyaan teks.");
      return;
    }

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
    const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `zyra-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
          requestId,
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

      if (response.body) {
        for await (const part of consumeZyraStream(response.body, abortController.signal)) {
          if (part.type === "text-delta" && part.textDelta) {
            accumulatedContent += part.textDelta;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? { ...m, content: accumulatedContent } : m
              )
            );
          } else if (part.type === "chunk" && part.text) {
            accumulatedContent += part.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? { ...m, content: accumulatedContent } : m
              )
            );
          } else if (part.type === "data-sources" && part.sources) {
            finalSources = part.sources;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? { ...m, sources: part.sources } : m
              )
            );
          } else if (part.type === "data-canvas" && part.canvasSpec) {
            finalCanvasSpec = part.canvasSpec;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? { ...m, canvasSpec: part.canvasSpec } : m
              )
            );
          } else if (part.type === "data-session" && part.sessionId) {
            activeSid = part.sessionId;
            setSessionId(part.sessionId);
          } else if (part.type === "data-error" && part.data?.message) {
            accumulatedContent = `Maaf, terjadi kendala: ${part.data.message}`;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? { ...m, content: accumulatedContent } : m
              )
            );
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

  const handleNewChat = React.useCallback(() => {
    setSessionId(null);
    setMessages([
      {
        id: "chat-welcome",
        role: "ai",
        content:
          "Halo! Aku Zyra, asisten belajarmu. Tanyakan konsep, rumus matematika, atau soal latihan!",
      },
    ]);
    toast.success("Sesi obrolan baru dimulai.");
  }, []);

  const handleClearHistory = React.useCallback(async () => {
    const courseId = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
    if (courseId) {
      await clearTutorHistoryAction(courseId).catch(() => {});
    }
    setMessages([
      {
        id: "chat-welcome",
        role: "ai",
        content: "Riwayat percakapan dibersihkan. Apa yang ingin kamu diskusikan berikutnya?",
      },
    ]);
    toast.success("Riwayat obrolan dibersihkan.");
  }, [pathname]);

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
          "fixed inset-y-0 right-0 z-50 flex w-[min(var(--zyra-panel-width),100vw)] flex-col overflow-hidden border-l border-border bg-background shadow-2xl md:sticky md:top-0 md:bottom-auto md:right-auto md:self-start md:z-20 md:h-screen md:h-[100svh] md:w-[var(--zyra-panel-width)] md:shrink-0 md:shadow-none select-text",
          "bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px]",
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

        {/* Header: Ops AI Style (Title Dropdown + Minimal Action Icons) */}
        <header className="shrink-0 border-b border-border/80 px-3.5 py-2.5 bg-background/80 backdrop-blur-md flex items-center justify-between z-20 gap-2">
          {/* Left: Mode / Topic Dropdown Selector */}
          <div ref={menuRef} className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              aria-expanded={showMenu}
              aria-label="Menu topik dan mode Zyra"
              className="flex items-center gap-1.5 text-left text-body-sm font-semibold text-foreground hover:text-brand-primary transition-colors cursor-pointer truncate max-w-full group"
            >
              <span className="truncate max-w-[220px] sm:max-w-[300px]">
                {currentTitle}
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground group-hover:text-brand-primary transition-transform shrink-0" />
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <div className="absolute top-full left-0 mt-1.5 w-[280px] rounded-xl border border-border bg-background shadow-xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Mode Belajar
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode("chat");
                    setShowMenu(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-1.5 text-body-sm rounded-lg transition-colors text-left cursor-pointer",
                    activeMode === "chat"
                      ? "bg-brand-primary/10 text-brand-primary font-medium"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <span>Diskusi</span>
                  {activeMode === "chat" && <Check className="size-3.5" />}
                </button>
                {advancedModesEnabled && caps.explain && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMode("explain");
                      setShowMenu(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-1.5 text-body-sm rounded-lg transition-colors text-left cursor-pointer",
                      activeMode === "explain"
                        ? "bg-brand-primary/10 text-brand-primary font-medium"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    <span>Konsep</span>
                    {activeMode === "explain" && <Check className="size-3.5" />}
                  </button>
                )}
                {advancedModesEnabled && <button
                  type="button"
                  onClick={() => {
                    setActiveMode("mistake");
                    setShowMenu(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-1.5 text-body-sm rounded-lg transition-colors text-left cursor-pointer",
                    activeMode === "mistake"
                      ? "bg-brand-primary/10 text-brand-primary font-medium"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <span>Bedah Jawaban</span>
                  {activeMode === "mistake" && <Check className="size-3.5" />}
                </button>}
                {advancedModesEnabled && caps.studyPlan && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMode("study-plan");
                      setShowMenu(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-1.5 text-body-sm rounded-lg transition-colors text-left cursor-pointer",
                      activeMode === "study-plan"
                        ? "bg-brand-primary/10 text-brand-primary font-medium"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    <span>Rencana Belajar</span>
                    {activeMode === "study-plan" && <Check className="size-3.5" />}
                  </button>
                )}

                {zyraAccessTier === "free" && (
                  <div className="mt-2 border-t border-border/60 px-2 pt-2">
                    <p className="text-body-xs text-muted-foreground">Fitur lanjutan tersedia di paket berbayar.</p>
                    <Link
                      href="/plans"
                      className="mt-1 inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
                    >
                      Buka fitur lengkap
                      <ArrowRight className="size-3" />
                    </Link>
                  </div>
                )}

                <div className="border-t border-border/60 my-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      handleNewChat();
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-body-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-left cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>Percakapan Baru</span>
                  </button>
                  {activeMode === "chat" && messages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        handleClearHistory();
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-body-sm rounded-lg text-destructive hover:bg-destructive/10 transition-colors text-left cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                      <span>Bersihkan Riwayat</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Window Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleNewChat}
              aria-label="Obrolan baru"
              title="Mulai obrolan baru (+)"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Plus className="size-4" />
            </button>

            <button
              type="button"
              onClick={toggleExpand}
              aria-label={isExpanded ? "Kecilkan sidebar" : "Perbesar layar penuh"}
              title={isExpanded ? "Kecilkan tampilan" : "Buka layar penuh"}
              className="hidden md:inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              {isExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup panel asisten"
              title="Tutup asisten (Esc)"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* Dynamic Main Workspace / Conversation Area */}
        <div
          ref={scrollContainerRef}
          role="region"
          aria-label="Riwayat percakapan"
          tabIndex={0}
          className="flex-1 overflow-y-auto overscroll-contain min-h-0 p-4 space-y-5 font-sans text-body-sm focus-visible:outline-none"
        >
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

                if (isStudent) {
                  return (
                    <div key={msg.id || index} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-muted/90 text-foreground px-4 py-2.5 text-body-sm leading-relaxed shadow-2xs">
                        {msg.attachments && msg.attachments.length > 0 && courseIdFromPath && sessionId && (
                          <div className="mb-2">
                            <ZyraMessageAttachments
                              attachments={msg.attachments}
                              courseId={courseIdFromPath}
                              sessionId={sessionId}
                            />
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words font-sans text-body-sm">{msg.content}</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id || index} className="space-y-2 select-text">
                    {/* Zyra Header Label */}
                    <div className="flex items-center gap-1.5">
                      <span className="font-heading text-body-xs font-bold text-brand-primary">
                        Zyra
                      </span>
                    </div>

                    {/* Message Content Flow (Natural typography, no heavy card wrapper) */}
                    <div className="prose prose-sm dark:prose-invert max-w-none break-words text-body-sm leading-relaxed text-foreground">
                      <MarkdownRenderer content={msg.content} density="compact" />
                    </div>

                    {msg.canvasSpec && (
                      <div className="mt-3">
                        <LearningCanvasRenderer spec={msg.canvasSpec} />
                      </div>
                    )}

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-border/40 flex flex-wrap gap-1.5 items-center">
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
                    {msg.content && (
                      <div className="flex items-center gap-2 pt-1 text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => handleCopyText(msg.id, msg.content)}
                          aria-label="Salin pesan"
                          title="Salin pesan"
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5 px-1.5 rounded-md hover:bg-muted"
                        >
                          {copiedMessageId === msg.id ? (
                            <>
                              <Check className="size-3 text-status-success" />
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
              })}

              {chatLoading && (
                <div className="flex items-center gap-2 text-muted-foreground text-body-xs p-2">
                  <Loader2 className="size-3.5 animate-spin text-brand-primary" />
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
            </>
          )}
        </div>

        {/* Input Composer & Toolbar */}
        <footer className="shrink-0 border-t border-border/40 p-3 pt-2 bg-background/80 backdrop-blur-md">
          <div className="relative rounded-2xl border border-border bg-background/95 backdrop-blur-md shadow-md focus-within:border-brand-primary/60 focus-within:ring-1 focus-within:ring-brand-primary/20 transition-all p-2.5">
            {imageInputEnabled && courseIdFromPath && sessionId && (
              <div className="mb-2">
                <ZyraAttachmentComposer
                  ref={attachmentComposerRef}
                  courseId={courseIdFromPath}
                  sessionId={sessionId}
                  onAttachmentIdsChange={setAttachmentIds}
                  onAttachmentsChange={setReadyAttachments}
                  onAttachmentsReadyChange={setAttachmentsReady}
                />
              </div>
            )}

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
              className="w-full resize-none border-none bg-transparent p-1 text-body-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />

            <div className="flex items-center justify-between pt-2 border-t border-border/30">
              <div className="flex items-center gap-1">
                <ZyraMathPalette onInsert={handleInsertSnippet} />
                <ZyraFormulaPreview input={inputVal} />
              </div>

              <div className="flex items-center gap-2">
                <ZyraAllowanceSummary courseId={courseIdFromPath} onAccessTierChange={setZyraAccessTier} />
                {zyraAccessTier === "free" && (
                  <Link
                    href="/plans"
                    className="shrink-0 text-body-xs font-semibold text-brand-primary hover:underline"
                  >
                    Buka fitur lengkap
                  </Link>
                )}
                <Button
                  size="icon-xs"
                  onClick={() => handleSend()}
                  disabled={chatLoading || !inputVal.trim()}
                  className="size-7 rounded-full bg-brand-primary text-white hover:bg-brand-primary/90 transition-transform active:scale-95 disabled:opacity-40"
                  aria-label="Kirim pesan"
                >
                  <ArrowUp className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </footer>

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
