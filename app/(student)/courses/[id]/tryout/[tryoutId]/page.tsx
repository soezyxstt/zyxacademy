import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lock, ArrowLeft } from "lucide-react";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { TryoutForm } from "@/components/course/tryout-form";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata} from "@/lib/site";


// Fixture imports removed
import { getCourse } from "@/lib/course-utils";
import { db } from "@/db";
import { exams, questions } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ExamFixture } from "@/lib/student-course-fixtures";
import { TranslatedText } from "@/components/i18n/translated-text";
import { FormattedDate } from "@/components/ui/formatted-date";
import { getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ id: string; tryoutId: string }> };

function publicOptionTexts(value: unknown): string[] {
  const options = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  return options
    .map((option) => {
      if (typeof option === "string") return option;
      if (!option || typeof option !== "object" || Array.isArray(option)) return null;
      const record = option as Record<string, unknown>;
      for (const key of ["text", "label", "value", "content"]) {
        if (typeof record[key] === "string") return record[key];
      }
      return null;
    })
    .filter((option): option is string => option !== null);
}

function publicExamSettings(value: unknown): ExamFixture["settings"] {
  const parsed = typeof value === "string"
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      })()
    : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { timeLimitMinutes: 90, maxAttempts: 2 };
  }

  const settings = parsed as Record<string, unknown>;
  return {
    ...(typeof settings.timeLimitMinutes === "number" ? { timeLimitMinutes: settings.timeLimitMinutes } : {}),
    ...(typeof settings.maxAttempts === "number" ? { maxAttempts: settings.maxAttempts } : {}),
    ...(typeof settings.oneTimeOnly === "boolean" ? { oneTimeOnly: settings.oneTimeOnly } : {}),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, tryoutId } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");
  
  let examTitle = t("metadata.tryoutTitleFallback");
  const [dbExam] = await db.select({ title: exams.title }).from(exams).where(eq(exams.id, tryoutId)).limit(1);
  if (dbExam) examTitle = dbExam.title;

  return createMetadata({
    title: course ? `${examTitle} (${course.title})` : examTitle,
    description: course ? t("metadata.tryoutDetailDescription", { title: examTitle, course: course.title }) : t("metadata.tryoutDescription"),
    path: `/courses/${id}/tryout/${tryoutId}`,
  });
}


export default async function CourseTryoutTakePage({ params }: Props) {
  const { id, tryoutId } = await params;
  const course = await getCourse(id);
  if (!course) notFound();

  let exam = null;
  const [dbExam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.id, tryoutId), eq(exams.courseId, course.legacyId ?? id), eq(exams.type, "tryout")))
    .limit(1);

  if (dbExam) {
    const dbQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.examId, tryoutId))
      .orderBy(asc(questions.order));

    exam = {
      id: dbExam.id,
      courseId: id,
      title: dbExam.title,
      type: "tryout" as const,
      status: dbExam.status,
      settings: publicExamSettings(dbExam.settings),
      questions: dbQuestions.map((q) => {
        const content = typeof q.content === "string" ? JSON.parse(q.content) : q.content;
        return {
          id: q.id,
          order: q.order,
          type: q.type as any,
          prompt: content.prompt,
          options: publicOptionTexts(content.options),
          acceptsImage: content.acceptsImage,
          acceptsFile: content.acceptsFile,
          origin: content.origin,
          sourceEventName: content.sourceEventName,
          sourceReferenceId: content.sourceReferenceId,
        };
      }),
    } as unknown as ExamFixture;
  }

  if (!exam || exam.type !== "tryout") notFound();

  // Enforce openAt and closeAt check
  const now = new Date();
  const openDate = dbExam.openAt ? new Date(dbExam.openAt) : null;
  const closeDate = dbExam.closeAt ? new Date(dbExam.closeAt) : null;

  if (openDate && now < openDate) {
    return (
      <CoursePageShell title={<TranslatedText namespace="learning" messageKey="tryoutTake.notOpen" />} description={exam.title} hideHeader>
        <Reveal>
          <div className="rounded-lg border border-border/70 bg-card p-5 text-center">
            <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="tryoutTake.notOpen" /></h3>
            <p className="mt-2 text-body-sm text-muted-foreground">
              <TranslatedText namespace="learning" messageKey="tryoutTake.opensOn" />{" "}
              <strong className="text-foreground"><FormattedDate date={openDate} options={{ dateStyle: "medium", timeStyle: "short" }} /></strong>.
            </p>
            <div className="mt-5">
              <Button asChild variant="outline" size="sm" className="rounded-md border-border/80">
                <Link href={`/courses/${id}/tryout`}><TranslatedText namespace="learning" messageKey="tryoutTake.backToList" /></Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  if (closeDate && now > closeDate) {
    return (
      <CoursePageShell title={<TranslatedText namespace="learning" messageKey="tryoutTake.closed" />} description={exam.title} hideHeader>
        <Reveal>
          <div className="rounded-lg border border-border/70 bg-card p-5 text-center">
            <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="tryoutTake.closed" /></h3>
            <p className="mt-2 text-body-sm text-muted-foreground">
              <TranslatedText namespace="learning" messageKey="tryoutTake.closedSince" />{" "}
              <strong className="text-foreground"><FormattedDate date={closeDate} options={{ dateStyle: "medium", timeStyle: "short" }} /></strong>.
            </p>
            <div className="mt-5">
              <Button asChild variant="outline" size="sm" className="rounded-md border-border/80">
                <Link href={`/courses/${id}/tryout`}><TranslatedText namespace="learning" messageKey="tryoutTake.backToList" /></Link>
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
      <CoursePageShell title={<TranslatedText namespace="learning" messageKey="tryoutTake.locked" />} description={<TranslatedText namespace="learning" messageKey="tryoutTake.premiumDescription" values={{ course: course.title }} />} hideHeader>
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-body-xs font-semibold text-muted-foreground hover:text-foreground">
            <Link href={`/courses/${id}/tryout`}>
              <ArrowLeft className="size-3.5" />
              <span><TranslatedText namespace="learning" messageKey="tryoutTake.backToList" /></span>
            </Link>
          </Button>
        </div>
        <Reveal>
          <div className="rounded-lg border border-border/70 bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                <Lock className="size-5" />
              </div>
              <div>
                <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="tryoutTake.needToken" /></h3>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  <TranslatedText namespace="learning" messageKey="tryoutTake.activateToOpen" values={{ exam: exam.title }} />
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
    <CoursePageShell title={exam.title} description={<TranslatedText namespace="learning" messageKey="tryoutTake.instructions" />} hideHeader>
      <Reveal>
        <TryoutForm courseId={id} exam={exam} />
      </Reveal>
    </CoursePageShell>
  );
}
