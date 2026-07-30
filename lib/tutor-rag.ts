/**
 * P3 grounded tutor pipeline. Three tiers:
 *
 * Tier 1 (shared, cacheable): KV cache -> (miss) vector search -> Gemini JSON.
 * Prompt contains ZERO student data; cached values are profile-free.
 * Tier 2 (deterministic, per request, zero AI): weak-concept addendum
 * built by string template on top of Tier 1, hits AND misses.
 * Tier 3 (personalized AI, uncached): only for weak concepts within the
 * daily budget. Budget exhausted: Tier 1+2 served silently.
 *
 * Citations are never invented: the model cites source ids from the retrieved
 * set only, and anything outside that set is dropped.
 */

import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
 aiUsageEvents,
 aiMaterialInstanceChunks,
 aiMaterialInstanceSections,
 knowledgeObjects,
 aiQuestionBank,
 assessmentObjects,
} from "@/db/schema";
import { inArray, and, eq } from "drizzle-orm";
import { z } from "zod";
import { vectorStore, VECTOR_NAMESPACES } from "@/lib/vector-store";
import { kvGet, kvPut } from "@/lib/kv-cache";
import { PromptExecutor, type SystemPrompt } from "@/lib/prompt-executor";
import { getConversationMemory } from "@/lib/zyra/conversation-memory";
import { isMetaExamQuery, executeMetaQuery } from "./assessment-intelligence-service";
import {
 buildLearnerProfile,
 countDueFlashcardsForConcept,
 updateTutorSessionSummary,
 type LearnerProfile,
} from "@/lib/learner-profile";
import { recordLearningEvent } from "@/lib/learning-events";
import { USE_CASES } from "@/lib/ai-router";
import { UsageBudgetService } from "@/lib/usage-budget-service";
import { env } from "@/lib/env";
import {
  evaluateAssessmentAssistancePolicy,
  validateTutorOutput,
  type ActivityKind,
  type AttemptState,
  type AnswerReleaseState,
  type MatchState,
} from "@/lib/assessment-assistance-policy";
import {
  buildTutorCacheKey,
  computeEvidenceVersion,
  assertNoStudentTextInSharedCache,
  SHARED_TUTOR_TTL_SECONDS,
} from "@/lib/tutor/cache-contract";
import { classifyQueryAction, type QueryActionClassification as _QueryActionClassification } from "@/lib/tutor/query-action";
import {
  SourceEnvelope,
  SourceTrustLabel as _SourceTrustLabel,
  buildSanitizedContextBlock,
  sanitizePromptInput,
  computeSourceHash,
} from "@/lib/tutor/prompt-sanitizer";
import {
  EvidenceCoverageState,
  EvidenceClassification as _EvidenceClassification,
  classifyEvidence,
  buildAnswerPlan as _buildAnswerPlan,
} from "@/lib/tutor/evidence-coverage";
import { verifyCitations } from "@/lib/tutor/citation-verifier";

const SIMILARITY_FLOOR = 0.5;
const _CACHE_CONFIDENCE_FLOOR = 0.6;
const SUMMARY_TTL_SECONDS = 30 * 24 * 3600;
const TOP_K = 6;

// ─── Contracts ────────────────────────────────────────────────────────────────

export type TutorSourceType = "chapter" | "ko" | "question" | "practice_question" | "past_exam";

export interface TutorSource {
 type: TutorSourceType;
 id: string;
 label: string;
 /** Course-scoped link (not student-specific, safe to cache). */
 href: string;
}

/** Shared Tier 1 payload. This exact shape is cached in KV; never add student data. */
export interface TutorRagAnswer {
 answer: string;
 sources: TutorSource[];
 matchedConcepts: string[];
 confidence: number;
 grounded: boolean;
 coverageState?: EvidenceCoverageState;
}

export interface TutorAddendum {
 conceptName: string;
 message: string;
 reviewHref: string;
 flashcardsDue: number;
 masteryScore: number;
}

export interface TutorRagResult extends TutorRagAnswer {
 cached: boolean;
 addendum: TutorAddendum | null;
 /** Tier 3 guidance, present only for weak concepts within budget. */
 personalized: string | null;
 budgetExhausted: boolean;
}

export interface ChapterSummary {
 keyConcepts: string[];
 commonMistakes: string[];
 importantFormulas: string[];
 practiceRecommendations: string[];
}

// UUID v4-ish shape used for all source ids; never appears in tutoring prose.
const UUID_RE = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

// Cleans model output before it reaches the student:
// - converts literal "\n" (backslash + n) the model emits as two characters
// into real markdown paragraph breaks;
// - strips inline source-id citations the model leaks despite instructions
// (the ids belong only in the sources chips, never in the answer text).
function sanitizeAnswer(text: string): string {
 let out = text.replace(/\\n/g, "\n\n");

 // Remove ids wrapped in ()/[], with an optional "source id:" prefix.
 out = out.replace(
 new RegExp(`[ \\t]*[\\(\\[]\\s*(?:source\\s*id\\s*:?\\s*)?${UUID_RE}\\s*[\\)\\]]`, "gi"),
 ""
 );
 // Remove any remaining bare ids.
 out = out.replace(new RegExp(`[ \\t]*${UUID_RE}`, "gi"), "");

 // Tidy leftover artefacts: space before punctuation, doubled spaces.
 out = out.replace(/[ \t]+([.,!?;:])/g, "$1").replace(/[ \t]{2,}/g, " ");

 return out.trim();
}

