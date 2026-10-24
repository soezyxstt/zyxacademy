"use client";

import { useState, type ReactNode } from "react";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

export type FlashcardDemoCard = {
 id: string;
 /** Server-rendered faces (KaTeX via MathText). */
 front: ReactNode;
 back: ReactNode;
 note?: ReactNode;
};

type FlashcardDemoProps = {
 cards: FlashcardDemoCard[];
};

const grades = [
 { key: "again", delay: 0, classes: "border-status-error/45 text-status-error hover:bg-status-error/10" },
 { key: "hard", delay: 3, classes: "border-status-warning/55 text-status-warning hover:bg-status-warning/10" },
 { key: "good", delay: 6, classes: "border-primary/45 text-primary hover:bg-primary/10" },
 { key: "easy", delay: 14, classes: "border-status-success/45 text-status-success hover:bg-status-success/10" },
] as const;

/**
 * SM-2 flashcard demo: flip the card, grade it, watch the spaced-repetition
 * schedule react, then the deck advances. Mirrors the real review flow's
 * Lagi/Sulit/Bagus/Mudah grading.
 */
export function FlashcardDemo({ cards }: FlashcardDemoProps) {
 const t = useTranslations("marketing");
 const [index, setIndex] = useState(0);
 const [flipped, setFlipped] = useState(false);
 const [lastSchedule, setLastSchedule] = useState<string | null>(null);

 const card = cards[index % cards.length];

 function grade(delay: number, label: string) {
 const schedule = delay === 0 ? t("home.flashcardToday") : t("home.flashcardLater", { days: delay });
 setLastSchedule(`${label} → ${schedule}`);
 setFlipped(false);
 window.setTimeout(() => {
 setIndex((current) => (current + 1) % cards.length);
 }, 350);
 }

 return (
 <div>
 <div className="landing-flip" data-flipped={flipped ? "true" : "false"}>
 <button
 type="button"
 onClick={() => setFlipped((value) => !value)}
 aria-pressed={flipped}
 aria-label={flipped ? t("home.flashcardFlipBack") : t("home.flashcardFlip")}
 className="landing-flip-inner block h-[230px] w-full cursor-pointer text-left md:h-[250px]"
 >
 <span className="landing-flip-face absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 text-center shadow-sm">
 <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
 {t("home.flashcardCounter", { current: (index % cards.length) + 1, total: cards.length })}
 </span>
 <span className="font-heading text-h5 font-semibold text-foreground">{card.front}</span>
 <span className="text-body-xs text-muted-foreground">{t("home.flashcardFlipHint")}</span>
 </span>
 <span className="landing-flip-face landing-flip-back absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-primary/35 bg-primary/5 px-6 text-center shadow-sm">
 <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
 {t("home.flashcardAnswer")}
 </span>
 <span className="font-heading text-h5 font-semibold text-foreground">{card.back}</span>
 {card.note ? <span className="text-body-sm text-muted-foreground">{card.note}</span> : null}
 </span>
 </button>
 </div>

 <div
 className={cn(
 "mt-4 grid grid-cols-4 gap-2 transition-opacity duration-300",
 flipped ? "opacity-100" : "pointer-events-none opacity-35",
 )}
 aria-hidden={!flipped}
 >
 {grades.map((item) => (
 <button
 key={item.key}
 type="button"
 tabIndex={flipped ? 0 : -1}
 onClick={() => grade(item.delay, t(`home.flashcardGrades.${item.key}`))}
 className={cn(
 "rounded-lg border bg-background px-2 py-2 text-body-sm font-semibold transition-colors",
 item.classes,
 )}
 >
 {t(`home.flashcardGrades.${item.key}`)}
 </button>
 ))}
 </div>

 <div aria-live="polite" className="mt-3 min-h-6">
 {lastSchedule ? (
 <p className="flex items-center gap-1.5 text-body-sm text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
 <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden />
 <span>
 <span className="font-semibold text-foreground">{lastSchedule.split(" → ")[0]}</span>
 {" → "}
 {lastSchedule.split(" → ")[1]}
 </span>
 </p>
 ) : null}
 </div>
 </div>
 );
}
