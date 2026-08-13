import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { TryoutForm } from "@/components/course/tryout-form";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
// Fixture imports removed
import { getCourse } from "@/lib/course-utils";
import { db } from "@/db";
import { exams, questions } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Props = { params: Promise<{ id: string; tryoutId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, tryoutId } = await params;
  const course = await getCourse(id);
  
  let examTitle = "Tryout";
  const [dbExam] = await db.select({ title: exams.title }).from(exams).where(eq(exams.id, tryoutId)).limit(1);
  if (dbExam) examTitle = dbExam.title;

  return {
    title: pageTitle(course ? `${course.title} - ${examTitle}` : "Tryout"),
    description: course
      ? `Kerjakan ${examTitle}; simulasi ujian ${course.title}.`
      : `Kerjakan ${examTitle}; simulasi ujian.`,
  };
}

export default async function CourseTryoutTakePage({ params }: Props) {
  const { id, tryoutId } = await params;
  const course = await getCourse(id);
  if (!course) notFound();

  let exam = null;
  const [dbExam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.id, tryoutId), eq(exams.courseId, id), eq(exams.type, "tryout")))
    .limit(1);

  if (dbExam) {
    const dbQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.examId, tryoutId))
      .orderBy(asc(questions.order));

    const settings = typeof dbExam.settings === "string" ? JSON.parse(dbExam.settings) : dbExam.settings;

    exam = {
      id: dbExam.id,
      courseId: id,
      title: dbExam.title,
      type: "tryout" as const,
      status: dbExam.status,
      settings: settings || { timeLimitMinutes: 90, maxAttempts: 2 },
      questions: dbQuestions.map((q) => {
        const content = typeof q.content === "string" ? JSON.parse(q.content) : q.content;
        return {
          id: q.id,
          order: q.order,
          type: q.type as any,
          prompt: content.prompt,
          options: content.options || [],
          correctIndex: content.correctIndex,
          correctIndices: content.correctIndices || [],
          acceptsImage: content.acceptsImage,
          acceptsFile: content.acceptsFile,
          acceptableAnswers: content.acceptableAnswers || [],
          origin: content.origin,
          sourceEventName: content.sourceEventName,
          sourceReferenceId: content.sourceReferenceId,
        };
      }),
    };
  }

  if (!exam || exam.type !== "tryout") notFound();

  // Enforce openAt and closeAt check
  const now = new Date();
  const openDate = dbExam.openAt ? new Date(dbExam.openAt) : null;
  const closeDate = dbExam.closeAt ? new Date(dbExam.closeAt) : null;

  if (openDate && now < openDate) {
    return (
      <CoursePageShell title="Tryout Belum Dibuka" description={exam.title} hideHeader>
        <Reveal>
          <div className="rounded-lg border border-border/70 bg-card/75 p-5 backdrop-blur-sm text-center">
            <h3 className="font-heading text-body-lg font-bold text-foreground">Tryout Belum Dibuka</h3>
            <p className="mt-2 text-body-sm text-muted-foreground">
              Tryout ini dijadwalkan untuk dibuka pada tanggal{" "}
              <strong className="text-foreground">{openDate.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</strong>.
            </p>
            <div className="mt-5">
              <Button asChild variant="outline" size="sm" className="rounded-md border-border/80">
                <Link href={`/courses/${id}/tryout`}>Kembali ke Daftar Tryout</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  if (closeDate && now > closeDate) {
    return (
      <CoursePageShell title="Tryout Sudah Ditutup" description={exam.title} hideHeader>
        <Reveal>
          <div className="rounded-lg border border-border/70 bg-card/75 p-5 backdrop-blur-sm text-center">
            <h3 className="font-heading text-body-lg font-bold text-foreground">Tryout Sudah Ditutup</h3>
            <p className="mt-2 text-body-sm text-muted-foreground">
              Akses tryout ini telah berakhir sejak tanggal{" "}
              <strong className="text-foreground">{closeDate.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</strong>.
            </p>
            <div className="mt-5">
              <Button asChild variant="outline" size="sm" className="rounded-md border-border/80">
                <Link href={`/courses/${id}/tryout`}>Kembali ke Daftar Tryout</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  const isEnrolled = await checkEnrollment(id);

  if (!isEnrolled) {
    return (
      <CoursePageShell title="Tryout terkunci" description={`${course.title} · tryout premium`} hideHeader>
        <Reveal>
          <div className="rounded-lg border border-border/70 bg-card/75 p-4 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                <Lock className="size-5" />
              </div>
              <div>
                <h3 className="font-heading text-body-base font-bold text-foreground">Butuh token kelas</h3>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Aktifkan kelas untuk membuka &ldquo;{exam.title}&rdquo;.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <EnrollmentForm />
            </div>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  return (
    <CoursePageShell title={exam.title} description="Kerjakan sesuai waktu; esai dinilai pengajar." hideHeader>
      <Reveal>
        <TryoutForm courseId={id} exam={exam} />
      </Reveal>
    </CoursePageShell>
  );
}
