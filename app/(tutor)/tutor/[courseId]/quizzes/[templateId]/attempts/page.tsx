import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { db } from "@/db";
import { quizTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyTutorAccess } from "@/app/actions/tutor-management";
import { QuizAttemptsSpreadsheet } from "@/app/(admin)/admin/(eval)/quiz-insights/[id]/_components/quiz-attempts-spreadsheet";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ courseId: string; templateId: string }> };

export async function generateMetadata({ params }: Props) {
  const { templateId } = await params;
  const [tpl] = await db
    .select({ title: quizTemplates.title })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, templateId))
    .limit(1);
  return {
    title: pageTitle(tpl ? `Sheet Attempt: ${tpl.title}` : "Sheet Attempt Siswa"),
  };
}

export default async function TutorQuizAttemptsPage({ params }: Props) {
  const { courseId, templateId } = await params;

  await verifyTutorAccess(courseId);

  const [template] = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      category: quizTemplates.category,
      courseId: quizTemplates.courseId,
    })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, templateId))
    .limit(1);

  if (!template) notFound();

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6 font-sans">
      <Reveal>
        <div className="flex flex-col space-y-4">
          <div className="flex items-center gap-2 text-body-xs text-muted-foreground">
            <Link
              href={`/tutor/${courseId}/quizzes`}
              className="hover:text-foreground transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="size-3.5" />
              <span>Kelola Kuis</span>
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium truncate">{template.title}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-h3 font-heading font-bold text-foreground flex items-center gap-2">
                <FileSpreadsheet className="size-6 text-emerald-500" />
                Sheet Attempt & Jawaban Siswa
              </h1>
              <p className="text-body-sm text-muted-foreground">
                Mata Kuliah: {courseId} · Kuis: {template.title} ({template.category})
              </p>
            </div>

            <Link href={`/admin/quiz-insights/${templateId}`}>
              <Button variant="outline" size="sm" className="rounded-lg gap-2">
                Buka Analisis Kuis
              </Button>
            </Link>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <QuizAttemptsSpreadsheet templateId={templateId} quizTitle={template.title} />
      </Reveal>
    </div>
  );
}
