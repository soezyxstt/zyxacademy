import { ArrowRight, Check } from "lucide-react";
import { MathText } from "@/components/course/math-text";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { LandingVisible } from "@/components/landing/landing-visible";
import { QuizDemo, type QuizDemoOption } from "@/components/landing/demo/quiz-demo";

const checklist = [
 <>
 Disusun dari <strong className="font-semibold text-foreground">materi kuliah yang dipilih</strong>
 dan konsep yang sedang dilatih
 </>,
 <>
 Pembahasan <strong className="font-semibold text-foreground">langkah demi langkah</strong> untuk
 tiap jawaban salah
 </>,
 <>Terhubung ke bab materi untuk review cepat</>,
];

const options: QuizDemoOption[] = [
 { id: "a", content: <MathText>{"$2$"}</MathText>, correct: false },
 { id: "b", content: <MathText>{"$1$"}</MathText>, correct: true },
 { id: "c", content: <MathText>{"$\\tfrac{1}{2}$"}</MathText>, correct: false },
 { id: "d", content: <MathText>{"$x^2$"}</MathText>, correct: false },
];

function CorrectPanel() {
 return (
 <div className="rounded-lg border border-status-success/40 bg-status-success/10 px-4 py-3">
 <p className="flex items-center gap-1.5 text-body-sm font-semibold text-status-success">
 <Check className="size-4" aria-hidden />
 Benar!
 </p>
 <p className="mt-1 text-body-sm text-foreground">
 <MathText>
 {"$\\int_0^1 2x\\,dx = \\left[x^2\\right]_0^1 = 1^2 - 0^2 = 1$."}
 </MathText>
 </p>
 </div>
 );
}

function WrongPanel() {
 return (
 <div className="border-l-2 border-status-warning bg-status-warning/10 px-4 py-3">
 <p className="text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
 Kenapa salah?
 </p>
 <p className="mt-1 font-heading text-body-sm font-semibold text-foreground">
 Miskonsepsi: lupa mengevaluasi batas integral
 </p>
 <div className="mt-2 space-y-1 text-body-sm text-foreground">
 <p>
 1. Antiturunan dari <MathText>{"$2x$"}</MathText> memang{" "}
 <MathText>{"$x^2$"}</MathText> ; tapi ini integral <em>tentu</em>.
 </p>
 <p>
 2. Evaluasi batasnya:{" "}
 <MathText>{"$\\left[x^2\\right]_0^1 = 1 - 0 = 1$."}</MathText>
 </p>
 </div>
 <p className="mt-2.5 inline-flex items-center gap-1 text-body-sm font-semibold text-primary">
 Review <ArrowRight className="size-3.5" aria-hidden /> Bab 4 · Integral Tentu
 </p>
 </div>
 );
}

export function LandingDemoQuiz() {
 return (
 <SectionContainer className="bg-background" aria-labelledby="landing-quiz-heading">
 <div className="grid min-w-0 items-center gap-12 lg:grid-cols-2 lg:gap-16">
 <div className="min-w-0 max-w-xl">
 <SectionHeading as="h2" id="landing-quiz-heading" className="text-foreground">
 Salah itu bagian dari rencana.
 </SectionHeading>
 <p className="mt-4 text-body-base text-muted-foreground">
 Setiap jawaban salah dijelaskan: di mana keliru, miskonsepsi apa yang terjadi, dan
 harus review ke mana.
 </p>
 <ul className="mt-6 space-y-3">
 {checklist.map((item, index) => (
 <li key={index} className="flex items-start gap-2.5 text-body-sm text-muted-foreground">
 <Check className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden />
 <span>{item}</span>
 </li>
 ))}
 </ul>
 </div>

 <LandingVisible className="relative min-w-0">
 <div className="bg-landing-dots pointer-events-none absolute -inset-6 -z-10 rounded-3xl opacity-70" aria-hidden />
 <div className="landing-rise">
 <QuizDemo
 prompt={<MathText>{"Hitung $\\int_0^1 2x\\,dx$"}</MathText>}
 options={options}
 correctPanel={<CorrectPanel />}
 wrongPanel={<WrongPanel />}
 />
 </div>
 </LandingVisible>
 </div>
 </SectionContainer>
 );
}
