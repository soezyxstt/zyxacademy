"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  MessageSquare,
  Sparkles,
  Copy,
  Trash2,
  Send,
  Target,
  Search,
  GripVertical,
  HelpCircle,
  Lightbulb,
} from "lucide-react";
import {
  explainConceptAction,
  analyzeMistakeAction,
  buildStudyPlanAction,
  generatePracticeQuizAction,
  askTutorRagAction,
  saveTutorMessagesAction,
  loadTutorHistoryAction,
  clearTutorHistoryAction,
} from "@/app/actions/tutor";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { normalizeTutorMathMarkdown } from "@/lib/tutor/math-markdown";
import { getTutorCapabilities } from "@/lib/tutor-capabilities";
import {
  ZyraAttachmentComposer,
  type ZyraAttachmentComposerHandle,
} from "@/components/course/zyra-attachment-composer";
import { ZyraAllowanceSummary } from "@/components/course/zyra-allowance-summary";
import { ZyraPet } from "@/components/course/zyra-pet";
import { ZyraMark } from "@/components/course/zyra-mark";
import { ZyraFloatingPet } from "@/components/course/zyra-floating-pet";
import { petStateForTutorEvent } from "@/lib/zyra/murid";
import { useSwipe } from "@/hooks/use-swipe";
import { LearningCanvasRenderer } from "@/components/course/learning-canvas/learning-canvas-renderer";
import type { CanvasSpec } from "@/lib/zyra/canvas";
import { zyraImageFilesFromClipboard } from "@/lib/zyra/images/composer";
import type { ZyraMessageAttachment } from "@/lib/zyra/images/contracts";
import { ZyraMessageAttachments } from "@/components/course/zyra-message-attachments";
import { getFlashcardsForKOAction } from "@/app/actions/tutor-extra";

type TutorMode = "explain" | "mistake" | "study-plan" | "chat" | null;
type ActiveAction = "none" | "flashcards" | "practice-quiz";

interface ChatMessage {
  id: string;
  role: "student" | "ai";
  content: string;
  sources?: Array<{ type: string; id: string; label: string; href: string }>;
  canvasSpec?: CanvasSpec | null;
  attachments?: ZyraMessageAttachment[];
}

interface TutorContextType {
  openExplain: (koId: string, initialMode?: "content" | "analogy" | "simplification") => void;
  openMistake: (questionId: string, userAnswer: string) => void;
  openStudyPlan: () => void;
  openChat: () => void;
  openChatWithQuestion: (question: string) => void;
  close: () => void;
  isOpen: boolean;
  activeMode: TutorMode;
}

const TutorContext = React.createContext<TutorContextType | undefined>(undefined);

export function useTutor() {
  const context = React.useContext(TutorContext);
  if (!context) {
    throw new Error("useTutor must be used within a TutorProvider");
  }
  return context;
}

const MIN_SIDEBAR_WIDTH = 360;
const DEFAULT_SIDEBAR_WIDTH = 500;
const WIDE_SIDEBAR_WIDTH = 720;
const COMPACT_SIDEBAR_WIDTH = 380;
const STORAGE_KEY_WIDTH = "zyra_tutor_sidebar_width";

