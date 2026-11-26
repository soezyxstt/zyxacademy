import type { QuestionAuthoringInput } from "../../../lib/question-authoring-contract";
import type { ActiveQuestion, Distractors, EvaluationRequest, GenerationJob, GenerationJobs, HistoricalQuestion, MarkdownImportInput, QuestionBank } from "./evaluation-contract";
import { clampQuestionPage, historicalReviewActionFor, normalizeHistoricalQuery, normalizeQuestionQuery, questionParamsFromUrl } from "./evaluation-question-query";
import { evaluationRoutes, matchEvaluationRoute, resolveEvaluationAlias } from "./evaluation-routes";

const timestamp = "2026-05-12T04:30:00.000Z";
const course = { id: "mekanika-dasar", title: "Mekanika Dasar" };
const chapter = { id: "bab-usaha", code: "MD03", title: "Usaha dan energi", courseId: course.id, orderIndex: 3 };
const idea = { id: "ide-usaha", code: "MD03.1", statement: "Usaha total sama dengan perubahan energi kinetik." };
const ko = { id: "ko-usaha", courseId: course.id, chapterId: chapter.id, title: "Teorema usaha dan energi", conceptName: "Energi kinetik" };

const activeQuestion: ActiveQuestion = {
  id: "soal-energi", courseId: course.id, origin: "zyx_original", sourceEventName: null, sourceReferenceId: null,
  difficulty: "medium", questionType: "multiple_choice", tags: ["energi"], prompt: "Gaya tetap 10 N memindahkan benda sejauh 3 m searah gaya. Berapa usahanya?",
  options: ["3 J", "13 J", "30 J", "300 J"], correctIndices: [2], acceptableAnswers: [],
  explanation: "Untuk gaya yang searah perpindahan, usaha adalah hasil kali gaya dan perpindahan. Hasilnya 30 J.",
  reviewStatus: "generated", useCount: 0, createdAt: timestamp, chapterId: chapter.id, canonicalStatus: "draft", cognitiveLevel: "apply", reasoningPattern: "manual_authoring",
  ideaLinks: [{ ideaId: idea.id, role: "primary", weight: 1 }],
};

const historicalQuestion: HistoricalQuestion = {
  id: "referensi-usaha", courseId: course.id, difficulty: "easy", questionMarkdown: "Berapakah usaha oleh gaya 5 N sepanjang lintasan 2 m yang sejajar dengan gaya?",
  answerMarkdown: "Usaha bernilai 10 J.", options: [{ text: "10 J", isCorrect: true }, { text: "7 J", isCorrect: false }],
  questionType: "multiple_choice", sourceTitle: "Latihan mekanika 2024", sourceCategory: "exercise", sourceYear: 2024,
  reviewStatus: "reviewed", canonicalStatus: "in_review", quizEligible: true,
  sourceQuestionNumber: "7", sourceQuestionPart: null, sourcePage: 4, answerProvenance: "official", solutionProvenance: "source_solution",
};

const job: GenerationJob = {
  id: "job-energi", courseId: course.id, tutorId: "admin-fixture", status: "completed",
  promptParameters: { chapterId: chapter.id, koId: ko.id, logs: ["Objek pengetahuan diproses.", "Bank soal diperbarui."] },
  targetCount: 1, generatedCount: 1, tokenUsage: 328, errorMessage: null, createdAt: timestamp, updatedAt: timestamp,
};

const distractors: Distractors = [{
  id: activeQuestion.id, prompt: activeQuestion.prompt, course: course.title, total: 20,
  options: [
    { text: "3 J", percentage: 10, isCorrect: false, misconception: "Menggunakan perpindahan sebagai nilai usaha." },
    { text: "13 J", percentage: 15, isCorrect: false, misconception: "Menjumlahkan gaya dan perpindahan." },
    { text: "30 J", percentage: 70, isCorrect: true, misconception: null },
    { text: "300 J", percentage: 5, isCorrect: false, misconception: null },
  ],
}];

