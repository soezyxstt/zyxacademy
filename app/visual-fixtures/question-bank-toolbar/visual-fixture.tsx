"use client";

import { Library } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoricalQuestionsClient } from "@/app/(admin)/admin/(eval)/questions/historical-questions-client";
import { QuestionBankClient } from "@/app/(admin)/admin/(eval)/questions/questions-client";

const courses = [{ id: "course-1", title: "Matematika I" }];
const courseMap = { "course-1": "Matematika I" };

const questions = [
  {
    id: "question-1",
    courseId: "course-1",
    origin: "zyx_original" as const,
    sourceEventName: "Latihan limit",
    sourceReferenceId: null,
    difficulty: "easy" as const,
    questionType: "multiple_choice" as const,
    tags: ["limit", "fungsi"],
    prompt: "Tentukan nilai limit fungsi saat x mendekati 2.",
    options: ["2", "3", "4", "5"],
    correctIndices: [2],
    explanation: "Substitusi langsung menghasilkan nilai 4.",
    reviewStatus: "published" as const,
    useCount: 12,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    chapterId: "chapter-1",
    canonicalStatus: "published" as const,
    cognitiveLevel: "apply" as const,
    reasoningPattern: "direct_application",
    ideaLinks: [],
  },
];

const historicalQuestions = [
  {
    id: "historical-1",
    difficulty: "medium" as const,
    questionMarkdown: "Hitung turunan pertama dari $f(x)=x^2+2x$.",
    answerMarkdown: "$f'(x)=2x+2$.",
    options: ["2x", "2x + 2", "x + 2", "2"],
    questionType: "multiple_choice" as const,
    sourceTitle: "UTS Matematika I",
    sourceCategory: "uts",
    sourceYear: 2025,
    courseId: "course-1",
    reviewStatus: "generated" as const,
    canonicalStatus: "draft" as const,
    quizEligible: true,
    sourceQuestionNumber: "1",
    sourceQuestionPart: null,
    sourcePage: 1,
    answerProvenance: "official" as const,
    solutionProvenance: "source_solution" as const,
  },
];

export function QuestionBankToolbarVisualFixture({ initialTab }: { initialTab: "ai-generated" | "historical" }) {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto max-w-[1440px] space-y-8">
        <AdminPageHeader icon={Library} title="Bank Soal" />
        <Tabs
          defaultValue={initialTab}
          syncUrl={false}
          className="grid grid-cols-1 items-center gap-x-2 gap-y-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:grid-rows-[auto_auto]"
        >
          <TabsList className="relative z-10 col-start-1 row-start-1 justify-self-start">
            <TabsTrigger value="ai-generated">Bank soal aktif</TabsTrigger>
            <TabsTrigger value="historical">Referensi historis</TabsTrigger>
          </TabsList>
          <TabsContent
            value="ai-generated"
            className="mt-0 lg:col-span-2 lg:row-span-2 lg:col-start-1 lg:row-start-1 lg:grid lg:grid-cols-subgrid lg:grid-rows-subgrid"
          >
            <QuestionBankClient
              questions={questions}
              courses={courses}
              courseMap={courseMap}
              authoringCourses={[{ id: "course-1", legacyCourseId: "course-1", code: "MA101", title: "Matematika I" }]}
              authoringChapters={[{ id: "chapter-1", mataKuliahId: "course-1", code: "BAB-1", title: "Limit", orderIndex: 1 }]}
              authoringIdeas={[]}
            />
          </TabsContent>
          <TabsContent
            value="historical"
            className="mt-0 lg:col-span-2 lg:row-span-2 lg:col-start-1 lg:row-start-1 lg:grid lg:grid-cols-subgrid lg:grid-rows-subgrid"
          >
            <HistoricalQuestionsClient questions={historicalQuestions} courses={courses} courseMap={courseMap} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
