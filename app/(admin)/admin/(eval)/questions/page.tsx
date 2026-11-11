import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { db } from "@/db";
import {
  aiQuestionBank,
  assessmentSources,
  courses,
  mataKuliah,
  pembahasanSoal,
  soal,
  soalIde,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";
import { canonicalQuestionStatus } from "@/lib/question-authoring-contract";
import { QuestionBankClient } from "./questions-client";
import { HistoricalQuestionsClient } from "./historical-questions-client";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Library, Target, Zap } from "lucide-react";
import { QuestionBankTabs } from "./question-bank-tabs";
import { activeQuestionQuery, historicalQuestionQuery } from "./active-question-query";
import {
  clampQuestionPage,
  normalizeHistoricalQuery,
  normalizeQuestionQuery,
  type QuestionSearchParams,
} from "./question-query-state";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminEval");
  return { title: pageTitle(t("metadata.questionBank")) };
}

type CanonicalQuestionStatus = "draft" | "in_review" | "published" | "retired";
type ReviewStatus = "generated" | "reviewed" | "published" | "flagged" | "retired";

/**
 * Maps canonical question lifecycle status to compatibility review status.
 *
 * @param status The canonical question status string.
 * @returns The corresponding review status used in compatibility layers.
 */
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

/**
 * Normalizes options and correct index offsets from canonical options snapshots.
 *
 * @param optionsSnapshot Raw JSON snapshot from the canonical soal table.
 * @returns Structured option strings and zero-based correct index positions.
 */
function extractOptionsAndCorrect(optionsSnapshot: unknown): { options: string[]; correctIndices: number[] } {
  if (!Array.isArray(optionsSnapshot)) return { options: [], correctIndices: [] };
  const options: string[] = [];
  const correctIndices: number[] = [];
  optionsSnapshot.forEach((opt) => {
    if (typeof opt === "string") {
      options.push(opt);
    } else if (opt && typeof opt === "object" && "text" in opt) {
      const optionIndex = options.length;
      options.push(String(opt.text));
      if ("isCorrect" in opt && opt.isCorrect === true) {
        correctIndices.push(optionIndex);
      }
    }
  });
  return { options, correctIndices };
}

/**
 * Server page component for the universal admin question bank studio.
 *
 * Fetches canonical and compatibility question entries across active courses,
 * prepares facets, and mounts the active and historical evaluation views.
 */
