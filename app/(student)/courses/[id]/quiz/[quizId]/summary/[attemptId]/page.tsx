import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata, pageTitle } from "@/lib/site";
import { db } from "@/db";
import { studentQuizAttempts, quizTemplates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { QuizAnalyticsView } from "@/components/course/quiz-analytics-view";
import { ArrowLeft, BookOpen, ChevronRight } from "lucide-react";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";

type Props = {
  params: Promise<{ id: string; quizId: string; attemptId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, quizId, attemptId } = await params;
  const [template] = await db
    .select({ title: quizTemplates.title })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, quizId))
    .limit(1);

  return createMetadata({
    title: template ? `Diagnosis ${template.title}` : "Diagnosis Pembelajaran",
    description: "Diagnosis pembelajaran dan rencana belajar personal hasil pengerjaan kuis.",
    path: `/courses/${id}/quiz/${quizId}/summary/${attemptId}`,
  });
}


export default async function QuizSummaryPage({ params }: Props) {
  const { id, quizId, attemptId } = await params;

  const session = await getAuthSession();
  if (!session?.user) notFound();

  const course = await getCourse(id);

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
      title="Diagnosis Pembelajaran & Rencana Belajar"
      description={template?.title || course.title}
      hideHeader
    >
      <Reveal>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="rounded-md border-border/80 text-muted-foreground hover:text-foreground">
                <Link href={`/courses/${id}/quiz/${quizId}?attemptId=${attemptId}`}>
                  <ArrowLeft className="mr-1.5 size-4" />
                  Lihat Pembahasan Soal
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="rounded-md text-body-xs text-muted-foreground hover:text-foreground">
                <Link href={`/courses/${id}/my-results`}>
                  Riwayat Ujian
                </Link>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild variant="secondary" size="sm" className="rounded-md">
                <Link href={`/courses/${id}/quiz/${quizId}`}>
                  <BookOpen className="mr-1.5 size-4" />
                  Coba Ulang Kuis
                </Link>
              </Button>
            </div>
          </div>

          {attempt.gradingStatus === "pending" ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center space-y-4">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <BookOpen className="size-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="font-heading text-body-base font-bold text-foreground">
                  Menunggu penilaian
                </h3>
                <p className="text-body-sm text-muted-foreground">
                  Jawaban esai Anda telah tersimpan dan sedang menunggu penilaian dari tutor. Nilai akhir dan diagnosis lengkap akan ditampilkan setelah proses koreksi selesai.
                </p>
              </div>
            </div>
          ) : (
            <QuizAnalyticsView attemptId={attemptId} courseId={course.legacyId ?? id} />
          )}
        </div>
      </Reveal>
    </CoursePageShell>
  );
}
