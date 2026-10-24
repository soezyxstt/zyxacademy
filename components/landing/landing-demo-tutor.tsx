import type { ReactNode } from "react";
import { BookOpen, FileQuestion } from "lucide-react";
import { MathText } from "@/components/course/math-text";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { LandingVisible } from "@/components/landing/landing-visible";
import { TutorChatDemo, type TutorChatMessage } from "@/components/landing/demo/tutor-chat-demo";
import { getTranslations } from "@/lib/i18n/server";

function SourceTag({ icon, children }: { icon: ReactNode; children: ReactNode }) {
 return (
 <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-body-xs font-medium text-foreground">
 {icon}
 {children}
 </span>
 );
}

export async function LandingDemoTutor() {
 const t = await getTranslations("marketing");
 const messages: TutorChatMessage[] = [
  { id: "q1", role: "student", content: <>{t("home.tutorQuestion1")}</> },
  {
   id: "a1", role: "ai",
   content: <MathText>{t("home.tutorAnswer1")}</MathText>,
   sources: <>
    <SourceTag icon={<BookOpen className="size-3 text-primary" aria-hidden />}>Bab 5 · Volume Benda Putar</SourceTag>
    <SourceTag icon={<FileQuestion className="size-3 text-primary" aria-hidden />}>Kuis Mingguan #4 · Soal 8</SourceTag>
   </>,
  },
  { id: "q2", role: "student", content: <>{t("home.tutorQuestion2")}</> },
  { id: "a2", role: "ai", content: <>{t("home.tutorAnswer2")}</>, sources: <SourceTag icon={<BookOpen className="size-3 text-primary" aria-hidden />}>Bab 5.2 · Memilih Metode</SourceTag> },
 ];
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
 {t("home.tutorTitle")}
 </SectionHeading>
 <p className="mt-4 text-body-base text-muted-foreground">
 {t("home.tutorDescription")}
 </p>
 <p className="mt-3 text-body-sm italic text-muted-foreground">
 {t("home.tutorCaveat")}
 </p>
 </div>
 </div>
 </SectionContainer>
 );
}