export function TutorProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const courseIdFromPath = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
  const caps = getTutorCapabilities(courseIdFromPath);

  const [isOpen, setIsOpen] = React.useState(false);
  const [activeMode, setActiveMode] = React.useState<TutorMode>(null);
  const imageInputEnabled = caps.imageInput && activeMode === "chat";
  
  // Variables and results states
  const [koId, setKoId] = React.useState<string | null>(null);
  const [questionId, setQuestionId] = React.useState<string | null>(null);
  const [userAnswer, setUserAnswer] = React.useState<string | null>(null);
  const [explainMode, setExplainMode] = React.useState<"content" | "analogy" | "simplification">("content");
  
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
  const [attachmentComposerKey, setAttachmentComposerKey] = React.useState(0);
  const [attachmentsReady, setAttachmentsReady] = React.useState(true);
  const [copiedMessageId, setCopiedMessageId] = React.useState<string | null>(null);

  const attachmentComposerRef = React.useRef<ZyraAttachmentComposerHandle>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const savedDataRef = React.useRef<any>(null);

  // Resizable sidebar states
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(DEFAULT_SIDEBAR_WIDTH);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const isResizingRef = React.useRef(false);

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
          setSidebarWidth(Math.min(window.innerWidth - 32, parsed));
        }
      }
    } catch {}
  }, []);

  const petState = petStateForTutorEvent({
    isOpen,
    activeMode,
    loading,
    chatLoading,
    attachmentsReady,
    hasAttachments: attachmentIds.length > 0 || !attachmentsReady,
    hasError: errors.length > 0,
    quotaExhausted: errors.some((error) => error.includes("DAILY_QUOTA_EXCEEDED")),
  });

  const scrollToBottom = React.useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useSwipe({
    onSwipeRight: () => {
      if (isOpen) close();
    }
  });

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, chatLoading, scrollToBottom]);

  // Adjust textarea height dynamically
  React.useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const nextHeight = Math.min(textareaRef.current.scrollHeight, 180);
    textareaRef.current.style.height = `${Math.max(42, nextHeight)}px`;
  }, [inputVal]);

  // Handle drag to resize
  const startResize = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    setIsDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const maxWidth = window.innerWidth - 24;
      const targetWidth = window.innerWidth - ev.clientX;
      const clamped = Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, targetWidth));
      setIsExpanded(false);
      setSidebarWidth(clamped);
    };

    const onUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        try {
          setSidebarWidth((current) => {
            localStorage.setItem(STORAGE_KEY_WIDTH, String(current));
            return current;
          });
        } catch {}
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const toggleExpand = React.useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleSetPresetWidth = React.useCallback((width: number) => {
    setIsExpanded(false);
    setSidebarWidth(width);
    try {
      localStorage.setItem(STORAGE_KEY_WIDTH, String(width));
    } catch {}
  }, []);

  const openChat = React.useCallback(async () => {
    setKoId(null);
    setQuestionId(null);
    setUserAnswer(null);
    setActiveMode("chat");
    setActiveAction("none");
    setIsOpen(true);
    setAttachmentIds([]);
    setReadyAttachments([]);
    setAttachmentsReady(true);
    setAttachmentComposerKey((value) => value + 1);

    const courseId = pathname?.startsWith("/courses/")
      ? pathname.split("/")[2]
      : null;

    if (courseId) {
      setLoading(true);
      try {
        const result = await loadTutorHistoryAction(courseId);
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
      } catch {
        setMessages([{
          id: "chat-welcome",
          role: "ai",
          content: "Halo! Aku Zyra, asisten belajar buatan Zyx. Tanyakan apa saja seputar materi kuliah atau soal latihan, aku siap membimbingmu dengan pendekatan Socratic!",
        }]);
      } finally {
        setLoading(false);
      }
    } else {
      setMessages([{
        id: "chat-welcome",
        role: "ai",
        content: "Halo! Aku Zyra, asisten belajar buatan Zyx. Tanyakan apa saja seputar materi kuliah atau soal latihan, aku siap membimbingmu dengan pendekatan Socratic!",
      }]);
    }
  }, [pathname]);

  const openChatWithQuestion = React.useCallback(async (question: string) => {
    await openChat();
    setInputVal(question);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }, [openChat]);

  const openExplain = React.useCallback((id: string, initialMode: "content" | "analogy" | "simplification" = "content") => {
    if (!caps.explain) {
      openChat();
      return;
    }
    setKoId(id);
    setQuestionId(null);
    setUserAnswer(null);
    setExplainMode(initialMode);
    setActiveMode("explain");
    setActiveAction("none");
    setMessages([]);
    setIsOpen(true);
  }, [caps.explain, openChat]);

  const openMistake = React.useCallback((qId: string, answerText: string) => {
    setKoId(null);
    setQuestionId(qId);
    setUserAnswer(answerText);
    setActiveMode("mistake");
    setActiveAction("none");
    setMessages([]);
    setIsOpen(true);
  }, []);

  const openStudyPlan = React.useCallback(() => {
    if (!caps.studyPlan) {
      openChat();
      return;
    }
    setKoId(null);
    setQuestionId(null);
    setUserAnswer(null);
    setActiveMode("study-plan");
    setActiveAction("none");
    setMessages([]);
    setIsOpen(true);
  }, [caps.studyPlan, openChat]);

  const close = React.useCallback(() => {
    setIsOpen(false);
    setActiveMode(null);
    setData(null);
    setMessages([]);
    setErrors([]);
    setSessionId(null);
  }, []);

  // Sync execution from backend services on mode triggers
  React.useEffect(() => {
    if (!isOpen || !activeMode) return;
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
  }, [isOpen, activeMode, koId, questionId, userAnswer, explainMode]);

  // Synchronize data results to chat messages history
  React.useEffect(() => {
    if (!data) return;
    if (savedDataRef.current === data) return;
    
    const courseId = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
    let newMessages: ChatMessage[] = [];

    if (activeMode === "explain") {
      newMessages = [
        {
          id: `initial-q-${Date.now()}`,
          role: "student",
          content: `Jelaskan konsep: ${data.title}`,
        },
        {
          id: `initial-a-${Date.now()}`,
          role: "ai",
          content: data.content,
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
          content: `### Temuan Miskonsepsi Utama:\n${data.detectedMisconception}\n\n### Kesalahan Perhitungan / Substitusi:\n${data.mathematicalError}\n\n### Panduan Berpikir (Socratic):\n${data.socraticGuidance}`,
        }
      ];
    } else if (activeMode === "study-plan") {
      const formattedPlan = data.map((step: string) => step).join("\n\n");
      newMessages = [
        {
          id: `initial-q-${Date.now()}`,
          role: "student",
          content: "Tampilkan rencana belajar mandiriku.",
        },
        {
          id: `initial-a-${Date.now()}`,
          role: "ai",
          content: `### Rencana Studi Mandiri Anda:\n\n${formattedPlan}`,
        }
      ];
    }

    if (newMessages.length > 0) {
      setMessages(newMessages);
      savedDataRef.current = data;
      if (courseId) {
        saveTutorMessagesAction(
          courseId, 
          newMessages.map(m => ({ role: m.role, content: m.content, sources: m.sources, canvasSpec: m.canvasSpec })),
          sessionId
        ).then((res) => {
          if (res.sessionId && !sessionId) {
            setSessionId(res.sessionId);
          }
        }).catch(() => {});
      }
    }
  }, [data, activeMode, pathname, sessionId]);

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

  // Handle sending arbitrary chat messages
  const handleSend = async (suggestedQuestion?: string) => {
    const questionText = (suggestedQuestion ?? inputVal).trim();
    const requestedAttachmentIds = [...attachmentIds];
    const requestedAttachments = [...readyAttachments];
    if (!questionText && requestedAttachmentIds.length === 0) return;

    const courseId = pathname?.startsWith("/courses/")
      ? pathname.split("/")[2]
      : null;

    const studentMsg: ChatMessage = {
      id: `user-msg-${Date.now()}`,
      role: "student",
      content: questionText || "Gambar terlampir",
      attachments: requestedAttachments,
    };

    setInputVal("");
    setMessages((prev) => [...prev, studentMsg]);
    setChatLoading(true);

    let aiMsg: { id: string; role: "ai"; content: string; sources?: Array<{ type: string; id: string; label: string; href: string }>; canvasSpec?: CanvasSpec | null };
    let activeSid = sessionId;

    try {
      const res = await askTutorRagAction(
        courseId ?? "unknown",
        null,
        questionText || "Tolong jelaskan isi gambar ini sesuai materi kuliah.",
        sessionId,
        requestedAttachmentIds,
        pathname,
      );
      if (res.sessionId && !sessionId) {
        setSessionId(res.sessionId);
        activeSid = res.sessionId;
      }

      let aiContent: string;
      if (res.budgetExhausted) {
        aiContent = "Zyra tidak dapat menjawab pertanyaan baru hari ini (batas harian tercapai). Silakan coba lagi besok, atau gunakan buku teks dan kartu hafalan untuk belajar mandiri.";
      } else if (res.failureCode === "provider_unavailable") {
        aiContent = "Gambar dan pertanyaanmu sudah diterima, tetapi layanan sedang mengalami kendala. Permintaan ini bukan ditolak karena kuota. Coba kirim ulang beberapa saat lagi.";
      } else if (!res.answer) {
        aiContent = "Maaf, terjadi gangguan saat memproses jawaban. Silakan coba lagi dalam beberapa saat.";
      } else {
        aiContent = res.answer;
      }

      aiMsg = {
        id: `ai-msg-${Date.now()}`,
        role: "ai",
        content: aiContent,
        sources: res.answer ? (res.sources || []) : [],
        canvasSpec: res.answer ? (res.canvasSpec ?? null) : null,
      };
    } catch {
      aiMsg = {
        id: `ai-err-${Date.now()}`,
        role: "ai",
        content: "Maaf, terjadi kesalahan koneksi. Periksa jaringan Anda dan coba lagi.",
        sources: [],
      };
    } finally {
      setChatLoading(false);
    }

    if (requestedAttachmentIds.length > 0) {
      setAttachmentIds([]);
      setReadyAttachments([]);
      setAttachmentComposerKey((value) => value + 1);
    }

    setMessages((prev) => [...prev, aiMsg!]);

    if (courseId) {
      saveTutorMessagesAction(courseId, [
        { role: studentMsg.role, content: studentMsg.content, attachmentIds: requestedAttachmentIds },
        { role: aiMsg!.role, content: aiMsg!.content, sources: aiMsg!.sources, canvasSpec: aiMsg!.canvasSpec },
      ], activeSid).catch(() => {});
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    toast.success("Teks disalin ke clipboard.");
    setTimeout(() => {
      setCopiedMessageId((prev) => (prev === id ? null : prev));
    }, 2000);
  };

  return (
    <TutorContext.Provider value={{ openExplain, openMistake, openStudyPlan, openChat, openChatWithQuestion, close, isOpen, activeMode }}>
      {children}

      {/* Global floating Zyra trigger */}
      {pathname?.startsWith("/courses/") &&
        !pathname.includes("/live/host") &&
        !pathname.endsWith("/daftar") &&
        !isOpen && (caps.pet ? (
          <ZyraFloatingPet state={petState} onOpen={openChat} />
        ) : (
          <button
            type="button"
            onClick={openChat}
            aria-label="Tanya Zyra"
            title="Tanya Zyra"
            className="group fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full bg-brand-primary text-white shadow-lg shadow-brand-primary/30 transition-all hover:scale-105 hover:bg-brand-primary/95 active:scale-95 md:bottom-8 md:right-8"
          >
            <ZyraMark className="size-7 transition-transform duration-150 group-hover:scale-105" />
            <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-body-xs font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 md:block">
              Tanya Zyra
            </span>
          </button>
        ))}

      {/* Backdrop for Mobile Only */}
      {isOpen && (
        <div
          role="presentation"
          onClick={close}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Non-blocking, Docked Learning Assistant Sidebar */}
      {isOpen && (
        <aside
          aria-label="Zyra Learning Assistant"
          style={{
            width: isExpanded ? "calc(100vw - 1rem)" : `min(${sidebarWidth}px, 100vw)`,
          }}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex flex-col bg-card border-l border-border shadow-2xl overflow-hidden",
            isDragging ? "transition-none select-none" : "transition-[width] duration-150 ease-out"
          )}
        >
          {/* Drag-to-Resize Handle */}
          <div
            onMouseDown={startResize}
            onDoubleClick={() => handleSetPresetWidth(sidebarWidth > 600 ? DEFAULT_SIDEBAR_WIDTH : WIDE_SIDEBAR_WIDTH)}
            role="separator"
            aria-orientation="vertical"
            aria-label="Ubah lebar sidebar Zyra"
            title="Seret untuk mengubah lebar atau klik dua kali untuk beralih mode lebar"
            className={cn(
              "absolute left-0 top-0 bottom-0 z-50 w-2 cursor-col-resize select-none group hidden md:flex items-center justify-center -translate-x-1 hover:bg-brand-primary/20 transition-colors",
              isDragging && "bg-brand-primary/30"
            )}
          >
            <div className="h-8 w-1 rounded-full bg-border group-hover:bg-brand-primary transition-colors flex items-center justify-center">
              <GripVertical className="size-3 text-muted-foreground group-hover:text-white" />
            </div>
          </div>

          {/* Top Header & Ergonomic Activity Rail */}
          <div className="flex flex-col border-b border-border/80 bg-muted/30 shrink-0">
            {/* Top Row: Brand, Capabilities, Controls */}
            <div className="flex items-center justify-between px-4 py-3 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {caps.pet ? (
                  <ZyraPet state={petState} />
                ) : (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                    <ZyraMark className="size-4.5" />
                  </div>
                )}
                <div className="min-w-0 flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-heading text-body-sm font-bold text-foreground truncate">
                      Zyra
                    </span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-sans font-medium rounded">
                      Asisten Belajar
                    </Badge>
                  </div>
                  <span className="text-body-xs text-muted-foreground truncate">
                    {courseIdFromPath ? `Konteks: ${courseIdFromPath}` : "Pedagogi Socratic ITB"}
                  </span>
                </div>
              </div>

              {/* Window Controls */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Width Presets (Desktop) */}
                <div className="hidden lg:flex items-center bg-background/80 border border-border rounded-lg p-0.5 mr-1 text-[10px] font-medium text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => handleSetPresetWidth(COMPACT_SIDEBAR_WIDTH)}
                    title="Lebar Ramping (380px)"
                    className={cn(
                      "px-1.5 py-0.5 rounded transition-colors",
                      !isExpanded && sidebarWidth <= 420 ? "bg-muted text-foreground font-bold" : "hover:text-foreground"
                    )}
                  >
                    380
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresetWidth(DEFAULT_SIDEBAR_WIDTH)}
                    title="Lebar Standar (500px)"
                    className={cn(
                      "px-1.5 py-0.5 rounded transition-colors",
                      !isExpanded && sidebarWidth > 420 && sidebarWidth < 650 ? "bg-muted text-foreground font-bold" : "hover:text-foreground"
                    )}
                  >
                    500
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresetWidth(WIDE_SIDEBAR_WIDTH)}
                    title="Lebar Luas (720px)"
                    className={cn(
                      "px-1.5 py-0.5 rounded transition-colors",
                      !isExpanded && sidebarWidth >= 650 ? "bg-muted text-foreground font-bold" : "hover:text-foreground"
                    )}
                  >
                    720
                  </button>
                </div>

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
                    aria-label="Bersihkan obrolan"
                    title="Bersihkan riwayat obrolan"
                    className="text-muted-foreground hover:text-status-error hover:bg-status-error/10"
                    onClick={async () => {
                      const courseId = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
                      if (courseId) await clearTutorHistoryAction(courseId, sessionId).catch(() => {});
                      setSessionId(null);
                      setMessages([{
                        id: "chat-welcome",
                        role: "ai",
                        content: "Halo! Obrolan telah dibersihkan. Apa yang ingin kamu diskusikan berikutnya?",
                      }]);
                      toast.success("Riwayat obrolan dibersihkan.");
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={close}
                  aria-label="Tutup sidebar Zyra"
                  title="Tutup (Esc)"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {/* Socratic Learning Modes Activity Rail */}
            <div className="flex items-center gap-1 px-3 pb-2 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => {
                  setActiveMode("chat");
                  setActiveAction("none");
                }}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-body-xs font-medium transition-colors whitespace-nowrap",
                  activeMode === "chat" && activeAction === "none"
                    ? "bg-brand-primary text-white shadow-xs"
                    : "bg-background/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60"
                )}
              >
                <MessageSquare className="size-3.5" />
                <span>Tanya</span>
              </button>

              {caps.explain && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode("explain");
                    setActiveAction("none");
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-body-xs font-medium transition-colors whitespace-nowrap",
                    activeMode === "explain" && activeAction === "none"
                      ? "bg-brand-primary text-white shadow-xs"
                      : "bg-background/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60"
                  )}
                >
                  <Lightbulb className="size-3.5" />
                  <span>Konsep</span>
                </button>
              )}

              {caps.mistake && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode("mistake");
                    setActiveAction("none");
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-body-xs font-medium transition-colors whitespace-nowrap",
                    activeMode === "mistake" && activeAction === "none"
                      ? "bg-brand-primary text-white shadow-xs"
                      : "bg-background/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60"
                  )}
                >
                  <Search className="size-3.5" />
                  <span>Analisis</span>
                </button>
              )}

              {caps.studyPlan && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode("study-plan");
                    setActiveAction("none");
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-body-xs font-medium transition-colors whitespace-nowrap",
                    activeMode === "study-plan" && activeAction === "none"
                      ? "bg-brand-primary text-white shadow-xs"
                      : "bg-background/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60"
                  )}
                >
                  <Target className="size-3.5" />
                  <span>Rencana</span>
                </button>
              )}

              {caps.microApps && (
                <button
                  type="button"
                  onClick={() => {
                    if (koId) {
                      handleLaunchFlashcards(koId);
                    } else {
                      toast.info("Pilih konsep atau mulai kuis untuk membuka modul hafalan.");
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-body-xs font-medium transition-colors whitespace-nowrap",
                    activeAction !== "none"
                      ? "bg-brand-secondary text-white shadow-xs"
                      : "bg-background/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60"
                  )}
                >
                  <Layers className="size-3.5" />
                  <span>Latihan Kilat</span>
                </button>
              )}
            </div>
          </div>

          {/* Quota & Allowance Status Header */}
          {caps.muridExperience && activeMode === "chat" && (
            <ZyraAllowanceSummary refreshKey={messages.length} />
          )}

          {/* Body Content Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 flex flex-col justify-start select-text">
            {/* Loading Indicator */}
            {loading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
                <Loader2 className="size-8 text-brand-primary animate-spin" />
                <p className="text-body-xs font-medium text-muted-foreground">Zyra sedang merangkum jawaban socratic...</p>
              </div>
            )}

            {/* Error / Quota Limit Display */}
            {!loading && errors.length > 0 && (
              <div className="rounded-xl border border-status-error/30 bg-status-error/5 p-4 space-y-3 text-left">
                <div className="flex items-center gap-2 text-status-error font-semibold text-body-sm">
                  <AlertTriangle className="size-4 shrink-0" />
                  Batas Penggunaan Zyra Tercapai
                </div>
                <p className="text-body-xs text-foreground/90 leading-relaxed">
                  {errors[0].includes("DAILY_QUOTA_EXCEEDED") 
                    ? "Anda telah mencapai batas interaksi harian dengan Zyra. Zyra tersedia kembali besok."
                    : errors[0]}
                </p>
                <div className="border-t border-status-error/20 pt-3 text-body-xs text-status-error font-mono">
                  <b>Pilihan Belajar Mandiri:</b>
                  <ul className="mt-1.5 list-disc list-inside space-y-1">
                    <li>Gunakan menu buku teks dan catatan materi secara mandiri.</li>
                    <li>Selesaikan kartu hafalan flashcards di deck utama.</li>
                    <li>Diskusi langsung bersama tutor ITB via grup belajar.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Message Stream */}
            {messages.length > 0 && (
              <div className="space-y-4 flex-1 flex flex-col justify-start">
                {messages.map((msg, messageIndex) => {
                  const isStudent = msg.role === "student";
                  const isLatestAssistant = !isStudent && messageIndex === messages.length - 1;

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "max-w-[92%] rounded-2xl p-4 text-body-sm leading-relaxed text-left flex flex-col gap-2 relative group",
                        isStudent
                          ? "w-fit bg-brand-primary text-white self-end rounded-tr-xs shadow-xs"
                          : "w-full bg-muted/60 text-foreground self-start rounded-tl-xs border border-border/70 shadow-xs"
                      )}
                    >
                      {/* Copy Action Button */}
                      {!isStudent && (
                        <button
                          type="button"
                          onClick={() => handleCopyText(msg.id, msg.content)}
                          title="Salin jawaban"
                          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground border border-border/50"
                        >
                          {copiedMessageId === msg.id ? (
                            <Check className="size-3.5 text-status-success" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </button>
                      )}

                      {/* Message Content */}
                      <MarkdownRenderer
                        content={normalizeTutorMathMarkdown(msg.content)}
                        className={isStudent ? "text-white" : ""}
                      />

                      {/* Attachments */}
                      {isStudent && msg.attachments && msg.attachments.length > 0 && sessionId && courseIdFromPath && (
                        <ZyraMessageAttachments attachments={msg.attachments} courseId={courseIdFromPath} sessionId={sessionId} />
                      )}

                      {/* Dynamic Learning Canvas */}
                      {caps.canvas && msg.canvasSpec && !isStudent && (
                        <LearningCanvasRenderer spec={msg.canvasSpec} />
                      )}
                      
                      {/* Citations and Verified Sources */}
                      {!isStudent && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 pt-2.5 border-t border-border/50">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                            Rujukan Materi Terverifikasi
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.sources.map((src, i) => (
                              <a
                                key={`${src.id}-${i}`}
                                href={src.href}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-background px-2.5 py-1 text-body-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
                              >
                                {src.type === "question" ? (
                                  <FileQuestion className="size-3 text-brand-primary" />
                                ) : (
                                  <BookOpen className="size-3 text-brand-primary" />
                                )}
                                <span>{src.label}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Socratic Accelerator Follow-up Chips on latest AI message */}
                      {isLatestAssistant && activeMode === "chat" && !chatLoading && (
                        <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-1.5" aria-label="Aksi belajar lanjutan">
                          <span className="w-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Eksplorasi Lanjutan
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleSend("Berikan contoh soal serupa dan tuntun aku langkah demi langkah.")}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-body-xs font-medium text-foreground hover:bg-muted transition-colors"
                          >
                            <Sparkles className="size-3 text-brand-primary" />
                            <span>Contoh Soal</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSend("Uji pemahamanku dengan 1 pertanyaan konsep singkat tanpa memberi kunci jawaban langsung.")}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-body-xs font-medium text-foreground hover:bg-muted transition-colors"
                          >
                            <HelpCircle className="size-3 text-brand-secondary" />
                            <span>Uji Pemahaman</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSend("Jelaskan dengan analogi sehari-hari yang mudah dibayangkan.")}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-body-xs font-medium text-foreground hover:bg-muted transition-colors"
                          >
                            <Compass className="size-3 text-brand-primary" />
                            <span>Analogi Sederhana</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Concept Socratic Buttons */}
                {caps.microApps && activeMode === "explain" && activeAction === "none" && !chatLoading && (
                  <div className="grid grid-cols-2 gap-2 pt-2 self-start w-full">
                    <Button 
                      variant="outline" 
                      className="rounded-lg h-9 text-body-xs font-medium"
                      onClick={async () => {
                        setExplainMode("analogy");
                        const studentMsg: ChatMessage = { id: `u-ana-${Date.now()}`, role: "student", content: "Berikan analogi untuk konsep ini." };
                        setMessages((prev) => [...prev, studentMsg]);
                        setChatLoading(true);
                        try {
                          const res = await explainConceptAction(koId!, "analogy");
                          if (res.success) {
                            const aiMsg: ChatMessage = { id: `ai-ana-${Date.now()}`, role: "ai", content: `### Analogi Konsep\n\n> &ldquo;${res.data.analogy}&rdquo;\n\n**Miskonsepsi Umum:**\n${res.data.commonMisconception}` };
                            setMessages((prev) => [...prev, aiMsg]);
                            
                            const courseId = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
                            if (courseId) {
                              saveTutorMessagesAction(courseId, [
                                { role: studentMsg.role, content: studentMsg.content },
                                { role: aiMsg.role, content: aiMsg.content }
                              ], sessionId).catch(() => {});
                            }
                          }
                        } catch {
                          toast.error("Gagal memuat analogi.");
                        } finally {
                          setChatLoading(false);
                        }
                      }}
                    >
                      <Compass className="size-3.5 mr-1.5 text-brand-primary" />
                      Gunakan Analogi
                    </Button>
                    <Button 
                      variant="outline" 
                      className="rounded-lg h-9 text-body-xs font-medium"
                      onClick={async () => {
                        setExplainMode("simplification");
                        const studentMsg: ChatMessage = { id: `u-simp-${Date.now()}`, role: "student", content: "Sederhanakan penjelasan konsep ini." };
                        setMessages((prev) => [...prev, studentMsg]);
                        setChatLoading(true);
                        try {
                          const res = await explainConceptAction(koId!, "simplification");
                          if (res.success) {
                            const aiMsg: ChatMessage = { id: `ai-simp-${Date.now()}`, role: "ai", content: `### Penjelasan Sederhana\n\n${res.data.simplification}\n\n**Miskonsepsi Umum:**\n${res.data.commonMisconception}` };
                            setMessages((prev) => [...prev, aiMsg]);
                            
                            const courseId = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
                            if (courseId) {
                              saveTutorMessagesAction(courseId, [
                                { role: studentMsg.role, content: studentMsg.content },
                                { role: aiMsg.role, content: aiMsg.content }
                              ], sessionId).catch(() => {});
                            }
                          }
                        } catch {
                          toast.error("Gagal menyederhanakan.");
                        } finally {
                          setChatLoading(false);
                        }
                      }}
                    >
                      <RefreshCw className="size-3.5 mr-1.5 text-brand-secondary" />
                      Sederhanakan
                    </Button>
                  </div>
                )}

                {/* Socratic Practice Launchers */}
                {caps.microApps && activeMode === "explain" && activeAction === "none" && !chatLoading && koId && (
                  <div className="pt-3 border-t border-border space-y-2 w-full">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                      Latihan Terintegrasi:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Button 
                        className="rounded-lg bg-brand-primary hover:bg-brand-primary/95 text-white text-body-xs"
                        onClick={() => handleLaunchFlashcards(koId)}
                      >
                        <Layers className="size-3.5 mr-1.5" />
                        Kartu Hafalan
                      </Button>
                      <Button 
                        variant="outline" 
                        className="rounded-lg text-body-xs"
                        onClick={() => handleLaunchPracticeQuiz(koId)}
                      >
                        <ClipboardList className="size-3.5 mr-1.5 text-brand-secondary" />
                        Kuis Kilat (3 Soal)
                      </Button>
                    </div>
                  </div>
                )}

                {/* Typing Loader Indicator */}
                {chatLoading && (
                  <div className="flex w-fit items-center gap-1.5 rounded-2xl bg-muted/60 border border-border/60 px-4 py-3 self-start rounded-tl-xs">
                    <span className="text-body-xs text-muted-foreground mr-1">Zyra sedang berpikir</span>
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="size-1.5 rounded-full bg-brand-primary animate-bounce"
                        style={{ animationDelay: `${dot * 150}ms` }}
                      />
                    ))}
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Multiline Socratic Input Composer */}
          {messages.length > 0 && activeAction === "none" && (
            <div className="p-3 md:p-4 border-t border-border/80 bg-background shrink-0 select-text space-y-2">
              {imageInputEnabled && sessionId && courseIdFromPath && (
                <ZyraAttachmentComposer
                  key={attachmentComposerKey}
                  ref={attachmentComposerRef}
                  courseId={courseIdFromPath}
                  sessionId={sessionId}
                  disabled={chatLoading}
                  onAttachmentIdsChange={setAttachmentIds}
                  onAttachmentsChange={setReadyAttachments}
                  onAttachmentsReadyChange={setAttachmentsReady}
                />
              )}

              <div className="relative flex items-end gap-2 bg-muted/40 border border-border/80 focus-within:border-brand-primary/80 focus-within:ring-1 focus-within:ring-brand-primary/30 rounded-xl p-2 transition-all">
                <textarea
                  ref={textareaRef}
                  placeholder="Tanyakan rumus, konsep, atau paste screenshot soal..."
                  value={inputVal}
                  rows={1}
                  onChange={(e) => setInputVal(e.target.value)}
                  onPaste={(event) => {
                    const files = zyraImageFilesFromClipboard(event.clipboardData.items);
                    if (files.length === 0) return;
                    event.preventDefault();
                    attachmentComposerRef.current?.addFiles(files);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  disabled={chatLoading}
                  className="flex-1 max-h-[160px] min-h-[38px] resize-none bg-transparent px-2 py-1 text-body-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-hidden"
                />
                
                <Button
                  size="icon-sm"
                  onClick={() => void handleSend()}
                  disabled={chatLoading || !attachmentsReady || (!inputVal.trim() && attachmentIds.length === 0)}
                  className="rounded-lg bg-brand-primary hover:bg-brand-primary/95 text-white shrink-0 size-8 transition-transform active:scale-95"
                >
                  <Send className="size-4" />
                  <span className="sr-only">Kirim Pertanyaan</span>
                </Button>
              </div>

              <div className="flex items-center justify-between px-1 text-body-xs text-muted-foreground">
                <span>Tekan <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Enter</kbd> untuk kirim, <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Shift+Enter</kbd> untuk baris baru</span>
              </div>
            </div>
          )}

          {/* Flashcards Micro-App Overlay */}
          {activeAction === "flashcards" && actionData.length > 0 && (
            <div className="absolute inset-0 bg-background z-30 p-5 flex flex-col justify-between">
              <div className="space-y-4 flex-1 flex flex-col justify-start">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-brand-primary" />
                    <span className="font-heading text-body-xs font-bold text-foreground uppercase tracking-wider">
                      Kartu Hafalan ({actionIndex + 1}/{actionData.length})
                    </span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="xs"
                    className="h-7 text-body-xs"
                    onClick={() => setActiveAction("none")}
                  >
                    Tutup Latihan
                  </Button>
                </div>

                {/* Flip Card Deck */}
                <div 
                  onClick={() => setActionFlipped(!actionFlipped)}
                  className={cn(
                    "flex-1 min-h-[220px] max-h-[340px] border rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 shadow-md",
                    actionFlipped 
                      ? "bg-brand-primary/5 border-brand-primary/40 ring-1 ring-brand-primary/10" 
                      : "bg-card border-border hover:border-brand-primary/30"
                  )}
                >
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block mb-4 select-none">
                    {actionFlipped ? "KUNCI JAWABAN (BELAKANG)" : "PERTANYAAN (DEPAN)"}
                  </span>
                  
                  <div className="text-body-base font-medium leading-relaxed font-sans max-w-sm text-foreground">
                    <MarkdownRenderer content={actionFlipped ? actionData[actionIndex].back : actionData[actionIndex].front} />
                  </div>

                  <span className="text-body-xs text-muted-foreground/60 select-none mt-6 italic">
                    Klik kartu untuk membalikkan
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1 rounded-lg"
                    onClick={() => {
                      setActionFlipped(false);
                      if (actionIndex < actionData.length - 1) {
                        setActionIndex(actionIndex + 1);
                      } else {
                        toast.success("Kartu hafalan selesai dikerjakan.");
                        setActiveAction("none");
                      }
                    }}
                  >
                    Lupa / Salah
                  </Button>
                  <Button 
                    className="flex-1 rounded-lg bg-status-success hover:bg-status-success/90 text-white"
                    onClick={() => {
                      setActionFlipped(false);
                      if (actionIndex < actionData.length - 1) {
                        setActionIndex(actionIndex + 1);
                      } else {
                        toast.success("Hebat! Kartu hafalan selesai dikerjakan.");
                        setActiveAction("none");
                      }
                    }}
                  >
                    Ingat / Benar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Practice Quiz Micro-App Overlay */}
          {activeAction === "practice-quiz" && actionData.length > 0 && (
            <div className="absolute inset-0 bg-background z-30 p-5 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4 flex-1 flex flex-col justify-start">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="size-4 text-brand-secondary" />
                    <span className="font-heading text-body-xs font-bold text-foreground uppercase tracking-wider">
                      Latihan Kuis ({actionIndex + 1}/{actionData.length})
                    </span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="xs"
                    className="h-7 text-body-xs"
                    onClick={() => setActiveAction("none")}
                  >
                    Batal
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="font-heading text-body-sm font-semibold text-foreground">
                    <MarkdownRenderer content={actionData[actionIndex].prompt} />
                  </div>

                  <ul className="space-y-2 pt-2">
                    {(actionData[actionIndex].options as string[]).map((opt, oIdx) => {
                      const isSelected = actionSelectedAnswer === oIdx;
                      const isCorrect = (actionData[actionIndex].correctIndices as number[]).includes(oIdx);
                      
                      return (
                        <li key={oIdx}>
                          <button
                            type="button"
                            disabled={actionQuizSubmitted}
                            onClick={() => setActionSelectedAnswer(oIdx)}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg border p-3 text-left text-body-xs font-medium transition-colors cursor-pointer",
                              actionQuizSubmitted 
                                ? isCorrect 
                                  ? "border-status-success bg-status-success/10 text-status-success font-bold"
                                  : isSelected 
                                    ? "border-status-error bg-status-error/10 text-status-error"
                                    : "border-border/80 opacity-50"
                                : isSelected 
                                  ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                                  : "border-border/80 bg-background hover:bg-muted/40"
                            )}
                          >
                            <span className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                              isSelected ? "bg-brand-primary text-white" : "bg-muted text-foreground"
                            )}>
                              {String.fromCharCode(65 + oIdx)}
                            </span>
                            <div className="flex-1 text-left leading-normal">
                              <MarkdownRenderer content={opt} />
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {actionQuizSubmitted && (
                  <div className="mt-4 p-3 bg-muted/50 border border-border rounded-xl text-body-xs text-muted-foreground leading-normal max-h-[160px] overflow-y-auto">
                    <span className="font-bold text-brand-primary block mb-1">Penjelasan Tutor:</span>
                    <MarkdownRenderer content={actionData[actionIndex].explanation} />
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <div>
                  {actionQuizSubmitted && (
                    <span className="text-body-xs font-bold flex items-center gap-1">
                      {(actionData[actionIndex].correctIndices as number[]).includes(actionSelectedAnswer!) ? (
                        <span className="text-status-success flex items-center gap-1"><Check className="size-4" /> Jawaban Tepat</span>
                      ) : (
                        <span className="text-status-error flex items-center gap-1"><X className="size-4" /> Belum Tepat</span>
                      )}
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  {!actionQuizSubmitted ? (
                    <Button 
                      disabled={actionSelectedAnswer === null}
                      className="rounded-lg bg-foreground text-background font-semibold"
                      onClick={() => setActionQuizSubmitted(true)}
                    >
                      Periksa
                    </Button>
                  ) : (
                    <Button
                      className="rounded-lg bg-brand-primary text-white font-semibold flex items-center gap-1"
                      onClick={() => {
                        if (actionIndex < actionData.length - 1) {
                          setActionIndex(actionIndex + 1);
                          setActionSelectedAnswer(null);
                          setActionQuizSubmitted(false);
                        } else {
                          toast.success("Latihan kuis cepat selesai.");
                          setActiveAction("none");
                        }
                      }}
                    >
                      <span>Lanjut</span>
                      <ArrowRight className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </aside>
      )}
    </TutorContext.Provider>
  );
}
