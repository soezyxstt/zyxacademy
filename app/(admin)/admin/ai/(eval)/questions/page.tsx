import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { aiQuestionBank, courses, assessmentObjects, assessmentSources } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { QuestionBankClient } from "./questions-client";
import { HistoricalQuestionsClient } from "./historical-questions-client";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin/tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Library } from "lucide-react";

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
    <div className="space-y-8">
      <AdminPageHeader
        icon={Library}
        title="Bank Soal"
        description="Kelola soal asli Zyx dan contoh soal ITB yang membawa sitasi sumber."
      />
      <AdminTabs defaultValue="historical">
        <AdminTabsList>
          <AdminTabsTrigger value="historical">
            Bank Asesmen Historis ({historicalQuestions.length})
          </AdminTabsTrigger>
          <AdminTabsTrigger value="ai-generated">
            Bank soal aktif ({questions.length})
          </AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="historical">
          <HistoricalQuestionsClient
            questions={historicalQuestions}
            courses={allCourses}
            courseMap={courseMap}
          />
        </AdminTabsContent>

        <AdminTabsContent value="ai-generated">
          <QuestionBankClient questions={questions} courses={allCourses} courseMap={courseMap} />
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}
