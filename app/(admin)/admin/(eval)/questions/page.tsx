import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import {
  aiQuestionBank,
  assessmentSources,
  bab,
  courses,
  ide,
  mataKuliah,
  pembahasanSoal,
  soal,
  soalIde,
} from "@/db/schema";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards";
import { canonicalQuestionStatus } from "@/lib/question-authoring-contract";
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

type CanonicalQuestionStatus = "draft" | "in_review" | "published" | "retired";
type ReviewStatus = "generated" | "reviewed" | "published" | "flagged" | "retired";

function reviewStatusFromCanonical(status: CanonicalQuestionStatus): ReviewStatus {
  switch (status) {
    case "in_review":
      return "reviewed";
    case "published":
      return "published";
    case "retired":
      return "retired";
    default:
      return "generated";
  }
}

function extractOptionsAndCorrect(optionsSnapshot: unknown): { options: string[]; correctIndices: number[] } {
  if (!Array.isArray(optionsSnapshot)) return { options: [], correctIndices: [] };
  const options: string[] = [];
  const correctIndices: number[] = [];
  optionsSnapshot.forEach((opt, idx) => {
    if (typeof opt === "string") {
      options.push(opt);
    } else if (opt && typeof opt === "object" && "text" in opt) {
      options.push(String(opt.text));
      if ("isCorrect" in opt && opt.isCorrect === true) {
        correctIndices.push(idx);
      }
    }
  });
  return { options, correctIndices };
}

