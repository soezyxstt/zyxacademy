"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoFrame } from "@/components/landing/demo/demo-frame";
import { ZyraMark } from "@/components/course/zyra-mark";

export type TutorChatMessage = {
  id: string;
  role: "student" | "ai";
  /** Server-rendered bubble content (KaTeX via MathText). */
  content: ReactNode;
  /** Optional server-rendered "Sumber" footer (citation tags). */
  sources?: ReactNode;
};

type TutorChatDemoProps = {
  messages: TutorChatMessage[];
};

const STUDENT_DELAY = 700;
const AI_DELAY = 1600;

function TypingIndicator() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-lg bg-muted px-3 py-2.5" aria-label="Zyra sedang mengetik">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="landing-typing-dot size-1.5 rounded-full bg-muted-foreground"
          style={{ animationDelay: `${dot * 160}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * Scripted AI-tutor chat replay. Message content is server-rendered and
 * passed in; this island only sequences the playback.
 */
export function TutorChatDemo({ messages }: TutorChatDemoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(0);
  const [started, setStarted] = useState(false);
  const [playKey, setPlayKey] = useState(0);

  // Start playback once scrolled into view.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || started) return;

    if (
      typeof window.IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setStarted(true);
      setShown(messages.length);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -20% 0px", threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [messages.length, started]);

  // Advance the script.
  useEffect(() => {
    if (!started || shown >= messages.length) return;
    const next = messages[shown];
    const timer = window.setTimeout(
      () => setShown((count) => count + 1),
      next.role === "ai" ? AI_DELAY : STUDENT_DELAY,
    );
    return () => window.clearTimeout(timer);
  }, [started, shown, messages, playKey]);

  const waitingForAi = started && shown < messages.length && messages[shown].role === "ai";
  const done = shown >= messages.length;

  function replay() {
    setShown(0);
    setStarted(true);
    setPlayKey((key) => key + 1);
  }

  return (
    <div ref={containerRef}>
      <DemoFrame
        title="Zyra"
        meta={
          <span className="flex items-center gap-1 text-[var(--zx-accent)]">
            <ZyraMark className="size-3.5" aria-hidden />
            Gemini
          </span>
        }
        bodyClassName="flex min-h-[380px] flex-col p-4 md:p-5"
      >
        <div className="flex flex-1 flex-col justify-end gap-3" aria-live="polite">
          {messages.slice(0, shown).map((message) => (
            <div
              key={`${playKey}-${message.id}`}
              className={cn(
                "max-w-[85%] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300",
                message.role === "student" ? "self-end" : "self-start",
              )}
            >
              <div
                className={cn(
                  "rounded-lg px-3.5 py-2.5 text-body-sm leading-relaxed",
                  message.role === "student"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {message.content}
              </div>
              {message.sources ? (
                <div className="mt-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Sumber
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">{message.sources}</div>
                </div>
              ) : null}
            </div>
          ))}
          {waitingForAi ? <TypingIndicator /> : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/80 pt-3">
          <p className="text-body-xs text-muted-foreground">Percakapan contoh dari sesi nyata.</p>
          <button
            type="button"
            onClick={replay}
            disabled={!done}
            className="inline-flex items-center gap-1.5 rounded-md text-body-sm font-semibold text-primary transition-colors hover:text-primary/80 disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Putar ulang
          </button>
        </div>
      </DemoFrame>
    </div>
  );
}