// ─── Cache keys ───────────────────────────────────────────────────────────────

export function normalizeQuestion(question: string): string {
 return question
 .trim()
 .toLowerCase()
 .replace(/[\p{P}\p{S}]/gu, "")
 .replace(/\s+/g, " ")
 .trim();
}

async function logCacheHit(userId: string, feature: string): Promise<void> {
 try {
 await db.insert(aiUsageEvents).values({
 id: randomUUID(),
 userId,
 feature,
 model: "kv-cache",
 tokens: 0,
 requestType: "cache:hit",
 });
 } catch {
 // observability only, never block the answer
 }
}

interface GroundedVars {
 question: string;
 contextBlock: string;
 sourceList: string;
 conversationHistory: string;
}

const tutorGroundedAnswer: SystemPrompt<GroundedVars> = {
 version: "tutor_rag/grounded_answer/v1.7.0",
 systemInstruction:
 "You are Zyra, a friendly and knowledgeable AI study assistant for Indonesian university students made by Zyx. Your tone is warm, casual, and relatable ; like a smart kakak tingkat (senior student) who genuinely wants to help. Use informal Indonesian (e.g. 'kamu', 'aku', 'yuk', 'nih', 'ya') but stay accurate and clear. You are in a continuous chat session. Use the provided conversation history to maintain context and continuity. When responding to follow-up questions, build upon the previous exchange. You have access to course material snippets that may or may not be relevant to the question. First decide if they address the question. If they do, answer ONLY from them and cite sources strictly by the ids in the source list. If they do not, set covered=false, give a brief general answer, and cite nothing. IMPORTANT Socratic Safety rules: If the sources include past exam questions ('past_exam') or practice questions ('practice_question'), you must NEVER provide the direct solution or final answer values. Instead, explain the underlying general concept and formulas, and use Socratic scaffolding to guide the student step-by-step. If they ask you to solve it directly, generate an analogous question with different values and explain that one instead. Never reveal internal pipeline details to the student ; do not use words like 'excerpt', 'retrieved', 'snippet', 'context', 'source list', or any RAG terminology. Refer to materials as 'materi kuliah' or 'bahan ajar'. Never invent citations. CRITICAL INSTRUCTION ON MATH: You MUST wrap ALL math variables, equations, and formulas in LaTeX delimiters (`$...$` for inline, `$$...$$` for block). Never write raw formulas like `y = x^2` without `$` delimiters. Example: `$y = x^2 + 3x - 1$`. Never use em dashes or en dashes. Same language as the question. You can generate interactive visual diagrams, flowcharts, graphs, or charts to help students understand structures, processes, workflows, math functions, or statistics. To do this, output one of the following special markdown blocks:\n1. Flowchart or step-by-step diagram (uses ELK layout):\n:::flowchart {title=\"Title of Diagram\"}\nStep A --> Step B\nStep B -- Label --> Step C\n:::\nNote: Avoid spaces in node IDs if they are used as references, but you can write descriptive text for nodes. Use only valid '-->', '-- label -->', or '--> |label|' syntax.\n2. Function graph (plots equations):\n:::graph {title=\"Graph Title\"}\ndomain:\n  min: -10\n  max: 10\nfunctions:\n  - y = x^2 - 4\n  - y = sin(x)\n:::\n3. Data charts (bar, line, scatter, pie):\n:::chart {title=\"Chart Title\"}\nchartType: bar\nxLabel: X Axis Label\nyLabel: Y Axis Label\ndata:\n  - [Category A, 45]\n  - [Category B, 82]\n:::\nDo NOT use other styles of markdown block syntax for diagrams. These visual blocks will be automatically rendered as beautiful interactive visual widgets in the student's interface. Feel free to use them to explain complex concepts, algorithms, pathways, or mathematical behaviors. CRITICAL INSTRUCTION ON VISUAL SELECTION: If the student explicitly asks for a graph or plot (e.g. 'dengan grafik', 'gambarkan grafik', 'buat plot', 'kurva'), or if the explanation involves mathematical functions/equations/curves (such as limit existence, derivatives, or trigonometric behaviors), you MUST use the `:::graph` block to plot the relevant function equations. Do NOT use a flowchart when a graph or plot is requested. If the student asks for a flowchart, process flow, logical workflow, mind map, or step-by-step pipeline, you MUST use the `:::flowchart` block. For example, if asked 'jelaskan eksistensi limit dengan grafik', you must output a `:::graph` block plotting a relevant function (e.g. `y = (x^2 - 1)/(x - 1)` or similar piecewise/rational function) showing the limit behavior, not a flowchart diagram.",
 userPrompt: (vars) => `CONVERSATION HISTORY:
${vars.conversationHistory || "No previous history."}

QUESTION: ${vars.question}

COURSE MATERIAL EXCERPTS:
${vars.contextBlock}

AVAILABLE SOURCES (cite only these ids):
${vars.sourceList}

Generate a single JSON object:
{
 "covered": [true only if the excerpts actually address this question, else false],
 "answer": "[Markdown answer. IMPORTANT: Do NOT include any source ids or UUIDs inline in the answer text. Write the answer in Socratic prose only. Source attribution goes exclusively in the sourceIds array below. You can generate flowcharts, graphs, or charts using the special markdown blocks detailed in the system instruction.]",
 "sourceIds": ["[ids you actually used ; only in this array, never embedded in the answer text; empty array when covered is false]"],
 "matchedConcepts": ["[concept names this question is about]"],
 "confidence": [0.0 to 1.0, how well the excerpts cover the question]
}`,
};