export default async function AIQuestionsPage() {
  await assertTutorOrAdmin();

  const [
    rawAiQuestions,
    canonicalQuestionsAll,
    authoringCourses,
    legacyCoursesList,
    historicalRows,
    authoringChapters,
    authoringIdeas,
    canonicalLinkRows,
    historicalSolutions,
  ] = await Promise.all([
    // All active and compatibility questions in aiQuestionBank
    db
      .select()
      .from(aiQuestionBank)
      .where(sql`${aiQuestionBank.status} != 'retired'`)
      .orderBy(sql`(CASE WHEN ${aiQuestionBank.createdAt} > 10000000000 THEN ${aiQuestionBank.createdAt} / 1000 ELSE ${aiQuestionBank.createdAt} END) DESC`),
    // All questions in canonical soal table
    db
      .select({
        id: soal.id,
        mataKuliahId: soal.mataKuliahId,
        chapterId: soal.babId,
        questionType: soal.questionType,
        prompt: soal.prompt,
        optionsSnapshot: soal.optionsSnapshot,
        origin: soal.origin,
        sourceEventName: soal.sourceEventName,
        sourceReferenceId: soal.sourceReferenceId,
        canonicalStatus: soal.status,
        difficulty: soal.difficulty,
        cognitiveLevel: soal.cognitiveLevel,
        reasoningPattern: soal.reasoningPattern,
        createdAt: soal.createdAt,
      })
      .from(soal)
      .where(sql`${soal.status} != 'retired'`)
      .orderBy(sql`(CASE WHEN ${soal.createdAt} > 10000000000 THEN ${soal.createdAt} / 1000 ELSE ${soal.createdAt} END) DESC`),
    // Canonical mata kuliah
    db
      .select({
        id: mataKuliah.id,
        legacyCourseId: mataKuliah.legacyCourseId,
        code: mataKuliah.code,
        title: mataKuliah.title,
      })
      .from(mataKuliah)
      .where(eq(mataKuliah.status, "active"))
      .orderBy(asc(mataKuliah.title)),
    // Legacy courses
    db
      .select({ id: courses.id, title: courses.title })
      .from(courses)
      .orderBy(asc(courses.title)),
    // Historical reference questions
    db
      .select({
        id: soal.id,
        difficulty: soal.difficulty,
        questionMarkdown: soal.prompt,
        options: soal.optionsSnapshot,
        questionType: soal.questionType,
        sourceTitle: assessmentSources.title,
        sourceCategory: assessmentSources.category,
        sourceYear: assessmentSources.year,
        courseId: sql<string>`coalesce(${soal.mataKuliahId}, ${assessmentSources.courseId})`,
        reviewStatus: aiQuestionBank.reviewStatus,
        canonicalStatus: soal.status,
        quizEligible: soal.quizEligible,
        sourceQuestionNumber: soal.sourceQuestionNumber,
        sourceQuestionPart: soal.sourceQuestionPart,
        sourcePage: soal.sourcePage,
        answerProvenance: soal.answerProvenance,
        solutionProvenance: soal.solutionProvenance,
      })
      .from(soal)
      .leftJoin(assessmentSources, eq(soal.assessmentSourceId, assessmentSources.id))
      .leftJoin(aiQuestionBank, eq(aiQuestionBank.id, soal.id))
      .where(eq(soal.origin, "historical_reference"))
      .orderBy(desc(soal.createdAt)),
    // Chapters
    db
      .select({ id: bab.id, mataKuliahId: bab.mataKuliahId, code: bab.code, title: bab.title, orderIndex: bab.orderIndex })
      .from(bab)
      .where(eq(bab.status, "active"))
      .orderBy(asc(bab.orderIndex)),
    // Ideas
    db
      .select({ id: ide.id, mataKuliahId: ide.mataKuliahId, babId: ide.babId, code: ide.code, statement: ide.canonicalStatement })
      .from(ide)
      .where(eq(ide.status, "published"))
      .orderBy(asc(ide.code)),
    // Idea links
    db
      .select({ questionId: soalIde.soalId, ideaId: soalIde.ideId, weight: soalIde.weight, role: soalIde.role })
      .from(soalIde),
    // Solutions
    db
      .select({ soalId: pembahasanSoal.soalId, content: pembahasanSoal.content, version: pembahasanSoal.version })
      .from(pembahasanSoal)
      .orderBy(desc(pembahasanSoal.version)),
  ]);

  // Build unified course map and filter list
  const courseMap: Record<string, string> = {};
  for (const c of legacyCoursesList) {
    courseMap[c.id] = c.title;
  }
  for (const mk of authoringCourses) {
    courseMap[mk.id] = mk.title;
    if (mk.legacyCourseId) courseMap[mk.legacyCourseId] = mk.title;
    if (mk.code) courseMap[mk.code] = mk.title;
  }

  const existingCourseIds = new Set<string>();
  const allCourses: Array<{ id: string; title: string }> = [];
  for (const mk of authoringCourses) {
    existingCourseIds.add(mk.id);
    if (mk.legacyCourseId) existingCourseIds.add(mk.legacyCourseId);
    allCourses.push({
      id: mk.id,
      title: mk.code && !mk.title.includes(mk.code) ? `${mk.code} · ${mk.title}` : mk.title,
    });
  }
  for (const c of legacyCoursesList) {
    if (!existingCourseIds.has(c.id)) {
      existingCourseIds.add(c.id);
      allCourses.push({ id: c.id, title: c.title });
    }
  }

  const latestHistoricalSolution = new Map<string, string>();
  for (const solution of historicalSolutions) {
    if (!latestHistoricalSolution.has(solution.soalId)) {
      latestHistoricalSolution.set(solution.soalId, solution.content);
    }
  }

  const historicalQuestions = historicalRows.map((question) => ({
    ...question,
    sourceTitle: question.sourceTitle ?? "Sumber tidak diketahui",
    sourceCategory: question.sourceCategory ?? "other",
    answerMarkdown: latestHistoricalSolution.get(question.id) ?? null,
    reviewStatus: question.reviewStatus ?? reviewStatusFromCanonical(question.canonicalStatus),
  }));

  const canonicalIdeaLinks = new Map<string, (typeof canonicalLinkRows)[number][]>();
  for (const link of canonicalLinkRows) {
    const current = canonicalIdeaLinks.get(link.questionId) ?? [];
    current.push(link);
    canonicalIdeaLinks.set(link.questionId, current);
  }

  const canonicalQuestionMap = new Map(canonicalQuestionsAll.map((q) => [q.id, q]));
  const aiQuestionMap = new Map(rawAiQuestions.map((q) => [q.id, q]));

  // Distinct set of IDs for all active (non-historical) questions from BOTH tables:
  const activeQuestionIds = new Set<string>();
  for (const q of rawAiQuestions) {
    if (q.origin !== "historical_reference") activeQuestionIds.add(q.id);
  }
  for (const q of canonicalQuestionsAll) {
    if (q.origin !== "historical_reference") activeQuestionIds.add(q.id);
  }

  const questions = Array.from(activeQuestionIds).map((id) => {
    const ai = aiQuestionMap.get(id);
    const canonical = canonicalQuestionMap.get(id);

    const { options: canonicalOptions, correctIndices: canonicalCorrect } = canonical
      ? extractOptionsAndCorrect(canonical.optionsSnapshot)
      : { options: [], correctIndices: [] };

    const prompt = canonical?.prompt ?? ai?.prompt ?? "";
    const options = ai?.options ?? canonicalOptions;
    const correctIndices = ai?.correctIndices ?? canonicalCorrect;
    const courseId = canonical?.mataKuliahId ?? ai?.courseId ?? "";
    const reviewStatus = ai?.reviewStatus ?? (canonical ? reviewStatusFromCanonical(canonical.canonicalStatus) : "generated");
    const canonicalStatus = canonical?.canonicalStatus ?? (ai ? canonicalQuestionStatus(ai.reviewStatus) : "draft");

    return {
      id,
      courseId,
      origin: (canonical?.origin ?? ai?.origin ?? "zyx_original") as "zyx_original" | "historical_reference" | "itb_example",
      sourceEventName: canonical?.sourceEventName ?? ai?.sourceEventName ?? null,
      sourceReferenceId: canonical?.sourceReferenceId ?? ai?.sourceReferenceId ?? null,
      difficulty: (canonical?.difficulty ?? ai?.difficulty ?? "medium") as "easy" | "medium" | "hard",
      questionType: (canonical?.questionType ?? ai?.questionType ?? "multiple_choice") as "multiple_choice" | "multiple_choices" | "short_answer" | "essay",
      tags: ai?.tags ?? [],
      prompt,
      options,
      correctIndices,
      acceptableAnswers: ai?.acceptableAnswers ?? [],
      explanation: ai?.explanation || latestHistoricalSolution.get(id) || "",
      reviewStatus,
      useCount: ai?.useCount ?? 0,
      createdAt: ai?.createdAt ?? canonical?.createdAt ?? new Date(),
      chapterId: canonical?.chapterId ?? null,
      canonicalStatus,
      cognitiveLevel: canonical?.cognitiveLevel ?? null,
      reasoningPattern: canonical?.reasoningPattern ?? null,
      ideaLinks: canonicalIdeaLinks.get(id) ?? [],
    };
  });

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
      <Tabs defaultValue="ai-generated" className="w-full space-y-6">
        <TabsList>
          <TabsTrigger value="ai-generated">Bank soal aktif</TabsTrigger>
          <TabsTrigger value="historical">Referensi historis</TabsTrigger>
        </TabsList>

        <TabsContent value="ai-generated" className="w-full space-y-6">
          <QuestionBankClient
            questions={questions}
            courses={allCourses}
            courseMap={courseMap}
            authoringCourses={authoringCourses}
            authoringChapters={authoringChapters}
            authoringIdeas={authoringIdeas}
          />
        </TabsContent>

        <TabsContent value="historical" className="w-full space-y-6">
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
