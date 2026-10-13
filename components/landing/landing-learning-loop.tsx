import {
 BookOpen,
 Check,
 Layers,
 Lock,
 Minus,
 ClipboardList,
 TrendingDown,
 TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/course/math-text";
import {
 quizOptionClasses,
 quizOptionLetterClasses,
} from "@/components/course/quiz-option-styles";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { DemoFrame } from "@/components/landing/demo/demo-frame";
import { LandingScrollSteps, type ScrollStep } from "@/components/landing/landing-scroll-steps";
import { LandingVisible } from "@/components/landing/landing-visible";

/* ── Step copy ──────────────────────────────────────────── */

function StepCopy({
 index,
 title,
 body,
}: {
 index: number;
 title: string;
 body: string;
}) {
 return (
 <div>
 <p className="font-heading text-4xl font-bold text-border md:text-5xl" aria-hidden>
 0{index}
 </p>
 <h3 className="mt-2 font-heading text-body-base font-semibold text-foreground">
 {title}
 </h3>
 <p className="mt-3 max-w-prose text-body-base text-muted-foreground">{body}</p>
 </div>
 );
}

/* ── Pane 1: mastery diagnosis ──────────────────────────── */

const masteryRows = [
 { name: "Limit Fungsi", score: 92, tone: "success", trend: "up" },
 { name: "Turunan", score: 78, tone: "success", trend: "up" },
 { name: "Integral Parsial", score: 41, tone: "warning", trend: "flat" },
 { name: "Volume Benda Putar", score: 23, tone: "error", trend: "down" },
] as const;

const masteryBarTone = {
 success: "bg-status-success",
 warning: "bg-status-warning",
 error: "bg-status-error",
} as const;

function TrendIcon({ trend }: { trend: "up" | "flat" | "down" }) {
 if (trend === "up") return <TrendingUp className="size-3.5 text-status-success" aria-label="Tren naik" />;
 if (trend === "down") return <TrendingDown className="size-3.5 text-status-error" aria-label="Tren turun" />;
 return <Minus className="size-3.5 text-muted-foreground" aria-label="Tren stabil" />;
}

function MasteryPane() {
 return (
 <DemoFrame title="Peta Penguasaan · Kalkulus IA" className="h-full" bodyClassName="flex h-[calc(100%-2.25rem)] flex-col justify-center gap-4">
 {masteryRows.map((row, index) => (
 <div key={row.name}>
 <div className="flex items-center justify-between gap-2 text-body-sm">
 <span className="flex items-center gap-1.5 font-medium text-foreground">
 {row.name}
 <TrendIcon trend={row.trend} />
 </span>
 <span className="font-mono text-body-xs font-semibold text-muted-foreground">{row.score}</span>
 </div>
 <div className="mt-1.5 h-2 overflow-hidden rounded-md bg-muted">
 <div
 className={cn("landing-bar h-full rounded-md", masteryBarTone[row.tone])}
 style={{ width: `${row.score}%`, animationDelay: `${index * 120}ms` }}
 />
 </div>
 </div>
 ))}
 </DemoFrame>
 );
}

/* ── Pane 2: daily plan + streak ────────────────────────── */

const planItems = [
 { icon: Layers, label: "12 flashcard jatuh tempo", meta: "± 5 mnt", done: true },
 { icon: ClipboardList, label: "Kuis: Integral Parsial", meta: "10 soal", done: false },
 { icon: BookOpen, label: "Materi: Volume Benda Putar", meta: "12 mnt baca", done: false },
];

function DailyPlanPane() {
 return (
 <DemoFrame title="Rencana Hari Ini" className="h-full" bodyClassName="flex h-[calc(100%-2.25rem)] flex-col justify-center">
 <div className="flex items-center justify-between gap-3">
 <p className="font-heading text-body-base font-semibold text-foreground">Halo, Salsa</p>
 <span className="rounded-md border border-[var(--zx-accent)]/40 bg-[var(--zx-accent)]/10 px-2 py-0.5 text-body-xs font-semibold text-[var(--zx-accent)]">
  6 hari beruntun
 </span>
 </div>
 <div className="mt-4 divide-y divide-border border-y border-border">
 {planItems.map((item) => (
 <div key={item.label} className="flex items-center gap-3 py-3.5">
 <span
 className={cn(
 "flex size-5 shrink-0 items-center justify-center rounded-full border",
 item.done
 ? "border-status-success bg-status-success text-white"
 : "border-border-strong bg-background",
 )}
 aria-hidden
 >
 {item.done ? <Check className="size-3" /> : null}
 </span>
 <item.icon className="size-4 shrink-0 text-primary" aria-hidden />
 <span
 className={cn(
 "flex-1 text-body-sm font-medium",
 item.done ? "text-muted-foreground line-through" : "text-foreground",
 )}
 >
 {item.label}
 </span>
 <span className="shrink-0 text-body-xs text-muted-foreground">{item.meta}</span>
 </div>
 ))}
 </div>
 </DemoFrame>
 );
}

/* ── Pane 3: targeted practice ──────────────────────────── */

function PracticePane() {
 return (
 <DemoFrame
 title="Kuis Mingguan #4"
 className="h-full"
 bodyClassName="flex h-[calc(100%-2.25rem)] flex-col justify-center"
 >
 <div className="font-heading text-body-sm font-bold text-foreground md:text-body-base">
 <MathText>{"Turunan dari $f(x) = x^2 \\sin x$ adalah …"}</MathText>
 </div>
 <ul className="mt-4 space-y-2.5">
 <li>
 <div className={quizOptionClasses("idle")}>
 <span className={quizOptionLetterClasses("idle")}>A</span>
 <span className="flex-1 text-foreground">
 <MathText>{"$2x \\sin x$"}</MathText>
 </span>
 </div>
 </li>
 <li>
 <div className={quizOptionClasses("correct")}>
 <span className={quizOptionLetterClasses("correct")}>B</span>
 <span className="flex-1 text-foreground">
 <MathText>{"$2x \\sin x + x^2 \\cos x$"}</MathText>
 </span>
 <Check className="size-4 shrink-0 text-status-success" aria-label="Jawaban benar" />
 </div>
 </li>
 </ul>
 <p className="mt-4 text-body-xs text-muted-foreground">
 Soal dipilih dari konsep terlemahmu minggu ini: <span className="font-semibold text-foreground">aturan hasil kali</span>.
 </p>
 </DemoFrame>
 );
}

/* ── Pane 4: mastery unlock path ────────────────────────── */

const pathNodes = [
 { name: "Turunan", status: "done", note: "dikuasai · 88" },
 { name: "Aturan Rantai", status: "active", note: "sedang dipelajari · 54" },
 { name: "Integral", status: "locked", note: "terbuka setelah Aturan Rantai" },
] as const;

function UnlockPane() {
 return (
 <DemoFrame title="Jalur Belajar · Kalkulus IA" className="h-full" bodyClassName="flex h-[calc(100%-2.25rem)] flex-col justify-center">
 <div className="flex flex-col">
 {pathNodes.map((node, index) => (
 <div key={node.name} className="flex gap-4">
 <div className="flex flex-col items-center">
 <span
 className={cn(
 "flex size-9 shrink-0 items-center justify-center rounded-full border-2",
 node.status === "done" && "border-status-success bg-status-success/10 text-status-success",
 node.status === "active" && "border-primary bg-primary/10 text-primary ring-4 ring-primary/15",
 node.status === "locked" && "border-border bg-muted/40 text-muted-foreground",
 )}
 aria-hidden
 >
 {node.status === "done" ? (
 <Check className="size-4" />
 ) : node.status === "locked" ? (
 <Lock className="size-4" />
 ) : (
 <span className="size-2.5 rounded-full bg-primary" />
 )}
 </span>
 {index < pathNodes.length - 1 ? (
 <span className="my-1 h-10 w-px bg-border" aria-hidden />
 ) : null}
 </div>
 <div className="pb-6">
 <p
 className={cn(
 "font-heading text-body-base font-semibold",
 node.status === "locked" ? "text-muted-foreground" : "text-foreground",
 )}
 >
 {node.name}
 </p>
 <p className="mt-0.5 text-body-xs text-muted-foreground">{node.note}</p>
 </div>
 </div>
 ))}
 </div>
 <p className="text-body-xs text-muted-foreground">
 Skor stabil di atas 70 membuka konsep berikutnya secara otomatis.
 </p>
 </DemoFrame>
 );
}

/* ── Section ────────────────────────────────────────────── */

const loopSteps: ScrollStep[] = [
 {
 id: "diagnosa",
 copy: (
 <StepCopy
 index={1}
 title="Diagnosa"
 body="Setiap kuis dan flashcard yang kamu kerjakan memperbarui skor penguasaan per konsep ; bukan sekadar nilai akhir."
 />
 ),
 pane: (
 <LandingVisible className="h-full min-w-0">
 <MasteryPane />
 </LandingVisible>
 ),
 },
 {
 id: "rencana",
 copy: (
 <StepCopy
 index={2}
 title="Rencana harian"
  body="Dashboard merangkum agenda: 12 flashcard, 1 kuis, dan 1 materi, supaya kamu punya titik mulai yang jelas."
 />
 ),
 pane: (
 <LandingVisible className="h-full min-w-0">
 <DailyPlanPane />
 </LandingVisible>
 ),
 },
 {
 id: "latihan",
 copy: (
 <StepCopy
 index={3}
 title="Latihan terarah"
 body="Kuis disusun dari materi kuliahmu sendiri ; menyesuaikan konsep yang paling lemah, lengkap dengan pembahasan."
 />
 ),
 pane: (
 <LandingVisible className="h-full min-w-0">
 <PracticePane />
 </LandingVisible>
 ),
 },
 {
 id: "kuasai",
 copy: (
 <StepCopy
 index={4}
 title="Kuasai, lalu lanjut"
 body="Konsep dianggap dikuasai saat skornya stabil di atas 70. Jalur belajarmu membuka konsep berikutnya secara otomatis."
 />
 ),
 pane: (
 <LandingVisible className="h-full min-w-0">
 <UnlockPane />
 </LandingVisible>
 ),
 },
];

export function LandingLearningLoop() {
 return (
 <SectionContainer
 className="border-y border-border/80 bg-[var(--color-surface)]/45"
 aria-labelledby="landing-loop-heading"
 >
 <div className="mx-auto max-w-2xl text-center">
  <SectionHeading as="h2" id="landing-loop-heading" className="text-foreground">
  Belajar dari apa yang perlu kamu kuasai.
  </SectionHeading>
  </div>

 <LandingScrollSteps className="mt-16 md:mt-20" steps={loopSteps} />
 </SectionContainer>
 );
}