interface UngroundedVars {
 question: string;
 conversationHistory: string;
}

const tutorUngroundedAnswer: SystemPrompt<UngroundedVars> = {
 version: "tutor_rag/ungrounded_answer/v1.3.0",
 systemInstruction:
 "You are Zyra, a friendly AI study assistant for Indonesian university students made by Zyx. Your tone is warm, casual, and relatable ; like a smart kakak tingkat who genuinely wants to help. Use informal Indonesian (e.g. 'kamu', 'aku', 'nih', 'ya') but stay accurate. You are in a continuous chat session with conversation history. The student's question is not covered by their course materials. Give a short, correct general explanation and be upfront that this topic is not in their course material. Maintain context from previous messages if the question is a follow-up. Never fabricate citations. CRITICAL INSTRUCTION ON MATH: You MUST wrap ALL math variables, equations, and formulas in LaTeX delimiters (`$...$` for inline, `$$...$$` for block). Never write raw formulas like `y = x^2` without `$` delimiters. Example: `$y = x^2 + 3x - 1$`. Never use em dashes or en dashes. Same language as the question. You can generate interactive visual diagrams, flowcharts, graphs, or charts to help students understand structures, processes, workflows, math functions, or statistics. To do this, output one of the following special markdown blocks:\n1. Flowchart or step-by-step diagram (uses ELK layout):\n:::flowchart {title=\"Title of Diagram\"}\nStep A --> Step B\nStep B -- Label --> Step C\n:::\nNote: Avoid spaces in node IDs if they are used as references, but you can write descriptive text for nodes. Use only valid '-->', '-- label -->', or '--> |label|' syntax.\n2. Function graph (plots equations):\n:::graph {title=\"Graph Title\"}\ndomain:\n  min: -10\n  max: 10\nfunctions:\n  - y = x^2 - 4\n  - y = sin(x)\n:::\n3. Data charts (bar, line, scatter, pie):\n:::chart {title=\"Chart Title\"}\nchartType: bar\nxLabel: X Axis Label\nyLabel: Y Axis Label\ndata:\n  - [Category A, 45]\n  - [Category B, 82]\n:::\nDo NOT use other styles of markdown block syntax for diagrams. These visual blocks will be automatically rendered as beautiful interactive visual widgets in the student's interface. Feel free to use them to explain complex concepts, algorithms, pathways, or mathematical behaviors. CRITICAL INSTRUCTION ON VISUAL SELECTION: If the student explicitly asks for a graph or plot (e.g. 'dengan grafik', 'gambarkan grafik', 'buat plot', 'kurva'), or if the explanation involves mathematical functions/equations/curves (such as limit existence, derivatives, or trigonometric behaviors), you MUST use the `:::graph` block to plot the relevant function equations. Do NOT use a flowchart when a graph or plot is requested. If the student asks for a flowchart, process flow, logical workflow, mind map, or step-by-step pipeline, you MUST use the `:::flowchart` block. For example, if asked 'jelaskan eksistensi limit dengan grafik', you must output a `:::graph` block plotting a relevant function (e.g. `y = (x^2 - 1)/(x - 1)` or similar piecewise/rational function) showing the limit behavior, not a flowchart diagram.",
 userPrompt: (vars) => `CONVERSATION HISTORY:
${vars.conversationHistory || "No previous history."}

QUESTION: ${vars.question}

Generate a single JSON object:
{
 "answer": "[Short general markdown explanation. You can generate flowcharts, graphs, or charts using the special markdown blocks detailed in the system instruction if helpful.]",
 "matchedConcepts": ["[general concept names this question is about]"],
 "confidence": [0.0 to 1.0]
}`,
};

interface PersonalVars {
 question: string;
 baseAnswer: string;
 conceptName: string;
 masteryScore: number;
 recentStruggles: string[];
 recentTutorTopics: string[];
}

const tutorPersonalGuidance: SystemPrompt<PersonalVars> = {
 version: "tutor_rag/personal_guidance/v1.1.0",
 systemInstruction:
 "You are Zyra, a friendly AI study assistant for Indonesian university students made by Zyx. Your tone is warm, casual, and encouraging ; like a kakak tingkat who has been through the same struggle. Use informal Indonesian but stay precise. The student is weak on this concept. Break it into smaller steps, check one prerequisite, and gently address their recent mistake pattern. Keep it short (max 5 sentences). Never use em dashes or en dashes. Same language as the question.",
 userPrompt: (vars) => `QUESTION: ${vars.question}
BASE ANSWER ALREADY SHOWN: ${vars.baseAnswer}
WEAK CONCEPT: ${vars.conceptName} (mastery ${vars.masteryScore}/100)
RECENT STRUGGLES: ${vars.recentStruggles.join(", ") || "none recorded"}
RECENT TUTOR TOPICS: ${vars.recentTutorTopics.join(", ") || "none"}

Generate a single JSON object:
{
 "guidance": "[Short markdown addendum: smaller steps, one prerequisite check, address the mistake pattern]"
}`,
};

