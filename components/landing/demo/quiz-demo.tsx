"use client";

import { useState, type ReactNode } from "react";
import { RotateCcw, Timer } from "lucide-react";
import { DemoFrame } from "@/components/landing/demo/demo-frame";
import { QuizOptionRow } from "@/components/landing/demo/quiz-option-row";

export type QuizDemoOption = {
 id: string;
 /** Server-rendered option content (KaTeX via MathText). */
 content: ReactNode;
 correct: boolean;
};

type QuizDemoProps = {
 /** Server-rendered prompt (KaTeX via MathText). */
 prompt: ReactNode;
 options: QuizDemoOption[];
 /** Panel shown after answering correctly. */
 correctPanel: ReactNode;
 /** "Kenapa salah?" panel shown after a wrong answer. */
 wrongPanel: ReactNode;
};

/**
 * Interactive single-question quiz for the landing page. All rich content is
 * server-rendered and passed in as ReactNode so this island stays tiny and
 * KaTeX never enters the client bundle.
 */
export function QuizDemo({ prompt, options, correctPanel, wrongPanel }: QuizDemoProps) {
 const [picked, setPicked] = useState<string | null>(null);

 const answered = picked !== null;
 const pickedOption = options.find((option) => option.id === picked);
 const wasCorrect = pickedOption?.correct === true;

 function stateFor(option: QuizDemoOption) {
 if (!answered) return "idle" as const;
 if (option.correct) return "correct" as const;
 if (option.id === picked) return "wrong" as const;
 return "idle" as const;
 }

 return (
 <DemoFrame
 title="Kuis Mingguan · Kalkulus IA"
 meta={
 <>
 <span className="flex items-center gap-1 font-mono">
 <Timer className="size-3.5" aria-hidden />
 09:41
 </span>
 <span aria-hidden>·</span>
 <span>3/10</span>
 </>
 }
 >
 <div className="font-heading text-body-base font-bold leading-normal text-foreground">
 {prompt}
 </div>

 <ul className="mt-4 space-y-2.5">
 {options.map((option, index) => (
 <li key={option.id}>
 <QuizOptionRow
 letter={String.fromCharCode(65 + index)}
 state={stateFor(option)}
 disabled={answered}
 onClick={() => setPicked(option.id)}
 >
 {option.content}
 </QuizOptionRow>
 </li>
 ))}
 </ul>

 <div aria-live="polite">
 {answered ? (
 <div className="mt-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
 {wasCorrect ? correctPanel : wrongPanel}
 </div>
 ) : null}
 </div>

 {answered ? (
 <button
 type="button"
 onClick={() => setPicked(null)}
 className="mt-4 inline-flex items-center gap-1.5 rounded-md text-body-sm font-semibold text-primary transition-colors hover:text-primary/80"
 >
 <RotateCcw className="size-3.5" aria-hidden />
 Coba lagi
 </button>
 ) : null}
 </DemoFrame>
 );
}
