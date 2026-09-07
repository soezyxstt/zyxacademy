"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { ZyraMark } from "@/components/course/zyra-mark";
import { ZyraFloatingPet } from "@/components/course/zyra-floating-pet";
import { getTutorCapabilities } from "@/lib/tutor-capabilities";
import type { TutorMode } from "./tutor-drawer-view";

export type { TutorMode };

export interface TutorContextType {
  openExplain: (koId: string, initialMode?: "content" | "analogy" | "simplification") => void;
  openMistake: (questionId: string, userAnswer: string) => void;
  openStudyPlan: () => void;
  openChat: () => void;
  openChatWithQuestion: (question: string) => void;
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

export function TutorProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const courseIdFromPath = pathname?.startsWith("/courses/") ? pathname.split("/")[2] : null;
  const caps = getTutorCapabilities(courseIdFromPath);

  const [isOpen, setIsOpen] = React.useState(false);
  const [activeMode, setActiveMode] = React.useState<TutorMode>(null);
  const [suppressPet, setSuppressPet] = React.useState(false);

  const [koId, setKoId] = React.useState<string | null>(null);
  const [questionId, setQuestionId] = React.useState<string | null>(null);
  const [userAnswer, setUserAnswer] = React.useState<string | null>(null);
  const [explainMode, setExplainMode] = React.useState<"content" | "analogy" | "simplification">("content");
  const [initialQuestion, setInitialQuestion] = React.useState<string | null>(null);

  const openExplain = React.useCallback(
    (id: string, initialMode: "content" | "analogy" | "simplification" = "content") => {
      if (suppressPet) return;
      setKoId(id);
      setQuestionId(null);
      setUserAnswer(null);
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
    (question: string) => {
      if (suppressPet) return;
      setKoId(null);
      setQuestionId(null);
      setUserAnswer(null);
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

        {/* Global floating Zyra trigger */}
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

        {isOpen && (
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
          />
        )}
      </div>
    </TutorContext.Provider>
  );
}
