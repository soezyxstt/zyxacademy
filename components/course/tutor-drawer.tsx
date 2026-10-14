"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { ZyraFloatingPet } from "@/components/course/zyra-floating-pet";
import { getTutorCapabilities } from "@/lib/tutor-capabilities";
import type { TutorMode } from "./tutor-drawer-view";

export type { TutorMode };

export interface ZyraQuotedContext {
  title?: string;
  sectionTitle?: string;
  snippet: string;
  blockType?: string;
  surroundingText?: string;
  intent?: "define" | "simplify" | "step_by_step" | "intuition" | "custom";
}

export interface TutorContextType {
  openExplain: (koId: string, initialMode?: "content" | "analogy" | "simplification") => void;
  openMistake: (questionId: string, userAnswer: string) => void;
  openStudyPlan: () => void;
  openChat: () => void;
  openChatWithQuestion: (question: string, quotedContext?: ZyraQuotedContext | null) => void;
  close: () => void;
  isOpen: boolean;
  activeMode: TutorMode;
  /** When true the floating pet and drawer are suppressed (e.g. during an active quiz). */
  suppressPet: boolean;
  setSuppressPet: (v: boolean) => void;
}

const TutorContext = React.createContext<TutorContextType | undefined>(undefined);

const noopTutorContext: TutorContextType = {
  openExplain: () => {},
  openMistake: () => {},
  openStudyPlan: () => {},
  openChat: () => {},
  openChatWithQuestion: () => {},
  close: () => {},
  isOpen: false,
  activeMode: null,
  suppressPet: true,
  setSuppressPet: () => {},
};

export function useTutor() {
  const context = React.useContext(TutorContext);
  return context ?? noopTutorContext;
}

const TutorDrawerView = dynamic(
  () => import("./tutor-drawer-view").then((mod) => mod.TutorDrawerView),
  {
    ssr: false,
    loading: () => null,
  }
);

const LEGACY_WELCOME =
  "Halo! Aku Zyra, asisten belajar buatan Zyx. Tanyakan apa saja seputar materi kuliah atau soal latihan, aku siap membimbingmu dengan pendekatan Socratic!";
const CLEAN_WELCOME = "Halo! Aku Zyra. Tanyakan materi kuliah atau soal latihan yang ingin kamu bahas.";

function ZyraWelcomeCopyGuard({ children }: { children: React.ReactNode }) {
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const normalizeWelcome = () => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if (node.nodeValue?.includes(LEGACY_WELCOME)) {
          node.nodeValue = node.nodeValue.replace(LEGACY_WELCOME, CLEAN_WELCOME);
        }
        node = walker.nextNode();
      }
    };

    normalizeWelcome();
    const observer = new MutationObserver(normalizeWelcome);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return <div ref={rootRef} className="contents">{children}</div>;
}

