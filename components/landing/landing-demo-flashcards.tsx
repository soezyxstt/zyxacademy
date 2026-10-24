import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";
import { MathText } from "@/components/course/math-text";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { DemoFrame } from "@/components/landing/demo/demo-frame";
import { LandingVisible } from "@/components/landing/landing-visible";
import { FlashcardDemo, type FlashcardDemoCard } from "@/components/landing/demo/flashcard-demo";
import { getTranslations } from "@/lib/i18n/server";

const cards: FlashcardDemoCard[] = [
 {
 id: "sinx",
 front: <MathText>{"Turunan dari $\\sin x$?"}</MathText>,
 back: <MathText>{"$\\cos x$"}</MathText>,
 note: <MathText>{"Ingat siklusnya: $\\sin \\to \\cos \\to -\\sin \\to -\\cos$."}</MathText>,
 },
 {
 id: "chain",
 front: <MathText>{"Aturan rantai: $(f \\circ g)'(x) = \\;?$"}</MathText>,
 back: <MathText>{"$f'(g(x)) \\cdot g'(x)$"}</MathText>,
 note: <>Turunkan fungsi luar, lalu kalikan turunan fungsi dalam.</>,
 },
];

async function StreakStrip() {
 const t = await getTranslations("marketing");
 const week = [
  { day: t("home.days.mon"), done: true },
  { day: t("home.days.tue"), done: true },
  { day: t("home.days.wed"), done: true },
  { day: t("home.days.thu"), done: true },
  { day: t("home.days.fri"), done: true },
  { day: t("home.days.sat"), done: true, today: true },
  { day: t("home.days.sun"), done: false },
 ];
 return (
 <div className="mt-5 border-t border-border pt-4">
 <div className="flex items-center justify-between gap-3">
 <div className="flex gap-1.5">
 {week.map((entry) => (
 <div key={entry.day} className="flex flex-col items-center gap-1">
 <span
 className={cn(
 "flex size-7 items-center justify-center rounded-md border text-[10px] font-bold",
 entry.done
 ? "border-transparent bg-[var(--zx-accent)]/85 text-white"
 : "border-border bg-muted/40 text-muted-foreground",
 entry.today && "ring-2 ring-[var(--zx-accent)]/40 ring-offset-1 ring-offset-card",
 )}
 aria-label={t("home.streakDayStatus", { day: entry.day, status: entry.done ? t("home.streakDone") : t("home.streakPending") })}
 >
 {entry.day.charAt(0)}
 </span>
 </div>
 ))}
 </div>
 <p className="flex items-center justify-end gap-1 text-right text-body-xs font-semibold text-foreground">
 <Flame className="size-3.5 text-[var(--zx-accent)]" aria-hidden="true" />
  {t("home.streakDays", { count: 6 })}
  </p>
  </div>
 </div>
 );
}

export async function LandingDemoFlashcards() {
 const t = await getTranslations("marketing");
 return (
 <SectionContainer className="bg-background" aria-labelledby="landing-flashcards-heading">
 <div className="grid min-w-0 items-center gap-12 lg:grid-cols-2 lg:gap-16">
 <div className="min-w-0 max-w-xl">
 <SectionHeading as="h2" id="landing-flashcards-heading" className="text-foreground">
 {t("home.flashcardsTitle")}
 </SectionHeading>
 <p className="mt-4 text-body-base text-muted-foreground">
 {t("home.flashcardsDescription")}
 </p>
 </div>

 <LandingVisible className="min-w-0">
 <div className="landing-rise">
  <DemoFrame title={t("home.flashcardsFrameTitle")}>
 <FlashcardDemo cards={cards} />
 <StreakStrip />
 </DemoFrame>
 </div>
 </LandingVisible>
 </div>
 </SectionContainer>
 );
}