export default async function AIQuestionsPage({ searchParams }: { searchParams: Promise<QuestionSearchParams> }) {
  await assertTutorOrAdmin();

  const resolvedSearchParams = await searchParams;
  const query = normalizeQuestionQuery(resolvedSearchParams);
  const historicalQuery = normalizeHistoricalQuery(resolvedSearchParams);
  const isActiveTab = query.tab === "ai-generated";

  const [
    authoringCourses,
    legacyCoursesList,
  ] = await Promise.all([
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
  ]);

  // Build unified course map and canonical ID resolver
  const courseMap: Record<string, string> = {};
  const canonicalCourseMap: Record<string, string> = {};
  for (const c of legacyCoursesList) {
    courseMap[c.id] = c.title;
    canonicalCourseMap[c.id] = c.id;
  }
  for (const mk of authoringCourses) {
    courseMap[mk.id] = mk.title;
    canonicalCourseMap[mk.id] = mk.id;
    if (mk.legacyCourseId) {
      courseMap[mk.legacyCourseId] = mk.title;
      canonicalCourseMap[mk.legacyCourseId] = mk.id;
    }
    if (mk.code) {
      courseMap[mk.code] = mk.title;
      canonicalCourseMap[mk.code] = mk.id;
    }
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

  const activeQuery = activeQuestionQuery(db, query, courseMap, canonicalCourseMap);
  const total = isActiveTab ? (await activeQuery.count())[0].total : 0;
  const pageSize = Number(query.pageSize);
  const { page: currentPage } = clampQuestionPage(query.page, total, pageSize);
  const pageIds = isActiveTab
    ? (await activeQuery.ids().limit(pageSize).offset((currentPage - 1) * pageSize)).map((row) => row.id)
    : [];

  const histQuery = historicalQuestionQuery(db, historicalQuery, courseMap, canonicalCourseMap);
  const historicalTotal = !isActiveTab ? (await histQuery.count())[0].total : 0;
  const historicalPageSize = Number(historicalQuery.pageSize);
  const { page: currentHistoricalPage } = clampQuestionPage(historicalQuery.page, historicalTotal, historicalPageSize);
  const historicalPageIds = !isActiveTab
    ? (await histQuery.ids().limit(historicalPageSize).offset((currentHistoricalPage - 1) * historicalPageSize)).map((row) => row.id)
    : [];

  const [rawAiQuestions, canonicalQuestionsAll, historicalRows] = await Promise.all([
    // Page-scoped active and compatibility questions in aiQuestionBank
    pageIds.length > 0
      ? db
          .select({
            id: aiQuestionBank.id,
            courseId: aiQuestionBank.courseId,
            origin: aiQuestionBank.origin,
            sourceEventName: aiQuestionBank.sourceEventName,
            sourceReferenceId: aiQuestionBank.sourceReferenceId,
            difficulty: aiQuestionBank.difficulty,
            questionType: aiQuestionBank.questionType,
            tags: aiQuestionBank.tags,
            prompt: aiQuestionBank.prompt,
            options: aiQuestionBank.options,
            correctIndices: aiQuestionBank.correctIndices,
            acceptableAnswers: aiQuestionBank.acceptableAnswers,
            explanation: aiQuestionBank.explanation,
            reviewStatus: aiQuestionBank.reviewStatus,
            useCount: aiQuestionBank.useCount,
            createdAt: aiQuestionBank.createdAt,
          })
          .from(aiQuestionBank)
          .where(and(sql`${aiQuestionBank.status} != 'retired'`, inArray(aiQuestionBank.id, pageIds)))
          .orderBy(desc(aiQuestionBank.createdAt))
      : Promise.resolve([]),
    // Page-scoped questions in canonical soal table
    pageIds.length > 0
      ? db
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
          .where(and(sql`${soal.status} != 'retired'`, inArray(soal.id, pageIds)))
          .orderBy(desc(soal.createdAt))
      : Promise.resolve([]),
    // Page-scoped historical reference questions
    historicalPageIds.length > 0
      ? db
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
          .where(and(eq(soal.origin, "historical_reference"), inArray(soal.id, historicalPageIds)))
      : Promise.resolve([]),
  ]);

  // Distinct set of IDs for all active (non-historical) questions from BOTH tables:
  const activeQuestionIds = new Set<string>();
  for (const q of rawAiQuestions) {
    if (q.origin !== "historical_reference") activeQuestionIds.add(q.id);
  }
  for (const q of canonicalQuestionsAll) {
    if (q.origin !== "historical_reference") activeQuestionIds.add(q.id);
  }

  const historicalIds = historicalRows.map((q) => q.id);
  const renderedQuestionIds = Array.from(new Set([...activeQuestionIds, ...historicalIds]));

  // Scope idea links and solution text only to questions rendered on this page
  const [canonicalLinkRows, renderedSolutions] = await Promise.all([
    activeQuestionIds.size > 0
      ? db
          .select({ questionId: soalIde.soalId, ideaId: soalIde.ideId, weight: soalIde.weight, role: soalIde.role })
          .from(soalIde)
          .where(inArray(soalIde.soalId, Array.from(activeQuestionIds)))
      : Promise.resolve([]),
    renderedQuestionIds.length > 0
      ? db
          .select({ soalId: pembahasanSoal.soalId, content: pembahasanSoal.content, version: pembahasanSoal.version })
          .from(pembahasanSoal)
          .where(inArray(pembahasanSoal.soalId, renderedQuestionIds))
          .orderBy(desc(pembahasanSoal.version))
      : Promise.resolve([]),
  ]);

  const latestSolutionByQuestionId = new Map<string, string>();
  for (const solution of renderedSolutions) {
    if (!latestSolutionByQuestionId.has(solution.soalId)) {
      latestSolutionByQuestionId.set(solution.soalId, solution.content);
    }
  }

  const historicalQuestions = historicalRows
    .map((question) => ({
      ...question,
      sourceTitle: question.sourceTitle ?? "Sumber tidak diketahui",
      sourceCategory: question.sourceCategory ?? "other",
      answerMarkdown: latestSolutionByQuestionId.get(question.id) ?? null,
      reviewStatus: question.reviewStatus ?? reviewStatusFromCanonical(question.canonicalStatus),
    }))
    .sort((a, b) => historicalPageIds.indexOf(a.id) - historicalPageIds.indexOf(b.id));

  const canonicalIdeaLinks = new Map<string, (typeof canonicalLinkRows)[number][]>();
  for (const link of canonicalLinkRows) {
    const current = canonicalIdeaLinks.get(link.questionId) ?? [];
    current.push(link);
    canonicalIdeaLinks.set(link.questionId, current);
  }

  const canonicalQuestionMap = new Map(canonicalQuestionsAll.map((q) => [q.id, q]));
  const aiQuestionMap = new Map(rawAiQuestions.map((q) => [q.id, q]));

  const questions = Array.from(activeQuestionIds).map((id) => {
    const ai = aiQuestionMap.get(id);
    const canonical = canonicalQuestionMap.get(id);

    const hasCanonicalOptions = Array.isArray(canonical?.optionsSnapshot) && (canonical.optionsSnapshot as unknown[]).length > 0;
    const { options: canonicalOptions, correctIndices: canonicalCorrect } = hasCanonicalOptions
      ? extractOptionsAndCorrect(canonical?.optionsSnapshot)
      : { options: [], correctIndices: [] };

    const prompt = canonical?.prompt ?? ai?.prompt ?? "";
    const options = (hasCanonicalOptions ? canonicalOptions : ai?.options) ?? [];
    const correctIndices = (hasCanonicalOptions ? canonicalCorrect : ai?.correctIndices) ?? [];
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
      explanation: ai?.explanation || latestSolutionByQuestionId.get(id) || "",
      reviewStatus,
      useCount: ai?.useCount ?? 0,
      createdAt: ai?.createdAt ?? canonical?.createdAt ?? new Date(),
      chapterId: canonical?.chapterId ?? null,
      canonicalStatus,
      cognitiveLevel: canonical?.cognitiveLevel ?? null,
      reasoningPattern: canonical?.reasoningPattern ?? null,
      ideaLinks: canonicalIdeaLinks.get(id) ?? [],
    };
  }).sort((a, b) => pageIds.indexOf(a.id) - pageIds.indexOf(b.id));

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={Library}
        title={<TranslatedText namespace="adminEval" messageKey="routes.questionBank" />}
        actions={
          <>
            <Button asChild variant="outline" size="sm" className="text-body-sm">
              <Link href="/admin/jobs"><Zap className="size-4" /><TranslatedText namespace="adminEval" messageKey="routes.generationJobs" /></Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="text-body-sm">
              <Link href="/admin/distractors"><Target className="size-4" /><TranslatedText namespace="adminEval" messageKey="routes.distractors" /></Link>
            </Button>
          </>
        }
      />
      <QuestionBankTabs value={query.tab}>
        <TabsList>
          <TabsTrigger value="ai-generated"><TranslatedText namespace="adminEval" messageKey="routes.activeQuestions" /></TabsTrigger>
          <TabsTrigger value="historical"><TranslatedText namespace="adminEval" messageKey="routes.historicalQuestions" /></TabsTrigger>
        </TabsList>

        <TabsContent value="ai-generated" className="w-full space-y-4">
          {query.tab === "ai-generated" && <QuestionBankClient
            query={{ ...query, page: currentPage }}
            total={total}
            questions={questions}
            courses={allCourses}
            courseMap={courseMap}
            canonicalCourseMap={canonicalCourseMap}
            authoringCourses={authoringCourses}
          />}
        </TabsContent>

        <TabsContent value="historical" className="w-full space-y-4">
          {query.tab === "historical" && <HistoricalQuestionsClient
            query={{ ...historicalQuery, tab: "historical", page: currentHistoricalPage }}
            total={historicalTotal}
            questions={historicalQuestions}
            courses={allCourses}
            courseMap={courseMap}
            canonicalCourseMap={canonicalCourseMap}
          />}
        </TabsContent>
      </QuestionBankTabs>
    </div>
  );
}
