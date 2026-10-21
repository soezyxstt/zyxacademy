import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata, pageTitle } from "@/lib/site";
import { db } from "@/db";
import { studentQuizAttempts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { QuizAnalyticsView } from "@/components/course/quiz-analytics-view";
import { ArrowLeft } from "lucide-react";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";

type Props = {
  params: Promise<{ id: string; submissionId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, submissionId } = await params;
  const course = await getCourse(id);

  return createMetadata({
    title: course ? `Diagnosis Pembelajaran ${course.title}` : "Diagnosis Pembelajaran",
    description: "Diagnosis pembelajaran dan rencana belajar personal.",
    path: `/courses/${id}/my-results/${submissionId}/summary`,
  });
}


export default async function SubmissionSummaryPage({ params }: Props) {
  const { id, submissionId } = await params;

  const session = await getAuthSession();
  if (!session?.user) notFound();

  const course = await getCourse(id);

  if (!course) notFound();

  const [attempt] = await db
    .select()
    .from(studentQuizAttempts)
    .where(
      and(
        eq(studentQuizAttempts.id, submissionId),
        eq(studentQuizAttempts.studentId, session.user.id)
      )
    )
    .limit(1);

  if (!attempt) notFound();

  return (
    <CoursePageShell title="Diagnosis Pembelajaran" description="Diagnosis dan Rencana Belajar Personal" hideHeader>
      <Reveal>
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-border/60">
            <Button asChild variant="outline" size="sm" className="rounded-md border-border/80 text-muted-foreground hover:text-foreground">
              <Link href={`/courses/${id}/my-results/${submissionId}`}>
                <ArrowLeft className="mr-1.5 size-4" />
                Kembali ke Pembahasan
              </Link>
            </Button>
          </div>

          <QuizAnalyticsView attemptId={submissionId} courseId={course.legacyId ?? id} />
        </div>
      </Reveal>
    </CoursePageShell>
  );
}
