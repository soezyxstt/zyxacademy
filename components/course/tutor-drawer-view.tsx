"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Followup } from "@/lib/zyra/followups";
import {
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
  HelpCircle,
  Paperclip,
  Plus,
  ArrowUp,
  ChevronDown,
  Quote,
} from "lucide-react";
import type { ZyraQuotedContext } from "./tutor-drawer";
import {
  explainConceptAction,
  analyzeMistakeAction,
  buildStudyPlanAction,
  saveTutorMessagesAction,
  loadTutorHistoryAction,
  clearTutorHistoryAction,
  getTutorCourseContextAction,
  listTutorSessionsAction,
} from "@/app/actions/tutor";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import {
  ArticleParts,
  ProductLearningVisual,
  ProductWorkedExample,
  type PublicVisualSpec,
  type PublicWorkedExamplePayload,
} from "@/components/course/article-parts";
import type { ArticlePart } from "@/lib/materials/article-parts";
import { MathText } from "@/components/course/math-text";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { clampTutorPanelWidth, DEFAULT_TUTOR_PANEL_WIDTH, MAX_TUTOR_PANEL_WIDTH, MIN_TUTOR_PANEL_WIDTH } from "@/lib/tutor-panel-layout";
import { normalizeTutorMathMarkdown } from "@/lib/tutor/math-markdown";
import { sanitizeAnswer } from "@/lib/tutor/answer-sanitizer";
import { getTutorCapabilities } from "@/lib/tutor-capabilities";
import {
  ZyraAttachmentComposer,
  type ZyraAttachmentComposerHandle,
} from "@/components/course/zyra-attachment-composer";
import { ZyraAllowanceSummary } from "@/components/course/zyra-allowance-summary";
import { ZyraMathPalette } from "@/components/course/zyra-math-palette";
import { ZyraComposerInput, type ZyraComposerInputHandle } from "@/components/course/zyra-composer-input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPlaygroundBridge, subscribePlaygroundBridge } from "@/components/coding/playground-bridge";
import { PythonPresets, pythonPresets, type PythonPreset } from "@/components/coding/python-presets";
import { pythonReply } from "@/lib/coding/python-reply";
import { composerMathRanges } from "@/components/course/zyra-composer-math";
import { LearningCanvasRenderer } from "@/components/course/learning-canvas/learning-canvas-renderer";
import type { CanvasSpec } from "@/lib/zyra/canvas";
import { zyraImageFilesFromClipboard } from "@/lib/zyra/images/composer";
import type { ZyraMessageAttachment } from "@/lib/zyra/images/contracts";
import { ZyraMessageAttachments } from "@/components/course/zyra-message-attachments";
import { consumeZyraStream } from "@/lib/zyra/stream-consumer";
import {
  createZyraResponseLanguageState,
  withZyraResponseLanguage,
  zyraInterfaceLocaleChanged,
  zyraResponseLanguageConversationChanged,
  zyraResponseLanguageResolved,
} from "@/lib/zyra/chat-language-contract";
import { useTranslations } from "@/lib/i18n/client";
import { useAppLocale } from "@/lib/i18n/client";
import { useSession } from "@/lib/auth-client";

export type TutorMode = "explain" | "mistake" | "study-plan" | "chat" | null;
type ActiveAction = "none" | "flashcards" | "practice-quiz";

