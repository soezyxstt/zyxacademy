import { FileText, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { DemoFrame } from "@/components/landing/demo/demo-frame";
import { LandingVisible } from "@/components/landing/landing-visible";

/* ── Vignette 1: live classroom quiz lobby ──────────────── */

const lobbyAvatars = ["DA", "RF", "NS"];

function LiveQuizVignette() {
 return (
  <DemoFrame tone="dark" title="Kuis Langsung" bodyClassName="p-4 text-center md:p-5">
 <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Kode gabung</p>
 <p className="mt-1 font-heading text-h3 font-bold tracking-[0.18em] text-white">X4K2P9</p>
 <div className="mt-4 flex items-center justify-center gap-2">
 <span className="flex -space-x-2" aria-hidden>
 {lobbyAvatars.map((initials, index) => (
 <span
 key={initials}
 className={cn(
 "flex size-7 items-center justify-center rounded-full border-2 border-black-3 text-[10px] font-bold text-white",
 index === 0 && "bg-primary",
 index === 1 && "bg-[var(--zx-accent)]",
 index === 2 && "bg-tertiary-1",
 )}
 >
 {initials}
 </span>
 ))}
 </span>
 </div>
 <span className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[var(--zx-accent)] px-4 py-2 text-body-sm font-bold text-white">
 <Play className="size-3.5" aria-hidden />
 Mulai
 </span>
 </DemoFrame>
 );
}

/* ── Vignette 2: cohort analytics ───────────────────────── */

const cohortRows = [
 { rank: 1, name: "Metode Cangkang", score: 38, tone: "bg-status-error" },
 { rank: 2, name: "Integral Parsial", score: 47, tone: "bg-status-warning" },
 { rank: 3, name: "Aturan Rantai", score: 61, tone: "bg-status-warning" },
];

function AnalyticsVignette() {
 return (
  <DemoFrame tone="dark" title="Analitik Kohort" bodyClassName="p-4 md:p-5">
 <p className="text-body-sm font-semibold text-white">Konsep paling bermasalah:</p>
 <div className="mt-3 space-y-3">
 {cohortRows.map((row, index) => (
 <div key={row.name}>
 <div className="flex items-center justify-between gap-2 text-body-sm">
 <span className="text-white/85">
 {row.rank}. {row.name}
 </span>
 <span className="font-mono text-body-xs font-semibold text-white/60">
 rata-rata {row.score}
 </span>
 </div>
 <div className="mt-1.5 h-1.5 overflow-hidden rounded-md bg-white/10">
 <div
 className={cn("landing-bar h-full rounded-md", row.tone)}
 style={{ width: `${row.score}%`, animationDelay: `${index * 130}ms` }}
 />
 </div>
 </div>
 ))}
 </div>
 </DemoFrame>
 );
}

/* ── Vignette 3: auto-compiled diktat PDF ───────────────── */

function DiktatVignette() {
 return (
  <DemoFrame tone="dark" title="Diktat" bodyClassName="p-4 md:p-5">
 <div className="flex items-start gap-3">
 <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-status-error/20 text-status-error" aria-hidden>
 <FileText className="size-5" />
 </span>
 <div>
 <p className="font-heading text-body-base font-semibold text-white">
 Diktat Kalkulus IA ; Bab 1-5
 </p>
  <p className="mt-1 text-body-xs text-white/60">48 halaman</p>
 </div>
 </div>
 <div className="mt-4 space-y-1.5" aria-hidden>
 <div className="h-1.5 w-full rounded-sm bg-white/10" />
 <div className="h-1.5 w-4/5 rounded-sm bg-white/10" />
 <div className="h-1.5 w-11/12 rounded-sm bg-white/10" />
 </div>
 <span className="mt-5 inline-flex items-center rounded-md border border-white/25 px-4 py-2 text-body-sm font-semibold text-white">
 Unduh PDF
 </span>
 </DemoFrame>
 );
}

/* ── Section ────────────────────────────────────────────── */

const vignettes = [
 {
 id: "live",
 node: <LiveQuizVignette />,
 },
 {
 id: "analytics",
 node: <AnalyticsVignette />,
 },
 {
 id: "diktat",
 node: <DiktatVignette />,
 },
];

export function LandingForTutors() {
 return (
 <SectionContainer className="bg-black-2" aria-labelledby="landing-tutors-heading">
 <div className="mx-auto max-w-2xl text-center">
 <SectionHeading as="h2" id="landing-tutors-heading" className="text-white">
          Bantu kelas melihat konsep yang perlu dibahas.
 </SectionHeading>
 </div>

 <LandingVisible className="mt-14">
 <div className="landing-stagger-on-visible grid gap-8 md:grid-cols-3 md:gap-6 lg:gap-8 [&>*:nth-child(1)]:[animation-delay:0ms] [&>*:nth-child(2)]:[animation-delay:120ms] [&>*:nth-child(3)]:[animation-delay:240ms]">
 {vignettes.map((vignette) => (
  <div key={vignette.id}>
  {vignette.node}
 </div>
 ))}
 </div>
 </LandingVisible>
 </SectionContainer>
 );
}
