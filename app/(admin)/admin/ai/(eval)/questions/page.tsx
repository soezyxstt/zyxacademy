import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { aiQuestionBank, courses, assessmentObjects, assessmentSources } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { QuestionBankClient } from "./questions-client";
import { HistoricalQuestionsClient } from "./historical-questions-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = {
  title: pageTitle("Bank Soal"),
};

export default async function AIQuestionsPage() {
  await assertTutorOrAdmin();

  const [rawQuestions, allCourses, historicalQuestions] = await Promise.all([
    db
      .select()
      .from(aiQuestionBank)
      .orderBy(desc(aiQuestionBank.createdAt))
      .limit(200),
    db.select({ id: courses.id, title: courses.title }).from(courses),
    db
      .select({
        id: assessmentObjects.id,
        difficulty: assessmentObjects.difficulty,
        applicationLevel: assessmentObjects.applicationLevel,
        pattern: assessmentObjects.pattern,
        questionMarkdown: assessmentObjects.questionMarkdown,
        answerMarkdown: assessmentObjects.answerMarkdown,
        sourceTitle: assessmentSources.title,
        sourceCategory: assessmentSources.category,
        sourceYear: assessmentSources.year,
        courseId: assessmentSources.courseId,
      })
      .from(assessmentObjects)
      .innerJoin(assessmentSources, eq(assessmentObjects.sourceId, assessmentSources.id))
      .orderBy(desc(assessmentObjects.createdAt))
      .limit(200),
  ]);

  const courseMap = Object.fromEntries(allCourses.map((c) => [c.id, c.title]));
  const questions = rawQuestions.map((q) => ({ ...q, qualityScore: q.qualityScore ?? 0 }));

  return (
    <div className="space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Bank Soal</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Kelola bank soal hasil ekstraksi AI dan soal-soal historis.
        </p>
      </div>
      <Tabs defaultValue="historical" className="space-y-6">
        <TabsList className="w-full justify-start border-b border-border bg-transparent p-0 rounded-none h-auto">
          <TabsTrigger
            value="historical"
            className="border-b-2 border-transparent px-4 py-2 text-body-sm font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none bg-transparent"
          >
            Bank Asesmen Historis ({historicalQuestions.length})
          </TabsTrigger>
          <TabsTrigger
            value="ai-generated"
            className="border-b-2 border-transparent px-4 py-2 text-body-sm font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none bg-transparent"
          >
            Dihasilkan AI (Question Bank) ({questions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="historical" className="space-y-4">
          <HistoricalQuestionsClient
            questions={historicalQuestions}
            courses={allCourses}
            courseMap={courseMap}
          />
        </TabsContent>

        <TabsContent value="ai-generated" className="space-y-4">
          <QuestionBankClient questions={questions} courses={allCourses} courseMap={courseMap} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
