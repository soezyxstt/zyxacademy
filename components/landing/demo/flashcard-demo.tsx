"use client";

import { useState, type ReactNode } from "react";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

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
 { label: "Lagi", schedule: "muncul lagi hari ini", classes: "border-status-error/45 text-status-error hover:bg-status-error/10" },
 { label: "Sulit", schedule: "diulang 3 hari lagi", classes: "border-status-warning/55 text-status-warning hover:bg-status-warning/10" },
 { label: "Bagus", schedule: "diulang 6 hari lagi", classes: "border-primary/45 text-primary hover:bg-primary/10" },
 { label: "Mudah", schedule: "diulang 14 hari lagi", classes: "border-status-success/45 text-status-success hover:bg-status-success/10" },
] as const;

/**
 * SM-2 flashcard demo: flip the card, grade it, watch the spaced-repetition
 * schedule react, then the deck advances. Mirrors the real review flow's
 * Lagi/Sulit/Bagus/Mudah grading.
 */
export function FlashcardDemo({ cards }: FlashcardDemoProps) {
 const [index, setIndex] = useState(0);
 const [flipped, setFlipped] = useState(false);
 const [lastSchedule, setLastSchedule] = useState<string | null>(null);

 const card = cards[index % cards.length];

 function grade(schedule: string, label: string) {
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
 aria-label={flipped ? "Kartu terbalik ; klik untuk kembali" : "Klik untuk membalik kartu"}
 className="landing-flip-inner block h-[230px] w-full cursor-pointer text-left md:h-[250px]"
 >
 <span className="landing-flip-face absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 text-center shadow-sm">
 <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
 Kartu {(index % cards.length) + 1} / {cards.length}
 </span>
 <span className="font-heading text-h5 font-semibold text-foreground">{card.front}</span>
 <span className="text-body-xs text-muted-foreground">klik untuk membalik</span>
 </span>
 <span className="landing-flip-face landing-flip-back absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-primary/35 bg-primary/5 px-6 text-center shadow-sm">
 <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
 Jawaban
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
 key={item.label}
 type="button"
 tabIndex={flipped ? 0 : -1}
 onClick={() => grade(item.schedule, item.label)}
 className={cn(
 "rounded-lg border bg-background px-2 py-2 text-body-sm font-semibold transition-colors",
 item.classes,
 )}
 >
 {item.label}
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
 ) : (
 <p className="text-body-xs text-muted-foreground">
 Nilai kartumu ; jadwal pengulangan menyesuaikan otomatis.
 </p>
 )}
 </div>
 </div>
 );
}