type Mode = "populated" | "empty" | "denied" | "recovery";
type FixtureCase = { id: string; component: "EvaluationScreen"; route: string; theme: "light" | "dark"; mode: Mode };
export const evaluationCases: readonly FixtureCase[] = evaluationRoutes.flatMap((route) => {
  const pathname = route.path.replace("[id]", route.id === "assessment-detail" ? "asesmen-lama" : "kuis-energi");
  const resolved = route.id === "quiz-new" ? `${pathname}?courseSlug=mekanika-legacy&tags=energi%2Ckinetik`
    : ["quizzes", "quiz-insights", "leaderboard"].includes(route.id) ? `${pathname}?courseId=mekanika-legacy` : pathname;
  const alternate = route.id === "questions" ? `${pathname}?tab=historical`
    : route.id === "ast-inspector" ? `${pathname}?tab=diagnostics`
      : pathname.replace("kuis-energi", "kuis-tidak-ada");
  return [
    { id: `evaluation-${route.id}-populated`, component: "EvaluationScreen", route: resolved, theme: "light", mode: "populated" },
    { id: `evaluation-${route.id}-alternate`, component: "EvaluationScreen", route: alternate, theme: "dark", mode: route.id === "questions" || route.id === "ast-inspector" ? "populated" : "empty" },
    { id: `evaluation-${route.id}-recovery`, component: "EvaluationScreen", route: pathname, theme: "light", mode: route.kind === "alias" ? "denied" : "recovery" },
  ];
});

export class EvaluationFixtureError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function createEvaluationFixtureRequest(mode: Mode = "populated"): EvaluationRequest {
  let jobs = mode === "empty" ? [] : [job];
  let questions = mode === "empty" ? [] : [activeQuestion];
  let historical = mode === "empty" ? [] : [historicalQuestion];
  let count = 0;
  let failedOnce = false;
  const toStatus = (status: ActiveQuestion["reviewStatus"]): ActiveQuestion["canonicalStatus"] =>
    status === "published" ? "published" : status === "retired" ? "retired" : status === "generated" ? "draft" : "in_review";

