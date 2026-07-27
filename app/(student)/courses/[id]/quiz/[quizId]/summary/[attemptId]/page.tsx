import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { studentQuizAttempts, quizTemplates, courses } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { QuizAnalyticsView } from "@/components/course/quiz-analytics-view";
import { ArrowLeft, BookOpen, ChevronRight } from "lucide-react";

type Props = {
  params: Promise<{ id: string; quizId: string; attemptId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { quizId } = await params;
  const [template] = await db
    .select({ title: quizTemplates.title })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, quizId))
    .limit(1);

  return {
    title: pageTitle(template ? `${template.title} - Diagnosis Pembelajaran` : "Diagnosis Pembelajaran"),
    description: "Diagnosis pembelajaran dan rencana belajar personal hasil kuis Anda.",
  };
}

export default async function QuizSummaryPage({ params }: Props) {
  const { id, quizId, attemptId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) notFound();

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, id))
    .limit(1);

  if (!course) notFound();

  const [attempt] = await db
    .select()
    .from(studentQuizAttempts)
    .where(
      and(
        eq(studentQuizAttempts.id, attemptId),
        eq(studentQuizAttempts.studentId, session.user.id)
      )
    )
    .limit(1);

  if (!attempt) notFound();

  const [template] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, quizId))
    .limit(1);

  return (
    <CoursePageShell
      eyebrow={
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-widest">
          <Link href={`/courses/${id}/quiz`} className="hover:text-primary transition-colors">Kuis</Link>
          <ChevronRight className="size-3" />
          <span className="truncate max-w-[200px]">{template?.title || "Kuis"}</span>
        </div>
      }
      title="Diagnosis Pembelajaran & Rencana Belajar"
      description={template?.title || course.title}
      hideHeader
    >
      <Reveal>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/60">
            <Button asChild variant="outline" size="sm" className="rounded-md border-border/80 text-muted-foreground hover:text-foreground">
              <Link href={`/courses/${id}/quiz/${quizId}?attemptId=${attemptId}`}>
                <ArrowLeft className="mr-1.5 size-4" />
                Lihat Pembahasan Jawaban
              </Link>
            </Button>

            <div className="flex items-center gap-2">
              <Button asChild variant="secondary" size="sm" className="rounded-md">
                <Link href={`/courses/${id}/quiz/${quizId}`}>
                  <BookOpen className="mr-1.5 size-4" />
                  Coba Ulang Kuis
                </Link>
              </Button>
            </div>
          </div>

          <QuizAnalyticsView attemptId={attemptId} courseId={id} />
        </div>
      </Reveal>
    </CoursePageShell>
  );
}
