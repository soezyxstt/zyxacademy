import type { ReactNode } from "react";
import { BookOpen, FileQuestion } from "lucide-react";
import { MathText } from "@/components/course/math-text";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { LandingVisible } from "@/components/landing/landing-visible";
import { TutorChatDemo, type TutorChatMessage } from "@/components/landing/demo/tutor-chat-demo";

function SourceTag({ icon, children }: { icon: ReactNode; children: ReactNode }) {
 return (
 <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-body-xs font-medium text-foreground">
 {icon}
 {children}
 </span>
 );
}

const messages: TutorChatMessage[] = [
 {
 id: "q1",
 role: "student",
 content: <>Kenapa jawabanku salah di soal volume benda putar kemarin?</>,
 },
 {
 id: "a1",
 role: "ai",
 content: (
 <MathText>
 {"Kamu memakai metode cakram, padahal daerahnya diputar mengelilingi sumbu $y$ ; di kasus ini metode cangkang lebih tepat: $V = 2\\pi\\int_a^b x\\,f(x)\\,dx$."}
 </MathText>
 ),
 sources: (
 <>
 <SourceTag icon={<BookOpen className="size-3 text-primary" aria-hidden />}>
 Bab 5 · Volume Benda Putar
 </SourceTag>
 <SourceTag icon={<FileQuestion className="size-3 text-primary" aria-hidden />}>
 Kuis Mingguan #4 · Soal 8
 </SourceTag>
 </>
 ),
 },
 {
 id: "q2",
 role: "student",
 content: <>Bedanya kapan pakai cakram vs cangkang?</>,
 },
 {
 id: "a2",
 role: "ai",
 content: (
 <>
 Patokan cepat: irisan <em>tegak lurus</em> sumbu putar → cakram; irisan <em>sejajar</em>{" "}
 sumbu putar → cangkang.
 </>
 ),
 sources: (
 <SourceTag icon={<BookOpen className="size-3 text-primary" aria-hidden />}>
 Bab 5.2 · Memilih Metode
 </SourceTag>
 ),
 },
];

export function LandingDemoTutor() {
 return (
 <SectionContainer
 className="border-y border-border/80 bg-[var(--color-surface)]/45"
 aria-labelledby="landing-tutor-heading"
 >
 <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
 <LandingVisible className="order-2 lg:order-1">
 <div className="landing-rise">
 <TutorChatDemo messages={messages} />
 </div>
 </LandingVisible>

 <div className="order-1 max-w-xl lg:order-2">
 <SectionHeading as="h2" id="landing-tutor-heading" className="text-foreground">
 Jawaban bertumpu pada materi yang tersedia.
 </SectionHeading>
 <p className="mt-4 text-body-base text-muted-foreground">
 Zyra dapat menjawab berdasarkan materi kuliah yang tersedia dan menyebutkan sumbernya ; bab,
 contoh soal, sampai kuis yang terkait.
 </p>
 <p className="mt-3 text-body-sm italic text-muted-foreground">
 Jika materi yang tersedia belum cukup, batas jawabannya perlu diperiksa kembali.
 </p>
 </div>
 </div>
 </SectionContainer>
 );
}