  return async <Data>(href: string, options?: Parameters<EvaluationRequest>[1]): Promise<Data> => {
    if (options?.signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    if (mode === "denied") throw new EvaluationFixtureError(403, "Forbidden");
    if (mode === "recovery" && !failedOnce) {
      failedOnce = true;
      throw new EvaluationFixtureError(503, "Temporary error");
    }
    const url = new URL(href, "https://fixtures.invalid");
    const verb = options?.method ?? "GET";
    const answer = (payload: unknown): Data => JSON.parse(JSON.stringify(payload)) as Data;

    if (url.pathname === "/api/native/operations/evaluation") {
      const match = matchEvaluationRoute(url.searchParams.get("href") ?? "");
      if (!match) throw new EvaluationFixtureError(404, "Unknown route");
      if (match.route.kind === "alias") {
        const destination = await resolveEvaluationAlias(match.route.id, match.id, match.search, {
          course: async (courseId) => [course.id, "mekanika-legacy"].includes(courseId.trim().toLowerCase()) ? course.id : null,
          quiz: async (quizId) => quizId === "kuis-energi" ? course.id : null,
        });
        if (destination.kind === "not-found") throw new EvaluationFixtureError(404, "Quiz not found");
        return answer(destination);
      }
      if (match.route.id === "ast-inspector") return answer({ authorized: true });
      if (match.route.id === "distractors") return answer(mode === "empty" ? [] : distractors);
      if (match.route.id === "jobs") {
        return answer({
          jobs, courses: [course], chapters: [chapter], knowledgeObjects: [ko], courseMap: { [course.id]: course.title },
        } satisfies GenerationJobs);
      }
      const view = url.searchParams.get("view");
      if (view === "chapters") return answer(match.search.get("courseId") === course.id ? [chapter] : []);
      if (view === "ideas") return answer(match.search.get("courseId") === course.id && [null, "", chapter.id].includes(match.search.get("chapterId")) ? [idea] : []);
      const params = questionParamsFromUrl(match.search);
      const query = normalizeQuestionQuery(params);
      const historyQuery = normalizeHistoricalQuery(params);
      const active = query.tab !== "historical";
      const questionMatches = questions.filter((item) => (query.course === "all" || query.course === item.courseId)
        && (query.difficulty === "all" || query.difficulty === item.difficulty)
        && (query.type === "all" || query.type === item.questionType)
        && (query.status === "all" || query.status === item.reviewStatus)
        && (query.origin === "all" || query.origin === item.origin)
        && `${item.prompt} ${item.tags.join(" ")}`.toLocaleLowerCase().includes(query.search.toLocaleLowerCase()));
      const historicMatches = historical.filter((item) => (historyQuery.course === "all" || historyQuery.course === item.courseId)
        && (historyQuery.category === "all" || historyQuery.category === item.sourceCategory)
        && (historyQuery.difficulty === "all" || historyQuery.difficulty === item.difficulty)
        && `${item.questionMarkdown} ${item.sourceTitle}`.toLocaleLowerCase().includes(historyQuery.search.toLocaleLowerCase()));
      if (view === "selection") return answer(active ? questionMatches.map((item) => item.id) : historicMatches
        .filter((item) => historicalReviewActionFor(item) !== null)
        .map(({ id, reviewStatus, quizEligible }) => ({ id, reviewStatus, quizEligible })));
      const total = active ? questionMatches.length : 0;
      const historicalTotal = active ? 0 : historicMatches.length;
      const pageSize = Number(query.pageSize);
      const historicSize = Number(historyQuery.pageSize);
      const { page } = clampQuestionPage(query.page, total, pageSize);
      const { page: historicalPage } = clampQuestionPage(historyQuery.page, historicalTotal, historicSize);
      return answer({
        query: { ...query, page }, historicalQuery: { ...historyQuery, page: historicalPage }, total, historicalTotal,
        questions: active ? questionMatches.slice((page - 1) * pageSize, page * pageSize) : [],
        historicalQuestions: active ? [] : historicMatches.slice((historicalPage - 1) * historicSize, historicalPage * historicSize),
        courses: [course], courseMap: { [course.id]: course.title }, canonicalCourseMap: { [course.id]: course.id },
        authoringCourses: [{ ...course, code: "MD", legacyCourseId: "mekanika-legacy" }],
      } satisfies QuestionBank);
    }

    if (url.pathname !== "/api/native/operations/evaluation/actions") throw new EvaluationFixtureError(404, "Unknown operation");
    const action = url.searchParams.get("action");
    const id = url.searchParams.get("id");
    if (action === "generation-jobs" && verb === "POST") {
      const form = options?.body as { courseId?: string; chapterId?: string; koId?: string };
      if (form?.courseId !== course.id || form.chapterId !== chapter.id || !["all", ko.id, undefined].includes(form.koId)) {
        throw new EvaluationFixtureError(400, "Course, chapter, or knowledge object is invalid.");
      }
      const jobId = `job-fixture-${++count}`;
      jobs = [{ ...job, id: jobId, status: "pending", promptParameters: { chapterId: chapter.id, koId: form.koId }, generatedCount: 0 }, ...jobs];
      return answer({ jobId, targetCount: 1 });
    }
    if (action === "generation-job" && verb === "GET") {
      const current = jobs.find((item) => item.id === id);
      if (!current) throw new EvaluationFixtureError(404, "Job not found");
      const changed: GenerationJob = current.status === "pending" ? { ...current, status: "processing" }
        : current.status === "processing" ? { ...current, status: "completed", generatedCount: current.targetCount, promptParameters: job.promptParameters } : current;
      jobs = jobs.map((item) => item.id === id ? changed : item);
      return answer(changed);
    }
    if (action === "questions" && verb === "PUT") {
      const { ids, reviewStatus } = options?.body as { ids: string[]; reviewStatus: ActiveQuestion["reviewStatus"] };
      if (!Array.isArray(ids) || historical.some((item) => ids.includes(item.id) && historicalReviewActionFor(item) !== reviewStatus)) {
        throw new EvaluationFixtureError(400, "Invalid review transition.");
      }
      questions = questions.map((item) => ids.includes(item.id) ? { ...item, reviewStatus, canonicalStatus: toStatus(reviewStatus) } : item);
      historical = historical.map((item) => ids.includes(item.id) ? { ...item, reviewStatus, canonicalStatus: toStatus(reviewStatus) } : item);
      return answer({ updated: ids.length });
    }
    if ((action === "questions" && verb === "POST") || (action === "question" && id && verb === "PUT")) {
      const questionId = id ?? `soal-fixture-${++count}`;
      const input = options?.body as QuestionAuthoringInput;
      if (!input?.prompt.trim() || input.courseId !== course.id) throw new EvaluationFixtureError(400, "Invalid question.");
      const saved: ActiveQuestion = { ...activeQuestion, ...input, id: questionId, chapterId: input.chapterId ?? null, canonicalStatus: toStatus(input.reviewStatus) };
      questions = [saved, ...questions.filter((item) => item.id !== questionId)];
      return answer({ id: questionId, success: true });
    }
    if (action === "import-questions" && verb === "POST") {
      const input = options?.body as MarkdownImportInput;
      const prompt = input.rawMarkdown.match(/^## Soal \d+\s*\r?\n([^\n]+)/m)?.[1];
      if (!prompt) throw new EvaluationFixtureError(400, "Markdown question heading is required.");
      const id = `soal-fixture-${++count}`;
      questions = [{ ...activeQuestion, ...input, id, prompt, canonicalStatus: toStatus(input.reviewStatus) }, ...questions];
      return answer({ count: 1, ids: [id], success: true });
    }
    if (action === "question" && id && verb === "DELETE") {
      questions = questions.filter((item) => item.id !== id);
      return answer({ success: true });
    }
    throw new EvaluationFixtureError(404, "Unknown operation");
  };
}