export function TutorProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const courseIdFromPath = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
  const caps = getTutorCapabilities(courseIdFromPath);

  // Preload TutorDrawerView in idle time so opening the drawer is instant
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const preload = () => {
      import("./tutor-drawer-view").catch(() => {});
    };
    if ("requestIdleCallback" in window) {
      const handle = (window as any).requestIdleCallback(preload, { timeout: 2000 });
      return () => (window as any).cancelIdleCallback(handle);
    } else {
      const timer = setTimeout(preload, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const [isOpen, setIsOpen] = React.useState(false);
  const [activeMode, setActiveMode] = React.useState<TutorMode>(null);
  const [suppressPet, setSuppressPet] = React.useState(false);

  const [koId, setKoId] = React.useState<string | null>(null);
  const [questionId, setQuestionId] = React.useState<string | null>(null);
  const [userAnswer, setUserAnswer] = React.useState<string | null>(null);
  const [explainMode, setExplainMode] = React.useState<"content" | "analogy" | "simplification">("content");
  const [initialQuestion, setInitialQuestion] = React.useState<string | null>(null);
  const [quotedContext, setQuotedContext] = React.useState<ZyraQuotedContext | null>(null);

  const openExplain = React.useCallback(
    (id: string, initialMode: "content" | "analogy" | "simplification" = "content") => {
      if (suppressPet) return;
      setKoId(id);
      setQuestionId(null);
      setUserAnswer(null);
      setQuotedContext(null);
      setExplainMode(initialMode);
      setActiveMode("explain");
      setIsOpen(true);
    },
    [suppressPet]
  );

  const openMistake = React.useCallback(
    (qId: string, answerText: string) => {
      if (suppressPet) return;
      setKoId(null);
      setQuestionId(qId);
      setUserAnswer(answerText);
      setQuotedContext(null);
      setActiveMode("mistake");
      setIsOpen(true);
    },
    [suppressPet]
  );

  const openStudyPlan = React.useCallback(() => {
    if (suppressPet) return;
    setKoId(null);
    setQuestionId(null);
    setUserAnswer(null);
    setQuotedContext(null);
    setActiveMode("study-plan");
    setIsOpen(true);
  }, [suppressPet]);

  const openChat = React.useCallback(() => {
    if (suppressPet) return;
    setKoId(null);
    setQuestionId(null);
    setUserAnswer(null);
    setActiveMode("chat");
    setIsOpen(true);
  }, [suppressPet]);

  const openChatWithQuestion = React.useCallback(
    (question: string, quote?: ZyraQuotedContext | null) => {
      if (suppressPet) return;
      setKoId(null);
      setQuestionId(null);
      setUserAnswer(null);
      setQuotedContext(quote ?? null);
      setInitialQuestion(question);
      setActiveMode("chat");
      setIsOpen(true);
    },
    [suppressPet]
  );

  const close = React.useCallback(() => {
    setIsOpen(false);
    setActiveMode(null);
    setInitialQuestion(null);
    setQuotedContext(null);
  }, []);

  return (
    <TutorContext.Provider
      value={{
        openExplain,
        openMistake,
        openStudyPlan,
        openChat,
        openChatWithQuestion,
        close,
        isOpen,
        activeMode,
        suppressPet,
        setSuppressPet,
      }}
    >
      <div className="relative flex min-h-screen w-full flex-row overflow-x-clip bg-background">
        {children}

        {pathname?.startsWith("/courses/") &&
          !pathname.includes("/live/host") &&
          !pathname.endsWith("/daftar") &&
          !suppressPet &&
          !isOpen &&
          (caps.pet ? (
            <ZyraFloatingPet state="idle" onOpen={openChat} />
          ) : (
            <button
              type="button"
              onClick={openChat}
              onMouseEnter={() => import("./tutor-drawer-view").catch(() => {})}
              aria-label="Tanya Zyra"
              title="Tanya Zyra"
              className="group fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full bg-brand-primary text-white shadow-lg shadow-brand-primary/30 transition-all hover:scale-105 hover:bg-brand-primary/95 active:scale-95 md:bottom-8 md:right-8"
            >
              <MessageSquareText className="size-6 transition-transform duration-150 group-hover:scale-105" />
              <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-body-xs font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 md:block">
                Tanya Zyra
              </span>
            </button>
          ))}

        {isOpen && (
          <ZyraWelcomeCopyGuard>
            <TutorDrawerView
              isOpen={isOpen}
              onClose={close}
              activeMode={activeMode}
              setActiveMode={setActiveMode}
              koId={koId}
              questionId={questionId}
              userAnswer={userAnswer}
              explainMode={explainMode}
              initialQuestion={initialQuestion}
              onClearInitialQuestion={() => setInitialQuestion(null)}
              quotedContext={quotedContext}
              onClearQuotedContext={() => setQuotedContext(null)}
            />
          </ZyraWelcomeCopyGuard>
        )}
      </div>
    </TutorContext.Provider>
  );
}