const GroundedSchema = z.object({
 covered: z.boolean().default(true),
 answer: z.string(),
 sourceIds: z.array(z.string()).default([]),
 matchedConcepts: z.array(z.string()).default([]),
 confidence: z.number().min(0).max(1).default(0),
});

const UngroundedSchema = z.object({
 answer: z.string(),
 matchedConcepts: z.array(z.string()).default([]),
 confidence: z.number().min(0).max(1).default(0),
});

const PersonalSchema = z.object({ guidance: z.string() });

// ─── Retrieval + hydration ────────────────────────────────────────────────────

interface RetrievedSource extends TutorSource {
 content: string;
}

/**
 * Queries the course namespace and hydrates matches from the DB.
 * KO vectors carry conceptId/chapterId metadata; chunk vectors carry chunk_id.
 * Chapter filtering is native for KO vectors only (chunks have no chapter metadata).
 */
async function retrieve(
 courseId: string,
 chapterId: string | null,
 question: string
): Promise<RetrievedSource[]> {
 const [learningMatches, practiceMatches, pastExamMatches] = await Promise.all([
  vectorStore.query(`${courseId}_${VECTOR_NAMESPACES.learning}`, question, {
   topK: TOP_K,
   ...(chapterId ? { filter: { chapterId } } : {}),
  }),
  vectorStore.query(`${courseId}_${VECTOR_NAMESPACES.practice}`, question, {
   topK: TOP_K,
   ...(chapterId ? { filter: { chapterId } } : {}),
  }),
  vectorStore.query(`${courseId}_${VECTOR_NAMESPACES.past_exams}`, question, {
   topK: TOP_K,
   ...(chapterId ? { filter: { chapterId } } : {}),
  }),
 ]);

 const relevantLearning = learningMatches.filter((m) => m.score >= SIMILARITY_FLOOR);
 const relevantPractice = practiceMatches.filter((m) => m.score >= SIMILARITY_FLOOR);
 const relevantPastExams = pastExamMatches.filter((m) => m.score >= SIMILARITY_FLOOR);

 if (
  relevantLearning.length === 0 &&
  relevantPractice.length === 0 &&
  relevantPastExams.length === 0
 ) {
  return [];
 }

 const combinedMatches = [
  ...relevantLearning.map((m) => ({ ...m, sourceNs: "learning" as const })),
  ...relevantPractice.map((m) => ({ ...m, sourceNs: "practice" as const })),
  ...relevantPastExams.map((m) => ({ ...m, sourceNs: "past_exams" as const })),
 ]
  .sort((a, b) => b.score - a.score)
  .slice(0, TOP_K);

 const chunkIds: string[] = [];
 const koIds: string[] = [];
 const practiceQuestionIds: string[] = [];
 const pastExamIds: string[] = [];

 const rankMap = new Map<string, number>();
 combinedMatches.forEach((m, idx) => {
  if (m.sourceNs === "learning" && typeof m.metadata.chunk_id === "string" && m.metadata.chunk_id) {
   rankMap.set(m.metadata.chunk_id, idx);
  } else {
   rankMap.set(m.id, idx);
  }
 });

 for (const m of combinedMatches) {
  if (m.sourceNs === "learning") {
   if (typeof m.metadata.chunk_id === "string" && m.metadata.chunk_id) {
    chunkIds.push(m.metadata.chunk_id);
   } else {
    koIds.push(m.id);
   }
  } else if (m.sourceNs === "practice") {
   practiceQuestionIds.push(m.id);
  } else if (m.sourceNs === "past_exams") {
   pastExamIds.push(m.id);
  }
 }

 const [chunkRows, koRows, practiceRows, pastExamRows] = await Promise.all([
  chunkIds.length > 0
   ? db
      .select({
       id: aiMaterialInstanceChunks.id,
       chunkText: aiMaterialInstanceChunks.chunkText,
       sectionTitle: aiMaterialInstanceSections.title,
       materialInstanceId: aiMaterialInstanceSections.materialInstanceId,
      })
      .from(aiMaterialInstanceChunks)
      .innerJoin(
       aiMaterialInstanceSections,
       eq(aiMaterialInstanceChunks.sectionId, aiMaterialInstanceSections.id)
      )
      .where(inArray(aiMaterialInstanceChunks.id, chunkIds))
   : Promise.resolve([]),
  koIds.length > 0
   ? db
      .select()
      .from(knowledgeObjects)
      .where(and(inArray(knowledgeObjects.id, koIds), eq(knowledgeObjects.status, "active")))
   : Promise.resolve([]),
  practiceQuestionIds.length > 0
   ? db
      .select({
       id: aiQuestionBank.id,
       prompt: aiQuestionBank.prompt,
       explanation: aiQuestionBank.explanation,
      })
      .from(aiQuestionBank)
      .where(and(inArray(aiQuestionBank.id, practiceQuestionIds), eq(aiQuestionBank.status, "active")))
   : Promise.resolve([]),
  pastExamIds.length > 0
   ? db
      .select({
       id: assessmentObjects.id,
       questionMarkdown: assessmentObjects.questionMarkdown,
       answerMarkdown: assessmentObjects.answerMarkdown,
      })
      .from(assessmentObjects)
      .where(inArray(assessmentObjects.id, pastExamIds))
   : Promise.resolve([]),
 ]);

 const sourcesWithRank: { source: RetrievedSource; rank: number }[] = [];

 for (const c of chunkRows) {
  sourcesWithRank.push({
   source: {
    type: "chapter",
    id: c.materialInstanceId,
    label: c.sectionTitle || "Materi",
    href: `/courses/${courseId}/material/${c.materialInstanceId}`,
    content: c.chunkText,
   },
   rank: rankMap.get(c.id) ?? 999,
  });
 }
 for (const ko of koRows) {
  sourcesWithRank.push({
   source: {
    type: "ko",
    id: ko.id,
    label: ko.title,
    href: `/courses/${courseId}/material`,
    content: `${ko.conceptName}: ${ko.content}`,
   },
   rank: rankMap.get(ko.id) ?? 999,
  });
 }
 for (const q of practiceRows) {
  sourcesWithRank.push({
   source: {
    type: "practice_question",
    id: q.id,
    label: "Practice Question",
    href: `/courses/${courseId}/practice`,
    content: `Question: ${q.prompt}\nExplanation: ${q.explanation}`,
   },
   rank: rankMap.get(q.id) ?? 999,
  });
 }
 for (const ae of pastExamRows) {
  sourcesWithRank.push({
   source: {
    type: "past_exam",
    id: ae.id,
    label: "Past Exam Question",
    href: `/courses/${courseId}/material`,
    content: `Question: ${ae.questionMarkdown}\nSolution: ${ae.answerMarkdown || ""}`,
   },
   rank: rankMap.get(ae.id) ?? 999,
  });
 }

 sourcesWithRank.sort((a, b) => a.rank - b.rank);
 return sourcesWithRank.map((item) => item.source);
}

