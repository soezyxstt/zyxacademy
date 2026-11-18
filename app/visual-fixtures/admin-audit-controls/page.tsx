import { notFound } from "next/navigation";
import { ApplicationPage } from "@/components/application-page";
import { FlashcardsTab } from "@/components/admin/course-detail/flashcards-tab";
import { AssessmentDetailClient } from "@/app/(admin)/admin/(content)/assessments/[id]/detail-client";
import { QuizAttemptsSpreadsheet } from "@/app/(admin)/admin/(eval)/quiz-insights/[id]/_components/quiz-attempts-spreadsheet";

const course = { id: "visual-math", title: "Matematika I" };
const sampleDate = new Date("2026-11-01T00:00:00Z");
const chapter = { id: "limits", title: "Limit fungsi dan kekontinuan", orderIndex: 1 };

export default async function AdminAuditControlsFixture({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view } = await searchParams;

  return (
    <main id="main-content" className="bg-background">
      <ApplicationPage>
        {view === "attempts" ? (
          <QuizAttemptsSpreadsheet templateId="visual-quiz" quizTitle="Kuis limit" />
        ) : view === "flashcards" ? (
          <FlashcardsTab
            courseId={course.id}
            courseTitle={course.title}
            courseSlug={course.id}
            chapters={[chapter]}
            initialSets={[{
              id: "visual-set",
              title: "Limit fungsi",
              courseId: course.id,
              chapterId: chapter.id,
              chapterTitle: chapter.title,
              status: "published",
              createdAt: sampleDate,
              updatedAt: sampleDate,
              cards: [],
            }]}
          />
        ) : (
          <AssessmentDetailClient
            course={course}
            source={{
              id: "visual-assessment",
              title: "Ujian kalkulus dan penerapannya",
              courseId: course.id,
              origin: "generated",
              category: "quiz",
              year: 2026,
              semester: 1,
              sourceMarkdown: "# Ujian kalkulus",
              sourceHash: "visual-fixture",
              version: 1,
              parserVersion: "1",
              ingestionStatus: "completed",
              ingestionError: null,
              originalFilename: null,
              uploadedByUserId: "visual-user",
              deletedAt: null,
              createdAt: sampleDate,
            }}
            questions={[]}
            conceptMappings={[]}
            resolvedChapters={[]}
          />
        )}
      </ApplicationPage>
    </main>
  );
}
