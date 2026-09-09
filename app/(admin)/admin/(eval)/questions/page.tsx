import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import {
  aiQuestionBank,
  assessmentObjects,
  assessmentSources,
  bab,
  courses,
  ide,
  mataKuliah,
  soal,
  soalIde,
} from "@/db/schema";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards";
import { QuestionBankClient } from "./questions-client";
import { HistoricalQuestionsClient } from "./historical-questions-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Library, Target, Zap } from "lucide-react";

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

  const questionIds = rawQuestions.map((question) => question.id);
  const [authoringCourses, authoringChapters, authoringIdeas, canonicalQuestions, canonicalLinkRows] = await Promise.all([
    db
      .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId, code: mataKuliah.code, title: mataKuliah.title })
      .from(mataKuliah)
      .where(eq(mataKuliah.status, "active"))
      .orderBy(asc(mataKuliah.title)),
    db
      .select({ id: bab.id, mataKuliahId: bab.mataKuliahId, code: bab.code, title: bab.title, orderIndex: bab.orderIndex })
      .from(bab)
      .where(eq(bab.status, "active"))
      .orderBy(asc(bab.orderIndex)),
    db
      .select({ id: ide.id, mataKuliahId: ide.mataKuliahId, babId: ide.babId, code: ide.code, statement: ide.canonicalStatement })
      .from(ide)
      .where(eq(ide.status, "published"))
      .orderBy(asc(ide.code)),
    questionIds.length > 0
      ? db
        .select({ id: soal.id, chapterId: soal.babId, status: soal.status, cognitiveLevel: soal.cognitiveLevel, reasoningPattern: soal.reasoningPattern })
        .from(soal)
        .where(inArray(soal.id, questionIds))
      : Promise.resolve([]),
    questionIds.length > 0
      ? db
        .select({ questionId: soalIde.soalId, ideaId: soalIde.ideId, weight: soalIde.weight, role: soalIde.role })
        .from(soalIde)
        .where(inArray(soalIde.soalId, questionIds))
      : Promise.resolve([]),
  ]);

  const canonicalQuestionMap = new Map(canonicalQuestions.map((question) => [question.id, question]));
  const canonicalIdeaLinks = new Map<string, (typeof canonicalLinkRows)[number][]>();
  for (const link of canonicalLinkRows) {
    const current = canonicalIdeaLinks.get(link.questionId) ?? [];
    current.push(link);
    canonicalIdeaLinks.set(link.questionId, current);
  }
  const questions = rawQuestions.map((question) => {
    const canonical = canonicalQuestionMap.get(question.id);
    return {
      ...question,
      chapterId: canonical?.chapterId ?? null,
      canonicalStatus: canonical?.status ?? null,
      cognitiveLevel: canonical?.cognitiveLevel ?? null,
      reasoningPattern: canonical?.reasoningPattern ?? null,
      ideaLinks: canonicalIdeaLinks.get(question.id) ?? [],
    };
  });

  const courseMap = Object.fromEntries(allCourses.map((c) => [c.id, c.title]));

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={Library}
        title="Bank Soal"
        description="Kelola soal yang siap ditinjau, diterbitkan, dan dipakai ulang dalam kuis."
        actions={
          <>
            <Button asChild variant="outline" size="sm" className="text-body-sm">
              <Link href="/admin/jobs"><Zap className="size-4" />Generasi Soal</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="text-body-sm">
              <Link href="/admin/distractors"><Target className="size-4" />Distraktor</Link>
            </Button>
          </>
        }
      />
      <Tabs
        defaultValue="ai-generated"
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
            courses={allCourses}
            courseMap={courseMap}
            authoringCourses={authoringCourses}
            authoringChapters={authoringChapters}
            authoringIdeas={authoringIdeas}
          />
        </TabsContent>

        <TabsContent
          value="historical"
          className="mt-0 lg:col-span-2 lg:row-span-2 lg:col-start-1 lg:row-start-1 lg:grid lg:grid-cols-subgrid lg:grid-rows-subgrid"
        >
          <HistoricalQuestionsClient
            questions={historicalQuestions}
            courses={allCourses}
            courseMap={courseMap}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