interface ChatMessage {
  id: string;
  role: "student" | "ai";
  content: string;
  followups?: Followup[];
  quotedContext?: ZyraQuotedContext | null;
  sources?: Array<{ type: string; id: string; label: string; href: string }>;
  canvasSpec?: CanvasSpec | null;
  attachments?: ZyraMessageAttachment[];
  sessionId?: string | null;
  parts?: ArticlePart[];
  visuals?: PublicVisualSpec[];
  workedExample?: PublicWorkedExamplePayload | null;
  isError?: boolean;
  persisted?: boolean;
  pendingPython?: { code: string; apply: (code: string, force?: boolean) => string };
  pythonStatus?: string;
  failedPayload?: {
    question: string;
    quotedContext?: ZyraQuotedContext | null;
    intent: PythonPreset["intent"] | "hint" | "generate";
    attachmentIds: string[];
    attachments: ZyraMessageAttachment[];
    courseId: string | null;
    sessionId: string | null;
    conversationEpoch: number;
  };
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

function formatSessionDate(isoString: string, locale: "id" | "en", labels: { justNow: string; minutes: string; hours: string; days: string }): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return labels.justNow;
    if (diffMins < 60) return labels.minutes.replace("{count}", String(diffMins));
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return labels.hours.replace("{count}", String(diffHours));
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return labels.days.replace("{count}", String(diffDays));
    return date.toLocaleDateString(locale === "en" ? "en-US" : "id-ID", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function FollowUpChipIcon({ name }: { name: "example" | "help" | "compass" | "refresh" | "arrow" }) {
  if (name === "example") return <FileQuestion className="size-3 text-brand-primary" />;
  if (name === "compass") return <Compass className="size-3 text-brand-primary" />;
  if (name === "refresh") return <RefreshCw className="size-3 text-brand-secondary" />;
  if (name === "arrow") return <ArrowRight className="size-3 text-brand-secondary" />;
  return <HelpCircle className="size-3 text-brand-secondary" />;
}

function FollowUpChips({ followups, disabled, onSend }: {
  followups: Followup[];
  disabled: boolean;
  onSend: (followup: Followup) => void;
}) {
  const t = useTranslations("studentCourse");
  return (
    <TooltipProvider>
    <div className="mt-2 flex flex-wrap items-center gap-1" aria-label={t("tutorDrawer.followUpActions")}>
      {followups.map((chip, index) => (
        <Tooltip key={`${chip.label}-${index}`}>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={disabled}
              onClick={() => onSend(chip)} className="h-auto max-w-full whitespace-normal px-2 py-1 text-left">
              <FollowUpChipIcon name={chip.icon} />
              <span className="break-words">{chip.label}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{chip.prompt}</TooltipContent>
        </Tooltip>
      ))}
    </div>
    </TooltipProvider>
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
  quotedContext?: ZyraQuotedContext | null;
  onClearQuotedContext?: () => void;
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
  quotedContext,
  onClearQuotedContext,
}: TutorDrawerViewProps) {
  const t = useTranslations("studentCourse");
  const { locale } = useAppLocale();
  const { data: authSession } = useSession();
  const accountId = authSession?.user?.id ?? null;
  const [conversationKey, setConversationKey] = React.useState("draft:0");
  const conversationKeyRef = React.useRef(conversationKey);
  const draftSequenceRef = React.useRef(0);
  const conversationEpochRef = React.useRef(0);
  const hasStartedConversationRef = React.useRef(false);
  const responseLanguageByConversationRef = React.useRef(new Map<string, "id" | "en">());
  const [responseLanguageState, setResponseLanguageState] = React.useState(() =>
    createZyraResponseLanguageState(locale, conversationKey),
  );
  const responseLanguageStateRef = React.useRef(responseLanguageState);
  const conversationScopeRef = React.useRef<string | null>(null);
  const localeEpochRef = React.useRef(0);
  React.useEffect(() => {
    localeEpochRef.current += 1;
    responseLanguageByConversationRef.current.clear();
    const nextState = zyraInterfaceLocaleChanged(responseLanguageStateRef.current, locale);
    responseLanguageStateRef.current = nextState;
    setResponseLanguageState(nextState);
  }, [locale]);
  const pathname = usePathname();
  const registeredBridge = React.useSyncExternalStore(subscribePlaygroundBridge, getPlaygroundBridge, () => null);
  const codingBridge = pathname?.startsWith("/courses/") && pathname.split("/")[2] !== registeredBridge?.courseId ? null : registeredBridge;
  const [assistantMode, setAssistantMode] = React.useState<"python" | "tutor">(() => codingBridge ? "python" : "tutor");
  React.useEffect(() => { setAssistantMode(codingBridge ? "python" : "tutor"); }, [codingBridge]);
  const courseIdFromPath = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : codingBridge?.courseId ?? null;
  const conversationScope = `${accountId ?? "anonymous"}:${courseIdFromPath ?? "none"}`;
  const conversationKeyForSession = React.useCallback(
    (id: string) => `session:${conversationScope}:${id}`,
    [conversationScope],
  );
  const caps = getTutorCapabilities(courseIdFromPath);
  const [zyraAccessTier, setZyraAccessTier] = React.useState<"free" | "standard" | null>(null);
  // Allow existing standard modes unless the server has explicitly identified
  // this actor as Free. A temporary allowance-summary failure must not hide
  // standard functionality for the rest of the drawer session.
  const advancedModesEnabled = zyraAccessTier !== "free";
  const imageInputEnabled = caps.imageInput && activeMode === "chat" && advancedModesEnabled;
  const _hasExplainCapability = advancedModesEnabled && caps.explain;

  React.useEffect(() => {
    setZyraAccessTier(null);
  }, [courseIdFromPath]);

  // Loading and response states
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [data, setData] = React.useState<any>(null);

  // Chat state
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "chat-welcome",
      role: "ai",
      content: t("tutorDrawer.welcome"),
    },
  ]);
  const [inputVal, setInputVal] = React.useState("");
  const [activeQuotedContext, setActiveQuotedContext] = React.useState<ZyraQuotedContext | null>(quotedContext ?? null);

  React.useEffect(() => {
    if (quotedContext) {
      if (quotedContext.blockType === "code" && codingBridge) setAssistantMode("python");
      setActiveQuotedContext(quotedContext);
    }
  }, [quotedContext, codingBridge]);

  const [chatLoading, setChatLoading] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [attachmentIds, setAttachmentIds] = React.useState<string[]>([]);
  const [readyAttachments, setReadyAttachments] = React.useState<ZyraMessageAttachment[]>([]);
  const [attachmentComposerKey, setAttachmentComposerKey] = React.useState(0);
  const [attachmentsReady, setAttachmentsReady] = React.useState(true);

  const resetComposerAttachments = React.useCallback(() => {
    setAttachmentIds([]);
    setReadyAttachments([]);
    setAttachmentsReady(true);
    setAttachmentComposerKey((value) => value + 1);
  }, []);
  const [copiedMessageId, setCopiedMessageId] = React.useState<string | null>(null);

  // Chat sessions history
  interface ChatSessionSummary {
    id: string;
    title: string;
    lastMessageAt: string | null;
    messageCount: number;
  }
  const [sessions, setSessions] = React.useState<ChatSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = React.useState(false);

  const loadSessions = React.useCallback(async () => {
    const courseId = courseIdFromPath;
    if (!courseId) return;
    setSessionsLoading(true);
    try {
      const list = await listTutorSessionsAction(courseId);
      setSessions(list);
    } catch {
      // silent
    } finally {
      setSessionsLoading(false);
    }
  }, [courseIdFromPath]);

  const attachmentComposerRef = React.useRef<ZyraAttachmentComposerHandle>(null);
  const textareaRef = React.useRef<ZyraComposerInputHandle>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const savedDataRef = React.useRef<any>(null);

  const panelRef = React.useRef<HTMLElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const rememberConversationOverride = React.useCallback((key: string, override: "id" | "en" | null) => {
    const remembered = responseLanguageByConversationRef.current;
    if (!override) {
      remembered.delete(key);
      return;
    }
    remembered.delete(key);
    remembered.set(key, override);
    while (remembered.size > 32) {
      const oldestKey = remembered.keys().next().value;
      if (!oldestKey) break;
      remembered.delete(oldestKey);
    }
  }, []);

  const updateResponseLanguageState = React.useCallback((
    update: (current: typeof responseLanguageState) => typeof responseLanguageState,
  ) => {
    const nextState = update(responseLanguageStateRef.current);
    responseLanguageStateRef.current = nextState;
    rememberConversationOverride(nextState.conversationKey, nextState.stickyOverride);
    setResponseLanguageState(nextState);
  }, [rememberConversationOverride]);

  const invalidateConversationRequests = React.useCallback(() => {
    conversationEpochRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setChatLoading(false);
  }, []);

  const activateConversation = React.useCallback((
    nextKey: string,
    options: { invalidate?: boolean; preserveCurrentOverride?: boolean } = {},
  ) => {
    const currentKey = conversationKeyRef.current;
    if (currentKey === nextKey) return;
    if (options.invalidate !== false) invalidateConversationRequests();
    const currentState = responseLanguageStateRef.current;
    if (options.preserveCurrentOverride && currentState.stickyOverride) {
      rememberConversationOverride(currentKey, currentState.stickyOverride);
      rememberConversationOverride(nextKey, currentState.stickyOverride);
    }
    const rememberedOverride = responseLanguageByConversationRef.current.get(nextKey) ?? null;
    const nextState = zyraResponseLanguageConversationChanged(currentState, nextKey, rememberedOverride);
    conversationKeyRef.current = nextKey;
    responseLanguageStateRef.current = nextState;
    setConversationKey(nextKey);
    setResponseLanguageState(nextState);
  }, [invalidateConversationRequests, rememberConversationOverride]);

  const startNewConversation = React.useCallback(() => {
    draftSequenceRef.current += 1;
    hasStartedConversationRef.current = true;
    activateConversation(`draft:${draftSequenceRef.current}`);
  }, [activateConversation]);

  React.useEffect(() => {
    if (conversationScopeRef.current === null) {
      conversationScopeRef.current = conversationScope;
      return;
    }
    if (conversationScopeRef.current === conversationScope) return;
    conversationScopeRef.current = conversationScope;
    responseLanguageByConversationRef.current.clear();
    hasStartedConversationRef.current = false;
    draftSequenceRef.current += 1;
    activateConversation(`draft:${draftSequenceRef.current}`);
    setSessionId(null);
    resetComposerAttachments();
    setMessages([{ id: "chat-welcome", role: "ai", content: t("tutorDrawer.welcome") }]);
  }, [activateConversation, conversationScope, resetComposerAttachments, t]);

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

  // Load sessions whenever menu is opened
  React.useEffect(() => {
    if (showMenu) {
      loadSessions();
    }
  }, [showMenu, loadSessions]);

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
  const [actionData] = React.useState<any[]>([]);
  const [actionIndex, setActionIndex] = React.useState(0);
  const [actionFlipped, setActionFlipped] = React.useState(false);
  const [actionSelectedAnswer, setActionSelectedAnswer] = React.useState<number | null>(null);

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
      return data?.title ? t("tutorDrawer.conceptTitle", { title: data.title }) : t("tutorDrawer.explainTitle");
    }
    if (activeMode === "mistake") {
      return t("tutorDrawer.mistakeTitle");
    }
    if (activeMode === "study-plan") {
      return t("tutorDrawer.studyPlanTitle");
    }
    const currentSession = sessions.find((s) => s.id === sessionId);
    if (currentSession?.title && currentSession.title !== "General Chat") {
      return currentSession.title;
    }
    const firstStudent = messages.find((m) => m.role === "student");
    if (firstStudent?.content) {
      return firstStudent.content;
    }
    return courseLabel || t("tutorDrawer.askZyra");
  }, [activeMode, data, messages, courseLabel, sessions, sessionId, t]);

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

  // Load chat history smoothly in background when in chat mode (non-blocking)
  React.useEffect(() => {
    if (activeMode !== "chat") return;
    const courseId = courseIdFromPath;
    const initialEpoch = conversationEpochRef.current;
    let active = true;

    if (courseId) {
      loadTutorHistoryAction(courseId)
        .then((result) => {
          if (
            !active ||
            hasStartedConversationRef.current ||
            initialEpoch !== conversationEpochRef.current ||
            !conversationKeyRef.current.startsWith("draft:")
          ) return;
          hasStartedConversationRef.current = true;
          if (result.sessionId) {
            activateConversation(conversationKeyForSession(result.sessionId), { invalidate: false });
          }
          setSessionId(result.sessionId);
          if (result.messages.length > 0) {
            setMessages(result.messages);
          }
        })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [activeMode, courseIdFromPath, activateConversation, conversationKeyForSession]);

  // Handle initial question if passed
  React.useEffect(() => {
    if (initialQuestion) {
      setInputVal(initialQuestion);
      onClearInitialQuestion?.();
      if (!quotedContext) setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [initialQuestion, onClearInitialQuestion, quotedContext]);

  // Escape key to close
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
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
            setErrors([t("tutorDrawer.actionFailed")]);
          }
        } else if (activeMode === "mistake" && questionId && userAnswer) {
          const res = await analyzeMistakeAction(questionId, userAnswer);
          if (res.success) {
            setData(res.data);
          } else {
            setErrors([t("tutorDrawer.actionFailed")]);
          }
        } else if (activeMode === "study-plan") {
          const res = await buildStudyPlanAction();
          setData(res.plan);
        }
      } catch {
        setErrors([t("tutorDrawer.internalError")]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [activeMode, koId, questionId, userAnswer, explainMode, advancedModesEnabled, t]);

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

    const courseId = courseIdFromPath;
    let newMessages: ChatMessage[] = [];

    if (activeMode === "explain") {
      const conceptTitle = safeText(data.title, "");
      newMessages = [
        {
          id: `initial-q-${Date.now()}`,
          role: "student",
          content: conceptTitle
            ? `Jelaskan konsep: ${conceptTitle}`
            : t("tutorDrawer.explainPrompt"),
        },
        {
          id: `initial-a-${Date.now()}`,
          role: "ai",
          content: safeText(data.content, t("tutorDrawer.conceptUnavailable")),
          sources: data.sources || [],
          parts: Array.isArray(data.parts) ? data.parts : undefined,
          visuals: Array.isArray(data.visuals) ? data.visuals : undefined,
          workedExample: data.workedExample ?? null,
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
          content: `### ${t("tutorDrawer.misconceptionHeading")}:\n${safeText(data.detectedMisconception, t("tutorDrawer.noMisconception"))}\n\n### ${t("tutorDrawer.calculationErrorHeading")}:\n${safeText(data.mathematicalError, t("tutorDrawer.noCalculationError"))}\n\n### ${t("tutorDrawer.socraticHeading")}:\n${safeText(data.socraticGuidance, t("tutorDrawer.socraticFallback"))}`,
        }
      ];
    } else if (activeMode === "study-plan") {
      const planSteps = Array.isArray(data) ? data : [];
      newMessages = [
        {
          id: `initial-q-${Date.now()}`,
          role: "student",
          content: t("tutorDrawer.studyPlanPrompt"),
        },
        {
          id: `initial-a-${Date.now()}`,
          role: "ai",
          content: planSteps.length > 0
            ? planSteps.map((s: any, idx: number) => `**${t("tutorDrawer.stepNumber", { number: idx + 1 })}: ${s.title || t("tutorDrawer.learn")}**\n${s.description || ""}`).join("\n\n")
            : t("tutorDrawer.planPreparing"),
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
  }, [data, activeMode, courseIdFromPath, sessionId, advancedModesEnabled, zyraAccessTier, t]);

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

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setChatLoading(false);
      toast.info(t("tutorDrawer.responseStopped"));
    }
  };

  const handleComposerSessionCreated = React.useCallback(
    (createdSessionId: string) => {
      hasStartedConversationRef.current = true;
      activateConversation(conversationKeyForSession(createdSessionId), {
        invalidate: false,
        preserveCurrentOverride: true,
      });
      setSessionId(createdSessionId);
      void loadSessions();
    },
    [activateConversation, conversationKeyForSession, loadSessions],
  );

  const handlePaste = React.useCallback(
    (e: React.ClipboardEvent<HTMLElement>) => {
      if (e.defaultPrevented || !imageInputEnabled || !courseIdFromPath || chatLoading) return;
      const files = zyraImageFilesFromClipboard(
        e.clipboardData?.items ?? null,
        e.clipboardData?.files ?? null,
      );
      if (files.length === 0) return;
      e.preventDefault();
      void attachmentComposerRef.current?.addFiles(files);
    },
    [imageInputEnabled, courseIdFromPath, chatLoading],
  );

  // Handle sending arbitrary chat messages with SSE streaming
  const handleSend = async (suggestedQuestion?: string, overrideQuote?: ZyraQuotedContext | null, presetIntent?: PythonPreset["intent"] | "hint" | "generate", retry?: NonNullable<ChatMessage["failedPayload"]>) => {
    if (chatLoading || abortControllerRef.current) return;
    if (retry && (retry.courseId !== courseIdFromPath || retry.conversationEpoch !== conversationEpochRef.current || (retry.sessionId !== null && retry.sessionId !== sessionId))) return;
    const codingRequest = codingBridge?.capture();
    const isCodeQuote = (overrideQuote !== undefined ? overrideQuote : activeQuotedContext)?.blockType === "code";
    const intent = retry?.intent ?? (isCodeQuote ? "review" : presetIntent ?? (assistantMode === "python" ? "review" : "hint"));
    const pythonRequest = intent === "generate" ? codingRequest : null;
    const rawQuestion = (suggestedQuestion ?? inputVal).trim();
    const effectiveQuote = overrideQuote !== undefined ? overrideQuote : activeQuotedContext;
    const requestedAttachmentIds = [...(retry?.attachmentIds ?? attachmentIds)];
    const requestedAttachments = (retry?.attachments ?? readyAttachments).map((attachment) => ({ ...attachment }));
    if (!rawQuestion && !effectiveQuote && requestedAttachmentIds.length === 0) return;
    if (!retry && !attachmentsReady) return;
    const fallbackQuestion = effectiveQuote
      ? t("tutorDrawer.explainPrompt")
      : requestedAttachmentIds.length > 0
        ? "Bantu jelaskan gambar ini."
        : "";
    const question = normalizeTutorMathMarkdown(rawQuestion || fallbackQuestion);
    const displayStudentQuestion = rawQuestion ? normalizeTutorMathMarkdown(rawQuestion) : "";

    if (zyraAccessTier === "free" && requestedAttachmentIds.length > 0) {
      toast.error(t("tutorDrawer.freeTextOnly") || "Paket Free hanya mendukung pertanyaan teks.");
      return;
    }
    hasStartedConversationRef.current = true;
    if (activeMode !== "chat") setActiveMode("chat");

    const studentMsg: ChatMessage = {
      persisted: false,
      id: `msg-${Date.now()}`,
      role: "student",
      content: displayStudentQuestion,
      quotedContext: effectiveQuote,
      attachments: requestedAttachments.length > 0 ? requestedAttachments : undefined,
      sessionId,
    };

    setMessages((prev) => [...prev.map((message) => ({ ...message, followups: undefined })), studentMsg]);
    if (!retry) {
      setInputVal("");
      setActiveQuotedContext(null);
      onClearQuotedContext?.();
      resetComposerAttachments();
    }
    setChatLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const courseId = courseIdFromPath ?? undefined;

    const aiMsgId = `msg-ai-${Date.now()}`;
    const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `zyra-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let activeSid = sessionId;
    const failureSnapshot = () => ({ question: rawQuestion, quotedContext: effectiveQuote, intent, attachmentIds: requestedAttachmentIds, attachments: requestedAttachments, courseId: courseIdFromPath, sessionId: activeSid, conversationEpoch: requestConversationEpoch });
    const requestConversationKey = conversationKeyRef.current;
    const requestConversationEpoch = conversationEpochRef.current;
    const requestLocaleEpoch = localeEpochRef.current;
    const languageRequestBase = {
      question,
      ...(codingRequest ? { codingContext: { ...codingRequest.context, intent } } : {}),
      courseId: courseId ?? "unknown",
      conceptId: koId || undefined,
      sessionId: activeSid || undefined,
      attachmentIds: requestedAttachmentIds,
      pathname,
      requestId,
      selectionContext: effectiveQuote ? {
        snippet: effectiveQuote.snippet,
        blockType: effectiveQuote.blockType,
        surroundingText: effectiveQuote.surroundingText,
        sectionTitle: effectiveQuote.sectionTitle,
        chapterTitle: effectiveQuote.title,
        intent: effectiveQuote.intent,
      } : undefined,
    };
    let accumulatedContent = "";
    let finalSources: any = undefined;
    let finalCanvasSpec: CanvasSpec | null = null;
    let hasError = false;
    let completed = false;

    setMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: "ai", content: "", persisted: false },
    ]);

    try {
      const response = await fetch("/api/zyra/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withZyraResponseLanguage(
          languageRequestBase,
          responseLanguageStateRef.current,
          locale,
          requestConversationKey,
        )),
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
          if (part.type === "done") { completed = true; }
          else if (part.type === "text-delta" && part.textDelta) {
            accumulatedContent += part.textDelta;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? { ...m, content: pythonRequest ? pythonReply(accumulatedContent).explanation : accumulatedContent } : m
              )
            );
          } else if (part.type === "chunk" && part.text) {
            accumulatedContent += part.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? { ...m, content: pythonRequest ? pythonReply(accumulatedContent).explanation : accumulatedContent } : m
              )
            );
          } else if (part.type === "data-response-language") {
            if (
              requestLocaleEpoch === localeEpochRef.current &&
              requestConversationEpoch === conversationEpochRef.current &&
              requestConversationKey === conversationKeyRef.current
            ) {
              updateResponseLanguageState((current) => zyraResponseLanguageResolved(current, part.responseLanguage));
            }
          } else if (part.type === "data-followups") {
            if (requestConversationEpoch !== conversationEpochRef.current || abortController.signal.aborted) continue;
            setMessages((prev) => prev.map((m) => m.id === aiMsgId ? { ...m, followups: part.followups } : m));
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
          } else if (part.type === "data-history") {
            if (requestConversationEpoch !== conversationEpochRef.current) continue;
            if (part.saved) {
              setMessages((prev) => prev.map((m) => m.id === studentMsg.id || m.id === aiMsgId ? { ...m, persisted: true } : m));
              void loadSessions();
            } else if (part.message) {
              toast.error(part.message);
            }
          } else if (part.type === "data-session" && part.sessionId) {
            if (
              requestConversationEpoch !== conversationEpochRef.current ||
              requestConversationKey !== conversationKeyRef.current
            ) continue;
            activeSid = part.sessionId;
            activateConversation(conversationKeyForSession(part.sessionId), { invalidate: false, preserveCurrentOverride: true });
            setSessionId(part.sessionId);
            void loadSessions();
          } else if (part.type === "data-error" && part.data?.message) {
            hasError = true;
            accumulatedContent = t("tutorDrawer.responseError", { message: part.data.message });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? {
                  ...m,
                  content: accumulatedContent,
                  isError: true,
                  failedPayload: failureSnapshot(),
                } : m
              )
            );
          }
        }
      }
    } catch (err: unknown) {
      hasError = true;
      if (abortController.signal.aborted) {
        accumulatedContent = accumulatedContent || t("tutorDrawer.responseStopped");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: pythonRequest ? pythonReply(accumulatedContent).explanation : accumulatedContent, followups: undefined, isError: true, failedPayload: failureSnapshot() } : m
          )
        );
      } else {
        console.error("Zyra response processing failed:", err);
        accumulatedContent = t("tutorDrawer.responseProcessingError");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? {
              ...m,
              content: accumulatedContent,
              isError: true,
              failedPayload: failureSnapshot(),
            } : m
          )
        );
      }
    } finally {
      if (requestConversationEpoch === conversationEpochRef.current) {
        setChatLoading(false);
        if (abortControllerRef.current === abortController) abortControllerRef.current = null;
      }
    }

    if (!completed && !hasError && !abortController.signal.aborted && requestConversationEpoch === conversationEpochRef.current) {
      hasError = true;
      setMessages((prev) => prev.map((m) => m.id === aiMsgId ? {
        ...m, content: t("tutorDrawer.responseProcessingError"), isError: true,
        failedPayload: failureSnapshot(),
      } : m));
    }
    if (pythonRequest && completed && !hasError && !abortController.signal.aborted && requestConversationEpoch === conversationEpochRef.current) {
      const result = pythonReply(accumulatedContent);
      const applied = result.code ? pythonRequest.apply(result.code) : "invalid";
      const pythonStatus = !result.code && result.explanation ? undefined : applied === "applied" ? "Kode diterapkan ke editor." : applied === "changed" ? "Editor berubah saat Zyra menjawab. Terapkan hasil untuk mengganti kode terbaru." : applied === "inactive" ? "Buka Playground asal untuk meminta kode lagi." : "Program lengkap belum tersedia. Coba lagi atau gunakan mode Tutor untuk pembahasan.";
      setMessages((prev) => prev.map((m) => m.id === aiMsgId ? {
        ...m, content: result.explanation, pythonStatus,
        pendingPython: applied === "changed" && result.code ? { code: result.code, apply: pythonRequest.apply } : undefined,
      } : m));
      accumulatedContent = [result.explanation, pythonStatus].filter(Boolean).join("\n\n");
    }

    if (
      courseId &&
      accumulatedContent &&
      !codingRequest &&
      !hasError &&
      requestConversationEpoch === conversationEpochRef.current
    ) {
      saveTutorMessagesAction(courseId, [
        { role: studentMsg.role, content: studentMsg.content || question, attachmentIds: requestedAttachmentIds },
        { role: "ai", content: accumulatedContent, sources: finalSources, canvasSpec: finalCanvasSpec },
      ], activeSid).then(() => {
        setMessages((prev) => prev.map((m) => m.id === studentMsg.id || m.id === aiMsgId ? { ...m, persisted: true } : m));
        return loadSessions();
      }).catch(() => toast.error(locale === "en"
        ? "This answer could not be saved. Copy anything you need before closing this conversation."
        : "Jawaban ini belum tersimpan. Salin bagian yang diperlukan sebelum menutup percakapan."));
    }
  };

  React.useEffect(() => {
    const preset = pythonPresets.find(item => item.message === initialQuestion);
    if (!isOpen || !codingBridge || !preset) return;
    setAssistantMode("python");
    void handleSend(preset.message, null, preset.intent);
    // Initial preset requests are consumed once, like initialQuestion above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, isOpen]);

  const handleRetry = (payload: NonNullable<ChatMessage["failedPayload"]>) => {
    void handleSend(payload.question, payload.quotedContext, payload.intent, payload);
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    toast.success(t("tutorDrawer.copied"));
    setTimeout(() => {
      setCopiedMessageId(null);
    }, 2000);
  };

  const handleSelectSession = React.useCallback(async (targetSessionId: string) => {
    if (targetSessionId === sessionId) {
      setShowMenu(false);
      return;
    }
    const courseId = courseIdFromPath;
    if (!courseId) return;
    hasStartedConversationRef.current = true;
    invalidateConversationRequests();
    resetComposerAttachments();
    const loadEpoch = conversationEpochRef.current;
    setChatLoading(true);
    setShowMenu(false);
    try {
      const res = await loadTutorHistoryAction(courseId, targetSessionId);
      if (loadEpoch !== conversationEpochRef.current) return;
      activateConversation(conversationKeyForSession(res.sessionId), { invalidate: false });
      setSessionId(res.sessionId);
      if (res.messages.length > 0) {
        setMessages(res.messages);
      } else {
        setMessages([
          {
            id: "chat-welcome",
            role: "ai",
            content: t("tutorDrawer.welcome"),
          },
        ]);
      }
    } catch {
      if (loadEpoch === conversationEpochRef.current) toast.error(t("tutorDrawer.sessionLoadFailed"));
    } finally {
      if (loadEpoch === conversationEpochRef.current) setChatLoading(false);
    }
  }, [courseIdFromPath, sessionId, t, activateConversation, invalidateConversationRequests, conversationKeyForSession, resetComposerAttachments]);

  const handleDeleteSession = React.useCallback(async (targetSessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const courseId = courseIdFromPath;
    if (!courseId) return;
    const targetConversationKey = conversationKeyForSession(targetSessionId);
    const isCurrentConversation = conversationKeyRef.current === targetConversationKey;
    if (isCurrentConversation) invalidateConversationRequests();
    try {
      await clearTutorHistoryAction(courseId, targetSessionId);
      setSessions((prev) => prev.filter((s) => s.id !== targetSessionId));
      responseLanguageByConversationRef.current.delete(targetConversationKey);
      if (isCurrentConversation && conversationKeyRef.current === targetConversationKey) {
        startNewConversation();
        setSessionId(null);
        resetComposerAttachments();
        setMessages([
          {
            id: "chat-welcome",
            role: "ai",
            content: t("tutorDrawer.welcome"),
          },
        ]);
      }
      toast.success(t("tutorDrawer.sessionDeleted"));
    } catch {
      toast.error(t("tutorDrawer.sessionDeleteFailed"));
    }
  }, [courseIdFromPath, t, startNewConversation, invalidateConversationRequests, conversationKeyForSession, resetComposerAttachments]);

  const handleNewChat = React.useCallback(() => {
    startNewConversation();
    setSessionId(null);
    resetComposerAttachments();
    setMessages([
      {
        id: "chat-welcome",
        role: "ai",
        content:
          t("tutorDrawer.welcome"),
      },
    ]);
    setShowMenu(false);
    toast.success(t("tutorDrawer.newChatStarted"));
  }, [t, startNewConversation, resetComposerAttachments]);

  const handleClearHistory = React.useCallback(async () => {
    const courseId = courseIdFromPath;
    startNewConversation();
    setSessionId(null);
    resetComposerAttachments();
    setSessions([]);
    setMessages([
      {
        id: "chat-welcome",
        role: "ai",
        content: t("tutorDrawer.historyClearedWelcome"),
      },
    ]);
    responseLanguageByConversationRef.current.clear();
    if (courseId) {
      await clearTutorHistoryAction(courseId).catch(() => {});
    }
    toast.success(t("tutorDrawer.historyCleared"));
  }, [courseIdFromPath, t, startNewConversation, resetComposerAttachments]);

  const handleInsertSnippet = (snippet: string) => {
    let start = textareaRef.current?.selectionStart ?? inputVal.length;
    let end = textareaRef.current?.selectionEnd ?? start;
    const ranges = composerMathRanges(inputVal);
    const inMath = ranges.some(({ from, to }) => {
      const delimiterLength = inputVal[from] === "$" && inputVal[from + 1] !== "$" ? 1 : 2;
      return start >= from + delimiterLength && end <= to - delimiterLength;
    });
    if (!inMath && start !== end) {
      for (const range of ranges) if (range.from < end && range.to > start) {
        start = Math.min(start, range.from);
        end = Math.max(end, range.to);
      }
      textareaRef.current?.setSelectionRange(start, end);
    }
    textareaRef.current?.insertText(inMath ? snippet : `$${snippet.trim()}$`);
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
        aria-label={t("tutorDrawer.accessibleName")}
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
          aria-label={t("tutorDrawer.resizeSidebar")}
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={typeof window === "undefined" ? MAX_SIDEBAR_WIDTH : Math.min(MAX_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.7))}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          title={t("tutorDrawer.resizeHint")}
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
              aria-label={t("tutorDrawer.topicMenu")}
              className="flex items-center gap-1.5 text-left text-body-sm font-semibold text-foreground hover:text-brand-primary transition-colors cursor-pointer truncate max-w-full group"
            >
              <span className="truncate max-w-[220px] sm:max-w-[300px]">
                {currentTitle}
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground group-hover:text-brand-primary transition-transform shrink-0" />
            </button>

            {/* Dropdown Menu: Riwayat Percakapan (History) */}
            {showMenu && (
              <div className="absolute top-full left-0 mt-1.5 w-[300px] sm:w-[340px] rounded-xl border border-border bg-background shadow-xl p-2 z-50 space-y-1.5 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between px-2 pt-1 pb-1.5 border-b border-border/60">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("tutorDrawer.history")}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      handleNewChat();
                      setShowMenu(false);
                    }}
                    className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>{t("tutorDrawer.newChat")}</span>
                  </button>
                </div>

                {/* Sessions list */}
                <div className="max-h-64 overflow-y-auto space-y-1 py-1 pr-0.5">
                  {sessionsLoading ? (
                    <div className="flex items-center justify-center py-5 text-muted-foreground text-body-xs gap-2">
                      <Loader2 className="size-3.5 animate-spin text-brand-primary" />
                      <span>{t("tutorDrawer.loadingHistory")}</span>
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="py-5 text-center text-body-xs text-muted-foreground">
                      {t("tutorDrawer.noHistory")}
                    </div>
                  ) : (
                    sessions.map((sess) => {
                      const isCurrent = sessionId === sess.id;
                      return (
                        <div
                          key={sess.id}
                          className={cn(
                            "group flex items-center justify-between rounded-lg px-2.5 py-2 text-body-sm transition-colors cursor-pointer",
                            isCurrent
                              ? "bg-brand-primary/10 text-brand-primary font-medium"
                              : "hover:bg-muted text-foreground"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectSession(sess.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-body-xs font-medium">{sess.title}</p>
                            <span className="text-[10px] text-muted-foreground">
                              {t("tutorDrawer.messageCount", { count: sess.id === sessionId ? Math.max(sess.messageCount, Math.min(100, messages.filter((message) => message.id !== "chat-welcome" && message.persisted !== false && (message.content.trim() || message.pythonStatus || message.attachments?.length) && !message.isError).length)) : sess.messageCount })}{sess.lastMessageAt ? ` • ${formatSessionDate(sess.lastMessageAt, locale, { justNow: t("tutorDrawer.justNow"), minutes: t("tutorDrawer.minutesAgo"), hours: t("tutorDrawer.hoursAgo"), days: t("tutorDrawer.daysAgo") })}` : ""}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSession(sess.id, e)}
                            aria-label={t("tutorDrawer.deleteSession")}
                            title={t("tutorDrawer.deleteSession")}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-opacity"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {zyraAccessTier === "free" && (
                  <div className="mt-2 border-t border-border/60 px-2 pt-2">
                    <p className="text-body-xs text-muted-foreground">{t("tutorDrawer.freeTextOnly") || "Paket Free hanya mendukung pertanyaan teks."}</p>
                    <Link
                      href="/plans"
                      className="mt-1 inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
                    >
                      {t("tutorDrawer.fullFeatures") || "Buka fitur lengkap"}
                      <ArrowRight className="size-3" />
                    </Link>
                  </div>
                )}

                {sessions.length > 0 && (
                  <div className="border-t border-border/60 pt-1 px-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleClearHistory();
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-body-xs text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-left cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                      <span>{t("tutorDrawer.clearHistory")}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Window Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleNewChat}
              aria-label={t("tutorDrawer.newChat")}
              title={t("tutorDrawer.startNewChat")}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Plus className="size-4" />
            </button>

            <button
              type="button"
              onClick={toggleExpand}
              aria-label={isExpanded ? t("tutorDrawer.shrinkSidebar") : t("tutorDrawer.expandSidebar")}
              title={isExpanded ? t("tutorDrawer.shrinkView") : t("tutorDrawer.expandView")}
              className="hidden md:inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              {isExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={t("tutorDrawer.closeAssistant")}
              title={t("tutorDrawer.closeAssistantEsc")}
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
          aria-label={t("tutorDrawer.conversationHistory")}
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
              <p className="text-body-xs font-medium">{t("tutorDrawer.preparingMaterial")}</p>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => {
                const isStudent = msg.role === "student";
                const isLastAiTurn = !isStudent && index === messages.length - 1;

                if (isStudent) {
                  const attachmentSessionId = msg.sessionId ?? sessionId;
                  return (
                    <div key={msg.id || index} className="flex justify-end">
                      <div className="min-w-0 max-w-[85%] rounded-2xl bg-muted/90 text-foreground px-4 py-2.5 text-body-sm leading-relaxed shadow-2xs space-y-2">
                        {msg.quotedContext && (
                          <div className="border-l-2 border-brand-primary/60 pl-2.5 py-0.5 text-body-xs space-y-0.5 text-muted-foreground">
                            <p className="font-medium text-foreground text-[11px] truncate">
                              <MathText className="normal-case">
                                {msg.quotedContext.title || t("tutorDrawer.materialQuote")}
                              </MathText>
                              {msg.quotedContext.sectionTitle ? (
                                <>
                                  {" · "}
                                  <MathText className="normal-case">{msg.quotedContext.sectionTitle}</MathText>
                                </>
                              ) : ""}
                            </p>
                            <p className="line-clamp-2 italic text-[11px]">
                              &ldquo;<MathText className="normal-case">{msg.quotedContext.snippet}</MathText>&rdquo;
                            </p>
                          </div>
                        )}
                        {msg.attachments && msg.attachments.length > 0 && courseIdFromPath && attachmentSessionId && (
                          <div className="mb-2">
                            <ZyraMessageAttachments
                              attachments={msg.attachments}
                              courseId={courseIdFromPath}
                              sessionId={attachmentSessionId}
                            />
                          </div>
                        )}
                        {msg.content && (
                          <div className="min-w-0 max-w-full break-words text-body-sm leading-relaxed text-foreground">
                            <MarkdownRenderer
                              content={normalizeTutorMathMarkdown(msg.content)}
                              density="compact"
                              className="text-foreground"
                            />
                          </div>
                        )}
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

                    {/* Message Content Flow (Synced with Artikel v4 renderer pipeline) */}
                    {msg.isError ? (
                      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-2 text-body-xs">
                        <div className="flex items-center gap-2 text-destructive">
                          <AlertTriangle className="size-4 shrink-0" />
                          <span>{msg.content}</span>
                        </div>
                        {msg.failedPayload && (
                          <div className="pt-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={chatLoading}
                              onClick={() => handleRetry(msg.failedPayload!)}
                              className="h-7 text-body-xs font-semibold gap-1.5 border-destructive/30 hover:bg-destructive/10 text-foreground cursor-pointer"
                            >
                              <RefreshCw className={cn("size-3", chatLoading && "animate-spin")} />
                              <span>{t("tutorDrawer.retry")}</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className="min-w-0 max-w-full break-words text-body-sm leading-relaxed text-foreground space-y-3"
                        data-content-lane="zyra-tutor"
                      >
                        {msg.parts && msg.parts.length > 0 ? (
                          <ArticleParts parts={msg.parts} visuals={msg.visuals} density="compact" />
                        ) : (
                          <MarkdownRenderer content={sanitizeAnswer(msg.content, msg.sources)} density="compact" />
                        )}
                        {msg.pythonStatus ? <p role="status" className="text-body-xs text-muted-foreground">{msg.pythonStatus}</p> : null}
                      {msg.pendingPython ? <Button size="sm" variant="outline" onClick={() => {
                        const result = msg.pendingPython!.apply(msg.pendingPython!.code, true);
                        setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, pendingPython: undefined, pythonStatus: result === "applied" ? "Kode diterapkan ke editor." : "Playground asal sudah ditutup. Minta kode kembali di Playground." } : m));
                      }}>Terapkan ke editor</Button> : null}
                      {msg.workedExample && (
                          <ProductWorkedExample example={msg.workedExample} density="compact" />
                        )}
                        {!msg.parts?.length && msg.visuals && msg.visuals.length > 0 && (
                          <div className="space-y-3">
                            {msg.visuals.map((visual) => (
                              <ProductLearningVisual key={visual.id} visual={visual} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {msg.canvasSpec && (
                      <div className="mt-3">
                        <LearningCanvasRenderer spec={msg.canvasSpec} />
                      </div>
                    )}

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-border/40 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground">{t("tutorDrawer.sources")}</span>
                        {msg.sources.map((s, idx) => {
                          const cleanLabel = (s.label || "").trim();
                          const displayLabel = cleanLabel && cleanLabel !== s.id
                            ? cleanLabel.replace(/^(?:Materi|Konsep|Pembahasan):\s*/i, "").trim() || cleanLabel
                            : (s.id.startsWith("article-") || s.id.startsWith("product-"))
                              ? t("tutorDrawer.articleSource")
                              : (s.id.startsWith("diktat-") || s.id.startsWith("text-product-"))
                                ? t("tutorDrawer.diktatSource")
                                : (s.id.startsWith("quiz-review-") || s.id.startsWith("quiz-"))
                                  ? t("tutorDrawer.quizSource")
                                  : t("tutorDrawer.courseMaterialSource");
                          return (
                            <a
                              key={idx}
                              href={s.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-body-xs text-brand-primary hover:underline bg-brand-primary/10 px-2 py-0.5 rounded-md"
                            >
                              {displayLabel}
                            </a>
                          );
                        })}
                      </div>
                    )}

                    {isLastAiTurn && !chatLoading && !msg.isError && !!msg.followups?.length && (
                      <FollowUpChips
                        followups={msg.followups}
                        disabled={chatLoading || !attachmentsReady}
                        onSend={(followup) => void handleSend(
                          followup.prompt,
                          null,
                          assistantMode === "python" ? (followup.intent === "explain" ? "review" : "hint") : undefined,
                        )}
                      />
                    )}

                    {/* Copy message button */}
                    {msg.content && (
                      <div className="flex items-center gap-2 pt-1 text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => handleCopyText(msg.id, msg.content)}
                          aria-label={t("tutorDrawer.copyMessage")}
                          title={t("tutorDrawer.copyMessage")}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5 px-1.5 rounded-md hover:bg-muted"
                        >
                          {copiedMessageId === msg.id ? (
                            <>
                              <Check className="size-3 text-status-success" />
                              <span>{t("tutorDrawer.copiedLabel")}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" />
                              <span>{t("tutorDrawer.copy")}</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {chatLoading && (
                <div role="status" className="flex items-center gap-2 text-muted-foreground text-body-xs p-2">
                  <Loader2 className="size-3.5 animate-spin text-brand-primary" />
                  <span>{t("tutorDrawer.thinking")}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleStopStream}
                    className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10"
                  >
                    {t("tutorDrawer.stop")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {assistantMode === "python" && codingBridge ? <div className="shrink-0 px-3 pb-1"><PythonPresets code={codingBridge.capture().context.code} hasError={["syntax_error", "runtime_error", "timeout"].includes(codingBridge.capture().context.execution?.status ?? "")} disabled={chatLoading} onSelect={preset => void handleSend(preset.message, null, preset.intent)} /></div> : null}

        {/* Input Composer & Toolbar */}
        <footer className="shrink-0 border-t border-border/40 bg-background p-2">
          <div
            onPasteCapture={handlePaste}
            className="relative rounded-2xl border border-border bg-background/95 backdrop-blur-md shadow-md focus-within:border-brand-primary/60 focus-within:ring-1 focus-within:ring-brand-primary/20 transition-colors p-1.5"
          >
            {imageInputEnabled && courseIdFromPath && (
              <ZyraAttachmentComposer
                key={attachmentComposerKey}
                ref={attachmentComposerRef}
                courseId={courseIdFromPath}
                sessionId={sessionId}
                disabled={chatLoading}
                hideStandaloneTrigger
                onSessionCreated={handleComposerSessionCreated}
                onAttachmentIdsChange={setAttachmentIds}
                onAttachmentsChange={setReadyAttachments}
                onAttachmentsReadyChange={setAttachmentsReady}
              />
            )}

            {activeQuotedContext && (
              <div className="mb-2 flex items-center justify-between gap-2 border-l-2 border-brand-primary bg-muted/40 rounded-r-lg px-2.5 py-1.5 text-body-xs animate-in fade-in duration-150">
                <div className="flex items-center gap-2 min-w-0">
                  <Quote className="size-3.5 shrink-0 text-brand-primary" />
                  <div className="min-w-0 flex items-center gap-1.5">
                    <span className="font-semibold text-foreground text-[11px] shrink-0">
                      <MathText className="normal-case">
                        {activeQuotedContext.title || t("tutorDrawer.materialQuote")}
                      </MathText>
                      {activeQuotedContext.sectionTitle ? (
                        <>
                          {" · "}
                          <MathText className="normal-case">{activeQuotedContext.sectionTitle}</MathText>
                        </>
                      ) : ""}:
                    </span>
                    <span className="text-muted-foreground truncate italic text-[11px]">
                      &ldquo;<MathText className="normal-case">{activeQuotedContext.snippet}</MathText>&rdquo;
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveQuotedContext(null);
                    onClearQuotedContext?.();
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 transition-colors cursor-pointer"
                  aria-label={t("tutorDrawer.removeQuote")}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            <ZyraComposerInput
              className="text-body-sm"
              ref={textareaRef}
              value={inputVal}
              onChange={setInputVal}
              onSubmit={() => void handleSend()}
              aria-label={t("tutorDrawer.inputPlaceholder")}
              placeholder={t("tutorDrawer.inputPlaceholder")}
              disabled={chatLoading}
            />

            <div className="flex items-center justify-between gap-1 pt-1">
              <div className="flex items-center gap-1">
                {imageInputEnabled && courseIdFromPath && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={chatLoading}
                    onClick={() => attachmentComposerRef.current?.openFileDialog()}
                    aria-label="Lampirkan gambar (atau tempel dengan Ctrl+V)"
                    title="Lampirkan gambar (Ctrl+V)"
                    className="size-7 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                  >
                    <Paperclip className="size-3.5" />
                  </Button>
                )}
                <ZyraMathPalette onInsert={handleInsertSnippet} disabled={chatLoading} />
                <Tabs value={assistantMode} onValueChange={(mode) => { setAssistantMode(mode as "python" | "tutor"); setActiveMode("chat"); }} syncUrl={false}>
                  <TabsList aria-label="Mode Zyra" className="gap-0 p-0.5">
                    <TabsTrigger value="python" disabled={!codingBridge || chatLoading} className="px-2 py-1" title={!codingBridge ? "Buka Playground untuk menggunakan Python" : undefined}>Python</TabsTrigger>
                    <TabsTrigger value="tutor" disabled={chatLoading} className="px-2 py-1">Tutor</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="flex items-center gap-2">
                {zyraAccessTier === "free" && (
                  <Link
                    href="/plans"
                    className="shrink-0 text-body-xs font-semibold text-brand-primary hover:underline"
                  >
                    {t("tutorDrawer.fullFeatures") || "Buka fitur lengkap"}
                  </Link>
                )}
                {assistantMode === "python" && codingBridge && !activeQuotedContext && (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-body-sm" disabled={chatLoading || !attachmentsReady || (!inputVal.trim() && attachmentIds.length === 0)} onClick={() => void handleSend(undefined, null, "generate")}>Buat kode</Button>
                )}
                <Button
                  size="icon-xs"
                  onClick={() => void handleSend()}
                  disabled={
                    chatLoading ||
                    !attachmentsReady ||
                    (!inputVal.trim() && !activeQuotedContext && attachmentIds.length === 0)
                  }
                  className="size-8 rounded-lg bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 transition-transform active:scale-95 disabled:opacity-40"
                  aria-label={t("tutorDrawer.sendMessage")}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-1 empty:hidden"><ZyraAllowanceSummary courseId={courseIdFromPath} onAccessTierChange={setZyraAccessTier} /></div>
        </footer>

        {/* Micro-apps Modal View (Flashcards / Practice Quiz) */}
        {activeAction !== "none" && actionData.length > 0 && (
          <div className="absolute inset-0 z-50 flex flex-col bg-background p-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <span className="font-heading text-body-base font-bold">
                {activeAction === "flashcards" ? t("tutorDrawer.flashcardsTitle") : t("tutorDrawer.quickQuizTitle")}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setActiveAction("none")}
                aria-label={t("tutorDrawer.closeActivity")}
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
                    {actionFlipped ? t("tutorDrawer.answerOrExplanation") : t("tutorDrawer.question")}
                  </span>
                  <div className="font-heading text-body-base text-foreground font-semibold min-w-0 max-w-full">
                    <MarkdownRenderer
                      content={normalizeTutorMathMarkdown(
                        String((actionFlipped ? actionData[actionIndex]?.back : actionData[actionIndex]?.front) ?? "")
                      )}
                      density="compact"
                    />
                  </div>
                  <span className="mt-4 text-[10px] text-muted-foreground">{t("tutorDrawer.flipCardHint")}</span>
                </div>
              ) : (
                <div className="w-full max-w-sm space-y-4">
                  <div className="font-heading text-body-base font-semibold min-w-0 max-w-full">
                    <MarkdownRenderer
                      content={normalizeTutorMathMarkdown(String(actionData[actionIndex]?.question ?? ""))}
                      density="compact"
                    />
                  </div>
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
                        <MathText>{normalizeTutorMathMarkdown(String(opt ?? ""))}</MathText>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3 mt-4">
              <span className="text-body-xs text-muted-foreground">
                {t("tutorDrawer.itemCount", { current: actionIndex + 1, total: actionData.length })}
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
                  {t("tutorDrawer.previous")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (actionIndex < actionData.length - 1) {
                      setActionIndex(actionIndex + 1);
                      setActionFlipped(false);
                      setActionSelectedAnswer(null);
                    } else {
                      toast.success(t("tutorDrawer.activityDone"));
                      setActiveAction("none");
                    }
                  }}
                >
                  {actionIndex === actionData.length - 1 ? t("tutorDrawer.done") : t("tutorDrawer.next")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