// ─── Tier 2 + Tier 3 (per student, never cached) ─────────────────────────────

function intersectWeak(matchedConcepts: string[], profile: LearnerProfile) {
 const norm = (s: string) => s.trim().toLowerCase();
 // The model often echoes elaborated labels ("Aturan rantai (chain rule)")
 // rather than the exact DB conceptName, so match on containment either way.
 for (const matched of matchedConcepts) {
 const b = norm(matched);
 const weak = profile.weakConcepts.find((w) => {
 const a = norm(w.conceptName);
 const shorter = Math.min(a.length, b.length);
 return shorter >= 4 && (a === b || a.includes(b) || b.includes(a));
 });
 if (weak) return weak;
 }
 return null;
}

async function buildAddendum(
 studentId: string,
 courseId: string,
 answer: TutorRagAnswer,
 profile: LearnerProfile
): Promise<TutorAddendum | null> {
 const weak = intersectWeak(answer.matchedConcepts, profile);
 if (!weak) return null;

 const flashcardsDue = await countDueFlashcardsForConcept(
 studentId,
 courseId,
 weak.conceptName
 );

 return {
 conceptName: weak.conceptName,
 masteryScore: weak.masteryScore,
 message: `You scored ${weak.masteryScore} here recently.`,
 reviewHref: `/courses/${courseId}/material`,
 flashcardsDue,
 };
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export interface AskTutorParams {
  studentId: string;
  courseId: string;
  chapterId?: string | null;
  question: string;
  sessionId?: string | null;
  activityKind?: ActivityKind;
  attemptState?: AttemptState;
  answerReleaseState?: AnswerReleaseState;
  matchState?: MatchState;
  protectedAnswers?: { correctAnswers?: string[]; solutionExplanations?: string[] };
}

export async function askTutorRag(params: AskTutorParams): Promise<TutorRagResult> {
  const { studentId, courseId, question, sessionId, protectedAnswers } = params;
  const chapterId = params.chapterId ?? null;

  const usePolicy = env.FEATURE_ASSESSMENT_ASSISTANCE_POLICY === "1";
  const activityKind = params.activityKind ?? (params.attemptState && params.attemptState !== "none" ? "quiz" : "study");
  const attemptState = params.attemptState ?? "none";
  const answerReleaseState = params.answerReleaseState ?? (attemptState === "completed" ? "released" : "hidden");
  const matchState = params.matchState ?? "none";

  const policy = usePolicy
    ? evaluateAssessmentAssistancePolicy({
        activityKind,
        attemptState,
        answerReleaseState,
        matchState,
      })
    : null;

  const protectedPayload = protectedAnswers || {};
  const profile = await buildLearnerProfile(studentId, courseId);

  // Load conversation history context
  const history = sessionId
    ? await getConversationMemory({ studentId, courseId, sessionId, limit: 6 })
    : { recentMessages: [] };

  // Classify query action deterministically or via AI action classifier
  const classification = await classifyQueryAction(
    { question, historyMessages: history.recentMessages },
    { userId: studentId }
  );

  // 1. Action: Clarify
  if (classification.action === "clarify") {
    return {
      answer: "Mohon berikan pertanyaan yang lebih spesifik atau jelas mengenai materi kuliah agar aku bisa membantu.",
      sources: [],
      matchedConcepts: [],
      confidence: 1.0,
      grounded: false,
      cached: false,
      addendum: null,
      personalized: null,
      budgetExhausted: false,
    };
  }

  // 2. Action: Conversational greeting / meta remark
  if (classification.action === "answer_from_conversation") {
    const historyText = history.recentMessages
      .map((m) => `${m.role === "student" ? "STUDENT" : "ZYRA"}: ${m.content}`)
      .join("\n\n");
    const result = await PromptExecutor.run({
      userId: studentId,
      prompt: tutorUngroundedAnswer,
      variables: { question, conversationHistory: historyText },
      schema: UngroundedSchema,
      useCase: USE_CASES.UNGROUNDED_TUTOR,
    });
    const ansText = result.success && result.data
      ? sanitizeAnswer(result.data.answer)
      : "Halo! Ada yang bisa aku bantu mengenai materi kuliah hari ini?";
    return {
      answer: ansText,
      sources: [],
      matchedConcepts: result.success && result.data ? result.data.matchedConcepts : [],
      confidence: 1.0,
      grounded: false,
      cached: false,
      addendum: null,
      personalized: null,
      budgetExhausted: false,
    };
  }

  // 3. Action: Retrieve or Reuse Previous Evidence
  const searchQuestion = classification.contentFocus || question;
  let cached = false;
  let budgetExhausted = false;

  let retrieved: RetrievedSource[] = [];
  if (classification.action === "reuse_previous_evidence") {
    // Reuse sources attached to recent conversation history instead of issuing new vector search
    const historySources: RetrievedSource[] = [];
    for (const msg of history.recentMessages) {
      if (Array.isArray(msg.sources)) {
        for (const s of msg.sources) {
          if (s && typeof s === "object" && typeof s.id === "string") {
            historySources.push(s as RetrievedSource);
          }
        }
      }
    }
    retrieved = historySources;
  } else if (await isMetaExamQuery(searchQuestion)) {
    const statsSummary = await executeMetaQuery(courseId, searchQuestion);
    retrieved = [
      {
        type: "past_exam",
        id: "system-stats",
        label: "Exam Statistics Database",
        href: `/courses/${courseId}/material`,
        content: `Historical Exam Database Analytics Summary:\n${statsSummary}`,
      },
    ];
  } else {
    retrieved = await retrieve(courseId, chapterId, searchQuestion);
  }

  const evidenceVersion = computeEvidenceVersion(retrieved);
  const cacheKey = buildTutorCacheKey({
    courseId,
    chapterId,
    academicQuery: searchQuestion,
    evidenceVersion,
  });

  let base: TutorRagAnswer | null = null;

  // Shared Tier 1 cache lookup: ONLY for direct 'retrieve' actions
  if (classification.action === "retrieve") {
    base = await kvGet<TutorRagAnswer>(cacheKey);
    if (base && typeof base.answer === "string") {
      cached = true;
      let ansText = sanitizeAnswer(base.answer);
      
      if (policy) {
        const val = validateTutorOutput(ansText, protectedPayload, policy.allowedHelpLevel);
        if (!val.valid) {
          ansText = "Fokus pada pemahaman konsep dasarnya ya! Coba definisikan dulu rumus atau sifat yang berlaku.";
        }
      }

      base = { ...base, answer: ansText };
      assertNoStudentTextInSharedCache(cacheKey, base, [studentId, sessionId ?? ""]);
      await logCacheHit(studentId, "tutor_rag");
    } else {
      base = null;
    }
  }

  if (!base) {
    if (retrieved.length === 0) {
      const remaining = await UsageBudgetService.getRemainingPremium(studentId);
      const useCase = remaining > 0 ? USE_CASES.UNGROUNDED_TUTOR : USE_CASES.UNGROUNDED_TUTOR_GEMMA;
      const result = await PromptExecutor.run({
        userId: studentId,
        prompt: tutorUngroundedAnswer,
        variables: { question: searchQuestion, conversationHistory: "" },
        schema: UngroundedSchema,
        useCase,
      });
      if (result.success && result.data) {
        if (useCase === USE_CASES.UNGROUNDED_TUTOR) {
          await UsageBudgetService.recordPremiumUsage(studentId);
        }
        
        let ansText = sanitizeAnswer(result.data.answer);
        if (policy) {
          const val = validateTutorOutput(ansText, protectedPayload, policy.allowedHelpLevel);
          if (!val.valid) {
            ansText = "Fokus pada pemahaman konsep dasarnya ya! Coba definisikan dulu rumus atau sifat yang berlaku.";
          }
        }

        base = {
          answer: ansText,
          sources: [],
          matchedConcepts: result.data.matchedConcepts,
          confidence: result.data.confidence,
          grounded: false,
        };
      } else if (result.errors[0]?.includes("DAILY_QUOTA_EXCEEDED")) {
        budgetExhausted = true;
      } else {
        console.error("tutor ungrounded generation failed:", result.errors[0]);
        budgetExhausted = true;
      }
    } else {
      const contextSources = policy && !policy.allowDirectAnswerReveal
        ? retrieved.map((s) => {
            let content = s.content;
            if (s.type === 'practice_question' || s.type === 'past_exam') {
              content = content
                .replace(/Explanation:\s*[\s\S]*/gi, '')
                .replace(/Solution:\s*[\s\S]*/gi, '')
                .replace(/Jawaban:\s*[\s\S]*/gi, '');
            }
            return { ...s, content };
          })
        : retrieved;

      const sourceEnvelopes: SourceEnvelope[] = contextSources.map((s) => ({
        id: s.id,
        kind: s.type,
        versionHash: computeSourceHash(s.content),
        title: s.label,
        content: s.content,
        trustLabel: s.type === "ko" ? "trusted_ko" : "untrusted_retrieved",
      }));

      const evidenceEval = classifyEvidence({
        query: searchQuestion,
        sources: sourceEnvelopes,
      });

      if (evidenceEval.state === "conflict") {
        base = {
          answer: evidenceEval.conflictSummary ?? "Terdapat perbedaan informasi pada sumber materi. Silakan tinjau kembali sumber yang dirujuk.",
          sources: contextSources.map((s) => ({ type: s.type, id: s.id, label: s.label, href: s.href })),
          matchedConcepts: [],
          confidence: 0,
          grounded: false,
          coverageState: "conflict",
        };
      } else if (evidenceEval.state === "none") {
        base = {
          answer: "Maaf, bahan ajar yang tersedia belum memuat informasi yang cukup untuk menjawab pertanyaan ini secara pasti.",
          sources: [],
          matchedConcepts: [],
          confidence: 0,
          grounded: false,
          coverageState: "none",
        };
      } else {
        const useEvidenceV2 = env.FEATURE_TUTOR_EVIDENCE_V2 === "1" || env.FEATURE_TUTOR_PIPELINE_V2 === "1";

        const contextBlock = useEvidenceV2
          ? buildSanitizedContextBlock(sourceEnvelopes)
          : contextSources
              .map((s, i) => `[${i + 1}] (source id: ${s.id})\n${s.content}`)
              .join("\n\n");

        const sourceList = contextSources.map((s) => `${s.id} | ${s.type} | ${s.label}`).join("\n");
        const sanitizedQuestion = sanitizePromptInput(searchQuestion);

        // Tier 1 shared generation: ZERO student history in prompt
        const result = await PromptExecutor.run({
          userId: studentId,
          prompt: tutorGroundedAnswer,
          variables: {
            question: sanitizedQuestion,
            contextBlock,
            sourceList,
            conversationHistory: "",
          },
          schema: GroundedSchema,
          useCase: USE_CASES.GROUNDED_RAG,
        });

        if (result.success && result.data) {
          const d = result.data;
          const allowedSourceIds = retrieved.map((s) => s.id);
          const verifyRes = verifyCitations({
            citedIds: d.sourceIds,
            allowedSourceIds,
            coverageState: evidenceEval.state,
          });

          const finalCoverageState = verifyRes.downgradedCoverageState ?? (d.covered ? evidenceEval.state : "none");
          const finalGrounded = verifyRes.isGrounded && d.covered;

          if (finalGrounded && verifyRes.validSourceIds.length > 0) {
            const byId = new Map(retrieved.map((s) => [s.id, s]));
            const sources = verifyRes.validSourceIds.map((id) => {
              const s = byId.get(id)!;
              return { type: s.type, id: s.id, label: s.label, href: s.href };
            });

            let ansText = sanitizeAnswer(d.answer);

            if (policy) {
              const validation = validateTutorOutput(ansText, protectedPayload, policy.allowedHelpLevel);
              if (!validation.valid) {
                ansText = "Fokus pada pemahaman konsep dasarnya ya! Coba definisikan dulu rumus atau sifat yang berlaku.";
              }
            }

            base = {
              answer: ansText,
              sources,
              matchedConcepts: d.matchedConcepts,
              confidence: d.confidence,
              grounded: true,
              coverageState: finalCoverageState,
            };
          } else {
            let ansText = sanitizeAnswer(d.answer);
            if (!d.covered || finalCoverageState === "none") {
              ansText = "Bahan ajar belum memiliki informasi yang cukup untuk mendukung pertanyaan ini secara tepat.";
            }

            base = {
              answer: ansText,
              sources: [],
              matchedConcepts: d.matchedConcepts,
              confidence: d.confidence,
              grounded: false,
              coverageState: finalCoverageState === "full" ? "none" : finalCoverageState,
            };
          }

          const isEligibleToCache =
            classification.action === "retrieve" &&
            base.grounded &&
            (base.coverageState === "full" || base.coverageState === "partial") &&
            base.sources.length > 0;

          if (isEligibleToCache) {
            assertNoStudentTextInSharedCache(cacheKey, base, [studentId, sessionId ?? ""]);
            await kvPut(cacheKey, base, SHARED_TUTOR_TTL_SECONDS);
          }
        } else if (result.errors[0]?.includes("DAILY_QUOTA_EXCEEDED")) {
          budgetExhausted = true;
        } else {
          console.error("tutor grounded generation failed:", result.errors[0]);
          budgetExhausted = true;
        }
      }
    }
  }

 if (!base) {
 return {
 answer: "",
 sources: [],
 matchedConcepts: [],
 confidence: 0,
 grounded: false,
 cached: false,
 addendum: null,
 personalized: null,
 budgetExhausted: true,
 };
 }

 // Tier 2: deterministic addendum, runs on hits AND misses
 const addendum = await buildAddendum(studentId, courseId, base, profile);

 // Tier 3: personalized AI, only for weak concepts, charged, silent on exhaustion
  let personalized: string | null = null;
  if (addendum) {
   const remaining = await UsageBudgetService.getRemainingPremium(studentId);
   const useCase = remaining > 0 ? USE_CASES.WEAK_CONCEPT_GUIDANCE : USE_CASES.WEAK_CONCEPT_GUIDANCE_GEMMA;
   const result = await PromptExecutor.run({
   userId: studentId,
   prompt: tutorPersonalGuidance,
   variables: {
   question,
   baseAnswer: base.answer,
   conceptName: addendum.conceptName,
   masteryScore: addendum.masteryScore,
   recentStruggles: profile.recentStruggles,
   recentTutorTopics: profile.recentTutorTopics,
   },
   schema: PersonalSchema,
   useCase,
   });
  if (result.success && result.data) {
  if (useCase === USE_CASES.WEAK_CONCEPT_GUIDANCE) {
  await UsageBudgetService.recordPremiumUsage(studentId);
  }
  personalized = sanitizeAnswer(result.data.guidance);
  }
 // quota exceeded or failure: serve Tier 1+2 silently
 }

 // Session memory + learning event (deterministic)
 if (base.matchedConcepts.length > 0) {
 await updateTutorSessionSummary(studentId, courseId, base.matchedConcepts);
 }
 await recordLearningEvent({
 studentId,
 courseId,
 eventType: "tutor_question",
 conceptName: base.matchedConcepts[0] ?? null,
 });

 return { ...base, cached, addendum, personalized, budgetExhausted };
}

// ─── Chapter summary (cache-first, profile-free by design) ───────────────────

interface SummaryVars {
 chapterTitle: string;
 koBlock: string;
}

const chapterSummaryPrompt: SystemPrompt<SummaryVars> = {
 version: "tutor_rag/chapter_summary/v1.0.0",
 systemInstruction:
 "You summarize a course chapter from its knowledge objects. Be concise and factual; use the same language as the source content. Formulas in LaTeX.",
 userPrompt: (vars) => `CHAPTER: ${vars.chapterTitle}

KNOWLEDGE OBJECTS:
${vars.koBlock}

Generate a single JSON object:
{
 "keyConcepts": ["[3 to 6 key concepts, one line each]"],
 "commonMistakes": ["[2 to 4 common student mistakes]"],
 "importantFormulas": ["[important formulas in LaTeX, empty array if none]"],
 "practiceRecommendations": ["[2 to 3 concrete practice recommendations]"]
}`,
};

const SummarySchema = z.object({
 keyConcepts: z.array(z.string()).default([]),
 commonMistakes: z.array(z.string()).default([]),
 importantFormulas: z.array(z.string()).default([]),
 practiceRecommendations: z.array(z.string()).default([]),
});

export interface SummarizeChapterResult {
 summary: ChapterSummary;
 cached: boolean;
 budgetExhausted: boolean;
}

export async function summarizeChapterCached(
 userId: string,
 chapterId: string,
 chapterTitle: string
): Promise<SummarizeChapterResult> {
 const kos = await db
 .select()
 .from(knowledgeObjects)
 .where(and(eq(knowledgeObjects.chapterId, chapterId), eq(knowledgeObjects.status, "active")));

 if (kos.length === 0) {
 return {
 summary: { keyConcepts: [], commonMistakes: [], importantFormulas: [], practiceRecommendations: [] },
 cached: false,
 budgetExhausted: false,
 };
 }

 // Material version: newest KO edit. Key embeds it, so edits invalidate naturally.
 const version = Math.max(...kos.map((k) => k.updatedAt.getTime()));
 const cacheKey = `summary:${chapterId}:${version}`;

 const hit = await kvGet<ChapterSummary>(cacheKey);
 if (hit && Array.isArray(hit.keyConcepts)) {
 await logCacheHit(userId, "tutor_summary");
 return { summary: hit, cached: true, budgetExhausted: false };
 }

 const koBlock = kos
 .map((k) => `- [${k.type}] ${k.title}: ${k.content}`)
 .join("\n")
 .slice(0, 24000);

  const result = await PromptExecutor.run({
  userId,
  prompt: chapterSummaryPrompt,
  variables: { chapterTitle, koBlock },
  schema: SummarySchema,
  useCase: USE_CASES.CHAPTER_SUMMARY,
  });

 if (!result.success || !result.data) {
 console.error("chapter summary generation failed:", result.errors[0]);
 return {
 summary: { keyConcepts: [], commonMistakes: [], importantFormulas: [], practiceRecommendations: [] },
 cached: false,
 budgetExhausted: true,
 };
 }

 await kvPut(cacheKey, result.data, SUMMARY_TTL_SECONDS);
 return { summary: result.data, cached: false, budgetExhausted: false };
}
