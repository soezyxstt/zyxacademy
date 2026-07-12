"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { 
 Sheet, 
 SheetContent, 
 SheetHeader, 
 SheetTitle, 
 SheetDescription 
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
 Sparkles, 
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
} from "lucide-react";
import {
 explainConceptAction,
 analyzeMistakeAction,
  buildStudyPlanAction,
  generatePracticeQuizAction,
  openMaterialAction,
 askTutorRagAction,
 saveTutorMessagesAction,
 loadTutorHistoryAction,
 clearTutorHistoryAction,
} from "@/app/actions/tutor";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { getTutorCapabilities } from "@/lib/tutor-capabilities";
import { useSwipe } from "@/hooks/use-swipe";

// Fetch extra actions from custom action file
import { getFlashcardsForKOAction } from "@/app/actions/tutor-extra";

type TutorMode = "explain" | "mistake" | "study-plan" | "chat" | null;
type ActiveAction = "none" | "flashcards" | "practice-quiz";

interface ChatMessage {
 id: string;
 role: "student" | "ai";
 content: string;
 sources?: Array<{ type: string; id: string; label: string; href: string }>;
}

interface TutorContextType {
 openExplain: (koId: string, initialMode?: "content" | "analogy" | "simplification") => void;
 openMistake: (questionId: string, userAnswer: string) => void;
 openStudyPlan: () => void;
 openChat: () => void;
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

export function TutorProvider({ children }: { children: React.ReactNode }) {
 const pathname = usePathname();
 const courseIdFromPath = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
 const caps = getTutorCapabilities(courseIdFromPath);
 const [isOpen, setIsOpen] = React.useState(false);
 const [activeMode, setActiveMode] = React.useState<TutorMode>(null);
 
 // States to hold variables and results
 const [koId, setKoId] = React.useState<string | null>(null);
 const [questionId, setQuestionId] = React.useState<string | null>(null);
 const [userAnswer, setUserAnswer] = React.useState<string | null>(null);
 const [explainMode, setExplainMode] = React.useState<"content" | "analogy" | "simplification">("content");
 
 // Loader and response data states
 const [loading, setLoading] = React.useState(false);
 const [errors, setErrors] = React.useState<string[]>([]);
 const [data, setData] = React.useState<any>(null);

 // Chat conversation state
 const [messages, setMessages] = React.useState<ChatMessage[]>([]);
 const [inputVal, setInputVal] = React.useState("");
 const [chatLoading, setChatLoading] = React.useState(false);
 const [sessionId, setSessionId] = React.useState<string | null>(null);

 // Ref for auto-scrolling
 const messagesEndRef = React.useRef<HTMLDivElement>(null);
 const savedDataRef = React.useRef<any>(null);

 // Resizable drawer state
 const MIN_WIDTH = 320;
 const MAX_WIDTH = 860;
 const DEFAULT_WIDTH = 560;
 const [drawerWidth, setDrawerWidth] = React.useState(DEFAULT_WIDTH);
 const isResizing = React.useRef(false);

 const startResize = React.useCallback((e: React.MouseEvent) => {
 e.preventDefault();
 isResizing.current = true;
 document.body.style.cursor = "ew-resize";
 document.body.style.userSelect = "none";

 const onMove = (ev: MouseEvent) => {
 if (!isResizing.current) return;
 const newWidth = window.innerWidth - ev.clientX;
 setDrawerWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
 };
 const onUp = () => {
 isResizing.current = false;
 document.body.style.cursor = "";
 document.body.style.userSelect = "";
 window.removeEventListener("mousemove", onMove);
 window.removeEventListener("mouseup", onUp);
 };
 window.addEventListener("mousemove", onMove);
 window.addEventListener("mouseup", onUp);
 }, []);

 // Active micro-app widget inside drawer (e.g. Flashcards or Quiz)
 const [activeAction, setActiveAction] = React.useState<ActiveAction>("none");
 const [actionData, setActionData] = React.useState<any[]>([]);
 const [actionIndex, setActionIndex] = React.useState(0);
 const [actionFlipped, setActionFlipped] = React.useState(false);
 const [actionSelectedAnswer, setActionSelectedAnswer] = React.useState<number | null>(null);
 const [actionQuizSubmitted, setActionQuizSubmitted] = React.useState(false);

 const scrollToBottom = () => {
 messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
 };

 useSwipe({
    onSwipeRight: () => {
      if (isOpen) close();
    }
  });

 React.useEffect(() => {
 scrollToBottom();
 }, [messages, chatLoading]);

 const openChat = React.useCallback(async () => {
 setKoId(null);
 setQuestionId(null);
 setUserAnswer(null);
 setActiveMode("chat");
 setActiveAction("none");
 setIsOpen(true);

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
 content: "Halo! Aku Zyra, asisten belajar buatan Zyx. Tanyain apa aja seputar mata kuliah ini, aku bakal berusaha jawab sesuai konteks materi yang ada ya!",
 }]);
 }
 } catch {
 setMessages([{
 id: "chat-welcome",
 role: "ai",
 content: "Halo! Aku Zyra, asisten belajar buatan Zyx. Tanyain apa aja seputar mata kuliah ini, aku bakal berusaha jawab sesuai konteks materi yang ada ya!",
 }]);
 } finally {
 setLoading(false);
 }
 } else {
 setMessages([{
 id: "chat-welcome",
 role: "ai",
 content: "Halo! Aku Zyra, asisten belajar buatan Zyx. Tanyain apa aja seputar mata kuliah ini, aku bakal berusaha jawab sesuai konteks materi yang ada ya!",
 }]);
 }
 }, [pathname]);

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

 if (activeMode === "chat") return; // chat mode seeds its own welcome message inline
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
 // Content/definition display
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
 newMessages.map(m => ({ role: m.role, content: m.content, sources: m.sources })),
 sessionId
 ).then((res) => {
    if (res.sessionId && !sessionId) {
      setSessionId(res.sessionId);
    }
  }).catch(() => {});
 }
 }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, activeMode, pathname]);

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
 toast.success(`Memuat ${cards.length} kartu hafalan!`);
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
 toast.success("Latihan kuis cepat siap dimulai!");
 } else {
 toast.info("Gagal menemukan latihan kuis. Silakan coba beberapa saat lagi.");
 }
 } catch {
 toast.error("Gagal membuat sesi latihan kuis.");
 } finally {
 setLoading(false);
 }
 };

 // Syllabus Materials redirect Action
  const _handleOpenMaterial = async (chapterId: string, sectionId: string) => {
  try {
  const res = await openMaterialAction(chapterId, sectionId);
  if (res?.redirectUrl) {
  window.location.href = res.redirectUrl;
  }
  } catch {
  toast.error("Gagal membuka halaman buku teks.");
  }
  };

 // Handle sending arbitrary chat messages (Conversational Socratic AI Chat)
 const handleSend = async () => {
 const questionText = inputVal.trim();
 if (!questionText) return;

 const courseId = pathname?.startsWith("/courses/")
 ? pathname.split("/")[2]
 : null;

 const studentMsg = {
 id: `user-msg-${Date.now()}`,
 role: "student" as const,
 content: questionText,
 };

 setInputVal("");
 setMessages((prev) => [...prev, studentMsg]);
 setChatLoading(true);

 let aiMsg: { id: string; role: "ai"; content: string; sources?: Array<{ type: string; id: string; label: string; href: string }> };
 let activeSid = sessionId;

 try {
 const res = await askTutorRagAction(courseId ?? "unknown", null, questionText, sessionId);
 if (res.sessionId && !sessionId) {
    setSessionId(res.sessionId);
    activeSid = res.sessionId;
  }

 let aiContent: string;
 if (res.budgetExhausted) {
 aiContent = "Zyra tidak dapat menjawab pertanyaan baru hari ini (batas harian tercapai). Silakan coba lagi besok, atau gunakan menu buku teks dan kartu hafalan untuk belajar mandiri.";
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

 setMessages((prev) => [...prev, aiMsg!]);

 // Persist the exchange to DB (fire-and-forget, never blocks UI)
 if (courseId) {
 saveTutorMessagesAction(courseId, [
 { role: studentMsg.role, content: studentMsg.content },
 { role: aiMsg!.role, content: aiMsg!.content, sources: aiMsg!.sources },
 ], activeSid).catch(() => {});
 }
 };

 return (
 <TutorContext.Provider value={{ openExplain, openMistake, openStudyPlan, openChat, close, isOpen, activeMode }}>
 {children}

 {/* Global floating Zyra trigger ; available on every course surface
 (overview, quiz, material viewer) regardless of sidebar state. */}
 {pathname?.startsWith("/courses/") &&
 !pathname.includes("/live/host") &&
 !pathname.endsWith("/daftar") &&
 !isOpen && (
 <button
 type="button"
 onClick={openChat}
 aria-label="Tanya Zyra"
 title="Tanya Zyra"
 className="group fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full bg-brand-primary text-white shadow-lg shadow-brand-primary/30 transition-all hover:scale-105 hover:bg-brand-primary/95 active:scale-95 md:bottom-8 md:right-8"
 >
 <Sparkles className="size-6 transition-transform group-hover:rotate-12" />
 <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-body-xs font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 md:block">
 Tanya Zyra
 </span>
 </button>
 )}

 {/* modal={false} keeps the page scrollable; the modal scroll lock sets
 overflow:hidden on body which breaks the sticky course sidebar. */}
 <Sheet open={isOpen} onOpenChange={(open) => !open && close()} modal={false}>
 <SheetContent
 side="right"
 style={{ width: `min(${drawerWidth}px, 100vw)` }}
 className="p-0 flex flex-col h-full bg-background border-l border-border select-none !max-w-none"
 onInteractOutside={(e) => e.preventDefault()}
 onOpenAutoFocus={(e) => e.preventDefault()}
 >
 {/* Drag-to-resize handle */}
 <div
 onMouseDown={startResize}
 className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-transparent hover:bg-brand-primary/30 transition-colors z-50 group"
 title="Seret untuk mengubah ukuran"
 >
 <div className="absolute inset-y-0 left-0 w-px bg-border group-hover:bg-brand-primary/50 transition-colors" />
 </div>
 
 {/* Header Panel */}
 <SheetHeader className="p-5 border-b border-border/80 flex flex-row items-center gap-3 bg-muted/20">
 <div className="flex size-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
 <Sparkles className="size-5 animate-pulse" />
 </div>
 <div className="space-y-0.5 text-left flex-1 min-w-0">
 <SheetTitle className="font-heading text-body-base font-bold text-foreground">
 {activeMode === "explain" && "Penjelasan Konsep"}
 {activeMode === "mistake" && "Analisis Kesalahan Kuis"}
 {activeMode === "study-plan" && "Rencana Studi Mandiri"}
 {activeMode === "chat" && "Tanya Zyra"}
 </SheetTitle>
 <SheetDescription className="text-body-xs text-muted-foreground">
 Zyra · Asisten Belajar Zyx
 </SheetDescription>
 </div>
 {activeMode === "chat" && (
 <Button
 variant="ghost"
 size="xs"
 className="shrink-0 h-7 text-[11px] text-muted-foreground hover:text-status-error hover:bg-status-error/10"
 onClick={async () => {
 const courseId = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
 if (courseId) await clearTutorHistoryAction(courseId, sessionId).catch(() => {});
 setSessionId(null);
 setMessages([{
 id: "chat-welcome",
 role: "ai",
 content: "Halo! Aku Zyra, asisten belajar buatan Zyx. Tanyain apa aja seputar mata kuliah ini, aku bakal berusaha jawab sesuai konteks materi yang ada ya!",
 }]);
 toast.success("Riwayat obrolan dengan Zyra dihapus.");
 }}
 >
 Hapus Riwayat
 </Button>
 )}
 </SheetHeader>

 {/* Body Content Desk */}
 <div className="flex-1 overflow-y-auto p-5 space-y-5 flex flex-col justify-start select-text">
 
 {/* Loading Indicator */}
 {loading && messages.length === 0 && (
 <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
 <Loader2 className="size-8 text-brand-primary animate-spin" />
 <p className="text-body-xs font-semibold text-muted-foreground">Tutor sedang merangkum jawaban...</p>
 </div>
 )}

 {/* Error Display */}
 {!loading && errors.length > 0 && (
 <div className="rounded-2xl border border-status-error/30 bg-status-error/5 p-4 space-y-3 text-left">
 <div className="flex items-center gap-2 text-status-error font-semibold text-body-sm">
 <AlertTriangle className="size-4 shrink-0" />
 Batas Penggunaan Zyra Tercapai
 </div>
 <p className="text-body-xs text-foreground/90 leading-relaxed">
 {errors[0].includes("DAILY_QUOTA_EXCEEDED") 
 ? "Anda telah mencapai batas interaksi harian dengan Zyra. Zyra tersedia kembali besok."
 : errors[0]}
 </p>
 <div className="border-t border-status-error/20 pt-3 text-[11px] text-status-error font-mono">
 <b>Pilihan Belajar Mandiri (Offline Mode):</b>
 <ul className="mt-1.5 list-disc list-inside space-y-1">
 <li>Gunakan menu buku teks / PDF secara mandiri.</li>
 <li>Selesaikan kartu hafalan flashcards di deck utama.</li>
 <li>Diskusi langsung bersama tutor ITB via whatsapp group.</li>
 </ul>
 </div>
 </div>
 )}

 {/* Message Stream */}
 {messages.length > 0 && (
 <div className="space-y-4 flex-1 flex flex-col justify-start">
 {messages.map((msg) => {
 const isStudent = msg.role === "student";
 return (
 <div
 key={msg.id}
 className={cn(
 "max-w-[85%] rounded-2xl p-4 text-body-sm leading-relaxed text-left flex flex-col gap-2",
 isStudent
 ? "bg-primary text-white self-end rounded-tr-none"
 : "bg-muted text-foreground self-start rounded-tl-none border border-border/60"
 )}
 >
 <MarkdownRenderer content={msg.content} className={isStudent ? "text-primary-foreground" : ""} />
 
 {/* Citations / Sources */}
 {!isStudent && msg.sources && msg.sources.length > 0 && (
 <div className="mt-2 pt-2 border-t border-border/50">
 <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Sumber</span>
 <div className="flex flex-wrap gap-1.5">
 {msg.sources.map((src, i) => (
 <a
 key={`${src.id}-${i}`}
 href={src.href}
 className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/40 transition-colors"
 >
 {src.type === "question" ? (
 <FileQuestion className="size-3 text-brand-primary" />
 ) : (
 <BookOpen className="size-3 text-brand-primary" />
 )}
 {src.label}
 </a>
 ))}
 </div>
 </div>
 )}
 </div>
 );
 })}

 {/* Socratic Helper triggers on last message */}
 {caps.microApps && activeMode === "explain" && activeAction === "none" && !chatLoading && (
 <div className="grid grid-cols-2 gap-2 pt-2 self-start w-full">
 <Button 
 variant="outline" 
 className="rounded-lg h-9 text-body-xs"
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
 <Compass className="size-3.5 mr-1" />
 Gunakan Analogi
 </Button>
 <Button 
 variant="outline" 
 className="rounded-lg h-9 text-body-xs"
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
 <RefreshCw className="size-3.5 mr-1" />
 Sederhanakan
 </Button>
 </div>
 )}

 {/* Socratic Practice Actions */}
 {caps.microApps && activeMode === "explain" && activeAction === "none" && !chatLoading && (
 <div className="pt-4 border-t border-border space-y-2 w-full">
 <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">Latihan Pembelajaran:</span>
 <div className="flex flex-col gap-2">
 <Button 
 className="w-full rounded-lg bg-brand-primary hover:bg-brand-primary/95 text-white"
 onClick={() => handleLaunchFlashcards(koId!)}
 >
 <Layers className="size-4 mr-2" />
 Latihan Kartu Hafalan (Flashcard)
 </Button>
 <Button 
 variant="outline" 
 className="w-full rounded-lg"
 onClick={() => handleLaunchPracticeQuiz(koId!)}
 >
 <ClipboardList className="size-4 mr-2 text-brand-secondary" />
 Coba Latihan Kuis Cepat (3 Soal)
 </Button>
 </div>
 </div>
 )}

 {/* Typing Indicator */}
 {chatLoading && (
 <div className="flex w-fit items-center gap-1 rounded-2xl bg-muted border border-border/65 px-4 py-3 self-start rounded-tl-none">
 {[0, 1, 2].map((dot) => (
 <span
 key={dot}
 className="size-1.5 rounded-full bg-muted-foreground animate-bounce"
 style={{ animationDelay: `${dot * 150}ms` }}
 />
 ))}
 </div>
 )}
 
 <div ref={messagesEndRef} />
 </div>
 )}
 </div>

 {/* Chat Input Bar */}
 {messages.length > 0 && activeAction === "none" && (
 <div className="p-4 border-t border-border/80 bg-background flex gap-2 shrink-0 select-text">
 <Input
 placeholder="Tanyakan follow-up..."
 value={inputVal}
 onChange={(e) => setInputVal(e.target.value)}
 onKeyDown={(e) => e.key === "Enter" && handleSend()}
 disabled={chatLoading}
 className="rounded-xl focus-visible:ring-brand-primary"
 />
 <Button
 onClick={handleSend}
 disabled={chatLoading || !inputVal.trim()}
 className="rounded-xl bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold"
 >
 Kirim
 </Button>
 </div>
 )}

 {/* Micro-App Widget View overlay inside Drawer */}
 {activeAction === "flashcards" && actionData.length > 0 && (
 <div className="absolute inset-0 bg-background z-30 p-5 flex flex-col justify-between">
 <div className="space-y-4 flex-1 flex flex-col justify-start">
 <div className="flex items-center justify-between">
 <span className="text-[10px] font-mono font-bold text-brand-primary uppercase">Flashcards Hafalan ({actionIndex + 1}/{actionData.length})</span>
 <Button 
 variant="ghost" 
 size="xs"
 className="h-7 text-body-2xs"
 onClick={() => setActiveAction("none")}
 >
 Tutup Latihan
 </Button>
 </div>

 {/* Flip card box */}
 <div 
 onClick={() => setActionFlipped(!actionFlipped)}
 className={cn(
 "flex-1 min-h-[220px] max-h-[300px] border rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 shadow-md",
 actionFlipped 
 ? "bg-brand-primary/5 border-brand-primary/40 ring-1 ring-brand-primary/10" 
 : "bg-card border-border hover:border-brand-primary/30"
 )}
 >
 <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest block mb-4 select-none">
 {actionFlipped ? "KUNCI JAWABAN (BELAKANG)" : "PERTANYAAN (DEPAN)"}
 </span>
 
 <div className="text-body-base font-medium leading-relaxed font-sans max-w-xs text-foreground">
 <MarkdownRenderer content={actionFlipped ? actionData[actionIndex].back : actionData[actionIndex].front} />
 </div>

 <span className="text-[9px] text-muted-foreground/60 select-none mt-8 italic">Klik kartu untuk membalikkan</span>
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
 toast.success("Kartu hafalan selesai dikerjakan!");
 setActiveAction("none");
 }
 }}
 >
 Lupa / Salah
 </Button>
 <Button 
 className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
 onClick={() => {
 setActionFlipped(false);
 if (actionIndex < actionData.length - 1) {
 setActionIndex(actionIndex + 1);
 } else {
 toast.success("Hebat! Kartu hafalan selesai dikerjakan!");
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

 {activeAction === "practice-quiz" && actionData.length > 0 && (
 <div className="absolute inset-0 bg-background z-30 p-5 flex flex-col justify-between">
 <div className="space-y-4 flex-1 flex flex-col justify-start">
 <div className="flex items-center justify-between">
 <span className="text-[10px] font-mono font-bold text-brand-secondary uppercase">LATIHAN KUIS ({actionIndex + 1}/{actionData.length})</span>
 <Button 
 variant="ghost" 
 size="xs"
 className="h-7 text-body-2xs"
 onClick={() => setActiveAction("none")}
 >
 Batal
 </Button>
 </div>

 <div className="space-y-3">
 <div className="font-heading text-body-sm font-semibold text-foreground">
 <MarkdownRenderer content={actionData[actionIndex].prompt} />
 </div>

 {/* Options buttons */}
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
 "flex w-full items-center gap-2 rounded-lg border p-3 text-left text-body-xs font-medium transition-colors cursor-pointer",
 actionQuizSubmitted 
 ? isCorrect 
 ? "border-status-success bg-status-success/10 text-status-success font-bold"
 : isSelected 
 ? "border-status-error bg-status-error/10 text-status-error"
 : "border-border/80 opacity-55"
 : isSelected 
 ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
 : "border-border/80 bg-background hover:bg-muted/30"
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
 <div className="mt-4 p-3 bg-muted/40 border border-border rounded-xl text-body-2xs text-muted-foreground leading-normal max-h-[140px] overflow-y-auto">
 <span className="font-bold text-brand-primary block mb-0.5">Penjelasan Tutor:</span>
 <MarkdownRenderer content={actionData[actionIndex].explanation} />
 </div>
 )}
 </div>

 <div className="pt-4 border-t border-border flex items-center justify-between">
 <div>
 {actionQuizSubmitted && (
 <span className="text-body-xs font-bold flex items-center gap-1">
 {(actionData[actionIndex].correctIndices as number[]).includes(actionSelectedAnswer!) ? (
 <span className="text-emerald-600 flex items-center gap-0.5"><Check className="size-4" /> Jawaban Tepat!</span>
 ) : (
 <span className="text-rose-600 flex items-center gap-0.5"><X className="size-4" /> Belum Tepat</span>
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
 toast.success("Latihan kuis cepat selesai!");
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
 </SheetContent>
 </Sheet>
 </TutorContext.Provider>
 );
}
