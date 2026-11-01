import { PYTHON_GENERATION_POLICY } from "@/lib/coding/python-generation-policy";
import { CODING_COACHING_INSTRUCTIONS } from "@/lib/coding/zyra";
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

import { createHash, randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  aiUsageEvents,
  knowledgeObjects,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { kvGet, kvPut } from "@/lib/kv-cache";
import { PromptExecutor, type SystemPrompt } from "@/lib/prompt-executor";
import { getConversationMemory, latestConversationSources } from "@/lib/zyra/conversation-memory";
import { isCurrentQuizContextQuery, isMetaExamQuery, executeMetaQuery } from "./assessment-intelligence-service";
import {
 buildLearnerProfile,
 countDueFlashcardsForConcept,
 updateTutorSessionSummary,
 type LearnerProfile,
} from "@/lib/learner-profile";
import { recordLearningEvent } from "@/lib/learning-events";
import { USE_CASES } from "@/lib/ai-router";
import { UsageBudgetService, type AllowanceAccessTier, type AllowanceReserveResult } from "@/lib/usage-budget-service";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import {
  evaluateAssessmentAssistancePolicy,
  validateTutorOutput,
  type ActivityKind,
  type AttemptState,
  type AnswerReleaseState,
  type MatchState,
  type ProtectedItemPayload,
} from "@/lib/assessment-assistance-policy";
import {
  buildTutorCacheKey,
  computeEvidenceVersion,
  assertNoStudentTextInSharedCache,
  SHARED_TUTOR_TTL_SECONDS,
  TUTOR_POLICY_VERSION,
  TUTOR_PROMPT_VERSION,
  TUTOR_SCHEMA_VERSION,
} from "@/lib/tutor/cache-contract";
import {
  buildSharedScaffoldMetadata,
  buildZyraCacheIdentity,
  type SharedScaffold,
} from "@/lib/ai/cache/contracts";
import { ZyraRemoteCache } from "@/lib/ai/cache/remote-client";
import { CacheFlightError } from "@/lib/ai/cache/single-flight";
import {
  classifyQueryAction,
  resolveResponseLanguage,
  responseLanguageFromHistory,
  responseLanguageInstruction,
  type QueryActionClassification as _QueryActionClassification,
  type ResponseLanguage,
} from "@/lib/tutor/query-action";
import {
  SourceEnvelope,
  SourceTrustLabel as _SourceTrustLabel,
  buildSanitizedContextBlock,
  sanitizePromptInput,
  computeSourceHash,
} from "@/lib/tutor/prompt-sanitizer";
import {
  EvidenceCoverageState,
  EvidenceClassification,
  classifyEvidence,
  buildAnswerPlan as _buildAnswerPlan,
} from "@/lib/tutor/evidence-coverage";
import { verifyCitations } from "@/lib/tutor/citation-verifier";
import {
  sanitizeAnswer,
  type SanitizationSource,
} from "@/lib/tutor/answer-sanitizer";
import {
  rehydrateCanonicalSourceIds,
  retrieveCanonicalEvidence,
} from "@/lib/zyra/canonical-runtime";
import {
  buildPedagogyContext,
  runPedagogicalTurn,
  teachingResponseToTutorAnswer,
  PedagogyShadowGuardError,
  recordPedagogyShadowComparison,
  resolvePedagogyExecutionMode,
  type PedagogyContext,
  type PedagogyEvidenceInput,
  type PedagogyExecutionMode,
  type PedagogyShadowComparison,
} from "@/lib/zyra/pedagogy";
import type { HintLevel, LearnerResponseShape } from "@/lib/zyra/pedagogy/contracts";
import {
  assertProfileFreeSharedPayload,
  composePersonalizedAnswer,
  getZyraAdaptation,
  recordZyraLearningEvent,
  type ZyraAdaptationDecision,
} from "@/lib/zyra/personalization";
import type { ProviderInputPart } from "@/lib/ai/provider/provider-adapter";
import {
  isZyraCanvasFeatureEnabled,
  type CanvasSpec,
} from "@/lib/zyra/canvas";
import {
  recordZyraOperationalEventSafe,
  zyraLatencyBucket,
  zyraOperationalFingerprint,
  zyraSizeBucket,
} from "@/lib/zyra/ops/telemetry";
import { normalizeTutorMathMarkdown } from "@/lib/tutor/math-markdown";

const _CACHE_CONFIDENCE_FLOOR = 0.6;
const SUMMARY_TTL_SECONDS = 30 * 24 * 3600;

// ─── Contracts ────────────────────────────────────────────────────────────────

export type TutorSourceType = "chapter" | "ko" | "question" | "practice_question" | "past_exam";

export interface TutorSource {
 type: TutorSourceType;
 id: string;
 label: string;
 /** Course-scoped link (not student-specific, safe to cache). */
 href: string;
}

export interface TutorPageContext {
  id: string;
  label: string;
  href: string;
  content: string;
}

/** Shared Tier 1 payload. This exact shape is cached in KV; never add student data. */
export interface TutorRagAnswer {
 answer: string;
 sources: TutorSource[];
 matchedConcepts: string[];
 confidence: number;
 grounded: boolean;
 coverageState?: EvidenceCoverageState;
 canvasSpec?: CanvasSpec | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assessmentSafeFallback(language: ResponseLanguage): string {
  return language === "en"
    ? "Let's focus on the core concept first. Which definition or property applies here?"
    : "Fokus pada pemahaman konsep dasarnya. Coba definisikan dulu rumus atau sifat yang berlaku.";
}

function tutorAnswerToSharedScaffold(answer: TutorRagAnswer, identity: ReturnType<typeof buildZyraCacheIdentity>): SharedScaffold {
  const claims = answer.sources.map((source) => ({
    ideaId: source.id,
    ideaVersion: 1,
    claimHash: sha256(`${source.id}:${source.label}`),
  }));
  const scaffold: SharedScaffold = {
    explanation: answer.answer,
    claims,
    sourceRefs: answer.sources,
    teachingMove: "grounded_explanation",
    canvasSpec: isZyraCanvasFeatureEnabled() ? answer.canvasSpec ?? undefined : undefined,
    examples: [],
    validation: {
      status: answer.grounded ? "grounded" : "abstain",
      evidenceVersion: identity.evidenceVersion,
      claimCount: claims.length,
    },
    cacheMetadata: buildSharedScaffoldMetadata(identity),
  };
  assertProfileFreeSharedPayload(scaffold);
  return scaffold;
}

function sharedScaffoldToTutorAnswer(scaffold: SharedScaffold): TutorRagAnswer {
  const sources: TutorSource[] = (scaffold.sourceRefs ?? []).map((source) => ({
    type: source.type as TutorSourceType,
    id: source.id,
    label: source.label,
    href: source.href,
  }));
  return {
    answer: scaffold.explanation,
    sources,
    matchedConcepts: scaffold.claims.map((claim) => claim.ideaId),
    confidence: scaffold.validation.status === "grounded" ? 1 : 0,
    grounded: scaffold.validation.status === "grounded",
    coverageState: scaffold.validation.status === "grounded" ? "full" : "none",
    canvasSpec: isZyraCanvasFeatureEnabled() ? scaffold.canvasSpec ?? null : null,
  };
}

export interface TutorAddendum {
 conceptName: string;
 message: string;
 reviewHref: string;
 flashcardsDue: number;
 masteryScore: number;
}

export interface TutorRagResult extends TutorRagAnswer {
  responseLanguage: ResponseLanguage;
  cached: boolean;
  addendum: TutorAddendum | null;
  /** Tier 3 guidance, present only for weak concepts within budget. */
  personalized: string | null;
  /** Learner-local presentation adaptation; never part of the shared scaffold. */
  adaptation?: ZyraAdaptationDecision | null;
  budgetExhausted: boolean;
  failureCode?: "quota_exhausted" | "provider_unavailable";
  /** Privacy-safe staging comparison metadata. Candidate text is never exposed here. */
  pedagogyShadow?: PedagogyShadowComparison;
}

export interface ChapterSummary {
 keyConcepts: string[];
 commonMistakes: string[];
 importantFormulas: string[];
 practiceRecommendations: string[];
}

export { sanitizeAnswer, type SanitizationSource };

// ─── Cache keys ───────────────────────────────────────────────────────────────

export function normalizeQuestion(question: string): string {
 return question
 .trim()
 .toLowerCase()
 .replace(/[\p{P}\p{S}]/gu, "")
 .replace(/\s+/g, " ")
 .trim();
}

async function logCacheHit(
  userId: string,
  feature: string,
  accessTier: AllowanceAccessTier = "standard",
  idempotencyKey?: string,
): Promise<AllowanceReserveResult | null> {
  if (UsageBudgetService.isAllowanceEnabled()) {
    return UsageBudgetService.recordCacheHit({
      userId,
      idempotencyKey: idempotencyKey ?? `cache:${feature}:${randomUUID()}`,
      feature,
      model: "kv-cache",
      accessTier,
    });
  }

  try {
  // Legacy observability remains unchanged while the allowance flag is off.
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
  return null;
}

interface GroundedVars {
 question: string;
 contextBlock: string;
 sourceList: string;
 conversationHistory: string;
 responseLanguage: ResponseLanguage;
}

const TUTOR_MATH_PRESENTATION_POLICY = `MATH PRESENTATION CONTRACT:
- Use mathematical notation as the primary representation. Use prose only to explain what an equation means.
- Never narrate an operation that can be shown directly. Do not write "Integral dari 6x^2 adalah 2x^3".
- For a derivation, write one short setup sentence followed by a display equation using $$...$$ and aligned steps when useful.
- Example output style:
$$
\\begin{aligned}
f(x) &= \\int (6x^2 - 4x + 3)\\,dx \\\\
     &= 2x^3 - 2x^2 + 3x + C.
\\end{aligned}
$$
- Wrap every inline variable or expression in $...$. Return valid JSON with LaTeX backslashes escaped correctly.`;

const tutorGroundedAnswer: SystemPrompt<GroundedVars> = {
 version: "tutor_rag/grounded_answer/v2.0.0",
 systemInstruction:
 "You are Zyra, a friendly and knowledgeable AI study assistant for university students made by Zyx. Speak naturally like a helpful kakak tingkat explaining to an adik tingkat. Keep the tone warm, concise, and clear. Answer the actual question directly; do not force learning-goal headings or a check question into every reply. You are in a continuous chat session. Use the provided conversation history to maintain context and continuity. When responding to follow-up questions, build upon the previous exchange. You have access to course material snippets that may or may not be relevant to the question. First decide if they address the question. If they do, answer ONLY from them and cite sources strictly by the ids in the source list. If they do not, set covered=false, give a brief general answer, and cite nothing. IMPORTANT Socratic Safety rules: If the sources include past exam questions ('past_exam') or practice questions ('practice_question'), you must NEVER provide the direct solution or final answer values. Instead, explain the underlying general concept and formulas, and use Socratic scaffolding to guide the student step-by-step. If they ask you to solve it directly, generate an analogous question with different values and explain that one instead. Never reveal internal pipeline details to the student ; do not use words like 'excerpt', 'retrieved', 'snippet', 'context', 'source list', or any RAG terminology. Never invent citations. Put each substantial calculation step on its own display-math row with blank lines around it. Explain the reason between steps. Use aligned only for short connected equations; never squeeze a long derivation into one inline formula. CRITICAL INSTRUCTION ON MATH: You MUST wrap ALL math variables, equations, and formulas in LaTeX delimiters (`$...$` for inline, `$$...$$` for block). Never write raw formulas like `y = x^2` without `$` delimiters. Example: `$y = x^2 + 3x - 1$`. Never use em dashes or en dashes. Follow the response language specified in the user prompt. VISUAL OUTPUT RULE: Interactive visuals are rendered by the application itself from a separate structured channel that is not part of your answer text. Never output :::flowchart, :::graph, or :::chart markdown blocks, ASCII diagrams, mermaid syntax, or any other diagram markup. Your answer contains only prose, LaTeX math, lists, headings, and plain markdown tables.",
 userPrompt: (vars) => `CONVERSATION HISTORY:
${vars.conversationHistory || "No previous history."}

RESPONSE LANGUAGE: ${vars.responseLanguage === "en" ? "English" : "Bahasa Indonesia"}. ${responseLanguageInstruction(vars.responseLanguage)}

QUESTION: ${vars.question}

${TUTOR_MATH_PRESENTATION_POLICY}

IMAGE INPUT RULE: If images are attached, inspect them together with the question. Distinguish visible facts from inference, state uncertainty for blurry or cropped content, and never invent unreadable labels or values.

COURSE MATERIAL EXCERPTS:
${vars.contextBlock}

AVAILABLE SOURCES (cite only these ids):
${vars.sourceList}

Generate a single JSON object:
{
 "covered": [true only if the excerpts actually address this question, else false],
 "answer": "[Markdown answer in the specified response language. IMPORTANT: Do NOT include any source ids, product ids, slugs, or UUIDs inline in the answer text. Never write bracketed citation tokens like [source-id] or [article-...]. If referring to materials, use human-readable titles, never raw IDs. Source attribution goes exclusively in the sourceIds array below. Do not use ::: visual markdown blocks.]",
 "sourceIds": ["[ids you actually used ; only in this array, never embedded in the answer text; empty array when covered is false]"],
 "matchedConcepts": ["[concept names this question is about]"],
 "confidence": [0.0 to 1.0, how well the excerpts cover the question]
}`,
};

const codingGroundedAnswer: SystemPrompt<GroundedVars> = {
  ...tutorGroundedAnswer,
  version: "tutor_rag/coding_coaching/v1.0.0",
  systemInstruction: `${tutorGroundedAnswer.systemInstruction}
CODING COACHING CONTRACT:
${CODING_COACHING_INSTRUCTIONS}
Put the complete coaching in the answer field. The current code, stdin and execution snapshot override older recentConversation messages, including a previous successful attempt. Never describe an old correction as if it already happened in the current code. When the current execution is an error, explain that error before suggesting changes. Treat browser execution as reported practice, never official grading. Use Markdown backticks for Python code and names, overriding the general math presentation rule for code.`,
};

const codingGenerationAnswer: SystemPrompt<GroundedVars> = {
  ...tutorGroundedAnswer,
  version: "tutor_rag/coding_generation/v1.1.0",
  systemInstruction: `${tutorGroundedAnswer.systemInstruction}\nWhen the learner actually requests a program, put the complete runnable Python program in one fenced python code block in the answer field. Do not give only hints or placeholders. Use Markdown backticks for Python code and names, overriding the general math presentation rule for code. Do not claim to have executed it. Respect active assessment restrictions. ${PYTHON_GENERATION_POLICY}`,
};

interface UngroundedVars {
 question: string;
 conversationHistory: string;
 responseLanguage: ResponseLanguage;
}

const tutorUngroundedAnswer: SystemPrompt<UngroundedVars> = {
 version: "tutor_rag/ungrounded_answer/v2.0.0",
 systemInstruction:
 "You are Zyra, a study assistant made by Zyx. Decide whether the request is within Zyx learning scope. In scope includes school and university subjects, mathematics, science, engineering, computing, academic language skills, course learning, exam preparation, study methods, and closely related educational questions. Casual follow-ups about the learning conversation are also in scope. Entertainment, shopping, gossip, and requests without a meaningful learning purpose are out of scope. For an out-of-scope request, set inScope=false and answer with one short redirection to a learning topic. For an in-scope request, set inScope=true. The student's question is not supported by their current course materials, but you may use your general model knowledge to teach it. Be explicit about the missing material boundary in one short sentence, then teach the general concept accurately. Do not claim that the answer came from Zyx course material and never fabricate citations. Do not open with a greeting, excitement, or filler. Speak naturally like a helpful kakak tingkat. Answer directly, explain in small steps when useful, and use an example or a short check question when it helps. Avoid formulaic learning goals and headings. Do not pretend the learner has understood before they respond. Maintain context from previous messages if the question is a follow-up. Put each substantial calculation step on its own display-math row with blank lines around it. Explain the reason between steps. Use aligned only for short connected equations; never squeeze a long derivation into one inline formula. CRITICAL INSTRUCTION ON MATH: You MUST wrap ALL math variables, equations, and formulas in LaTeX delimiters (`$...$` for inline, `$$...$$` for block). Never write raw formulas like `y = x^2` without `$` delimiters. Example: `$y = x^2 + 3x - 1$`. Never use em dashes or en dashes. Follow the response language specified in the user prompt. VISUAL OUTPUT RULE: Interactive visuals are rendered by the application itself from a separate structured channel that is not part of your answer text. Never output :::flowchart, :::graph, or :::chart markdown blocks, ASCII diagrams, or any other diagram markup. Your answer contains only prose, LaTeX math, lists, headings, and plain markdown tables.",
 userPrompt: (vars) => `CONVERSATION HISTORY:
${vars.conversationHistory || "No previous history."}

RESPONSE LANGUAGE: ${vars.responseLanguage === "en" ? "English" : "Bahasa Indonesia"}. ${responseLanguageInstruction(vars.responseLanguage)}

QUESTION: ${vars.question}

${TUTOR_MATH_PRESENTATION_POLICY}

IMAGE INPUT RULE: If images are attached, inspect them together with the question. Distinguish visible facts from inference, state uncertainty for blurry or cropped content, and never invent unreadable labels or values.

 Generate a single JSON object:
 {
 "inScope": [true when the request has a meaningful learning purpose within Zyx scope, otherwise false],
 "learningGoal": "[One short learner-facing goal in the specified response language]",
 "answer": "[Concise staged markdown explanation in the specified response language. Do not include the check question here. Do not use ::: visual markdown blocks.]",
 "checkForUnderstanding": "[An optional short question in the specified response language when useful]",
 "matchedConcepts": ["[general concept names this question is about]"],
 "confidence": [0.0 to 1.0]
}`,
};

const tutorImageAnswer: SystemPrompt<UngroundedVars> = {
 version: "tutor_rag/image_answer/v2.0.0",
 systemInstruction:
 "You are Zyra, a study assistant made by Zyx. One or more learner images are attached. Treat the attached images and the learner's current text as the primary problem statement. Inspect every image before answering. Never replace the image problem with a similar exercise from conversation history or course material. Do not invent links, citations, labels, numbers, or graph values. If an essential region is cropped, blurry, or too small to read, state exactly what cannot be read and ask for a clearer crop instead of solving a different problem. When the image is readable, answer the learner's requested problem directly with concise step-by-step reasoning. Distinguish visible facts from inference. If an active assessment safety policy applies, guide with concepts and steps without revealing protected answers. Return one JSON object matching the requested schema. Follow the response language specified in the user prompt. Use no exclamation marks or long dash characters.",
 userPrompt: (vars) => `RESPONSE LANGUAGE: ${vars.responseLanguage === "en" ? "English" : "Bahasa Indonesia"}. ${responseLanguageInstruction(vars.responseLanguage)}

CURRENT LEARNER REQUEST: ${vars.question}

${TUTOR_MATH_PRESENTATION_POLICY}

RECENT CONVERSATION FOR PRONOUN CONTINUITY ONLY:
${vars.conversationHistory || "No previous history."}

Inspect the attached image or images now. The current attachments override unrelated exercises in conversation history.

Generate a single JSON object:
{
 "inScope": true,
 "learningGoal": "[One short goal in the specified response language based only on the attached problem]",
 "answer": "[Direct, concise solution or a precise request for a clearer image. Do not add source links.]",
 "checkForUnderstanding": "[Exactly one short question in the specified response language about the solved concept]",
 "matchedConcepts": ["[concepts actually visible in the image]"],
 "confidence": [0.0 to 1.0]
}`,
};

const codingImageGenerationAnswer: SystemPrompt<UngroundedVars> = {
  ...tutorImageAnswer,
  version: "tutor_rag/coding_image_generation/v1.1.0",
  systemInstruction: `${tutorImageAnswer.systemInstruction} When the learner actually requests a program for a readable playground programming problem, generate the complete runnable Python program in one fenced python code block in the answer field. Do not provide only hints or placeholders. Use Markdown for code instead of LaTeX. If essential details are unreadable, ask for a clearer image. Never claim to have run the program. ${PYTHON_GENERATION_POLICY}`,
};

export function selectImageTutorPrompt(pageContextId: string | undefined, attemptState: string) {
  return pageContextId?.startsWith("coding:generate:") && attemptState === "none"
    ? codingImageGenerationAnswer : tutorImageAnswer;
}

interface PersonalVars {
 question: string;
 baseAnswer: string;
 conceptName: string;
 masteryScore: number;
 recentStruggles: string[];
 recentTutorTopics: string[];
 responseLanguage: ResponseLanguage;
}

const tutorPersonalGuidance: SystemPrompt<PersonalVars> = {
 version: "tutor_rag/personal_guidance/v2.0.0",
 systemInstruction:
 "You are Zyra, a friendly AI study assistant for university students made by Zyx. Keep your tone warm, concise, and clear. The student is weak on this concept. Break it into smaller steps, check one prerequisite, and gently address their recent mistake pattern. Keep it short (max 5 sentences). Never use em dashes or en dashes. Follow the response language specified in the user prompt.",
 userPrompt: (vars) => `RESPONSE LANGUAGE: ${vars.responseLanguage === "en" ? "English" : "Bahasa Indonesia"}. ${responseLanguageInstruction(vars.responseLanguage)}

QUESTION: ${vars.question}
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
 inScope: z.boolean().default(true),
 learningGoal: z.string().min(1).max(300).optional(),
 answer: z.string(),
 checkForUnderstanding: z.string().min(5).max(500).optional(),
 matchedConcepts: z.array(z.string()).default([]),
 confidence: z.number().min(0).max(1).default(0),
});

export function composeUngroundedTeachingAnswer(
  input: z.input<typeof UngroundedSchema>,
  responseLanguage: ResponseLanguage = "id",
): string {
  const data = UngroundedSchema.parse(input);
  const answer = sanitizeAnswer(data.answer);
  if (!data.inScope) {
    return answer || (responseLanguage === "en"
      ? "Zyra helps with learning topics within Zyx. Ask about a course concept, practice, or study strategy."
      : "Zyra membantu topik belajar dalam cakupan Zyx. Coba tanyakan konsep pelajaran, latihan, atau strategi belajar.");
  }
  const checkpoint = data.checkForUnderstanding?.trim();
  return checkpoint ? `${answer}\n\n${normalizeTutorMathMarkdown(checkpoint)}` : answer;
}

export function shouldRetrieveTutorEvidence(hasImages: boolean): boolean {
  return !hasImages;
}

const PersonalSchema = z.object({ guidance: z.string() });

// ─── Retrieval + hydration ────────────────────────────────────────────────────

interface RetrievedSource extends TutorSource {
 content: string;
 version?: number;
}

/**
 * Queries the course namespace and hydrates matches from the DB.
 * KO vectors carry conceptId/chapterId metadata; chunk vectors carry chunk_id.
 * Chapter filtering is native for KO vectors only (chunks have no chapter metadata).
 */
async function retrieve(
  courseId: string,
  chapterId: string | null,
  question: string,
  runtime?: {
    studentId: string;
    accessTier?: AllowanceAccessTier;
    freeChapterIds?: readonly string[];
    activityKind: ActivityKind;
    attemptState: AttemptState;
    answerReleaseState: AnswerReleaseState;
    matchState: MatchState;
  }
): Promise<RetrievedSource[]> {
 const canonicalRequest = {
  studentId: runtime?.studentId,
  courseId,
  chapterId,
  // Canonical runtime owns the final content decision. Keep the legacy
  // boolean for compatibility while also passing the explicit Free scope to
  // newer runtimes. The extra fields are intentionally server-owned.
  isEnrolled: runtime?.accessTier !== "free",
  accessTier: runtime?.accessTier ?? "standard",
  allowedChapterIds: runtime?.freeChapterIds,
  activityKind: runtime?.activityKind,
  attemptState: runtime?.attemptState,
  answerReleaseState: runtime?.answerReleaseState,
  matchState: runtime?.matchState,
 };
 const result = await retrieveCanonicalEvidence(canonicalRequest, question);
 return result.sources.map((source) => ({
  type: source.type,
  id: source.id,
  label: source.label,
  href: source.href,
  content: source.content,
  version: source.version,
 }));
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
 profile: LearnerProfile,
 responseLanguage: ResponseLanguage = "id",
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
 message: responseLanguage === "en"
   ? `You scored ${weak.masteryScore} here recently.`
   : `Skor pemahamanmu pada konsep ini ${weak.masteryScore}.`,
 reviewHref: `/courses/${courseId}/material`,
 flashcardsDue,
 };
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export interface AskTutorParams {
  studentId: string;
  courseId: string;
  /** Access lane is resolved by the server action, never by the client. */
  accessTier?: AllowanceAccessTier;
  /** First-two-chapter scope for the authenticated Free lane. */
  freeChapterIds?: readonly string[];
  /** Stable request key for one allowance reservation and safe retries. */
  idempotencyKey?: string;
  chapterId?: string | null;
  question: string;
  responseLanguage?: ResponseLanguage;
  sessionId?: string | null;
  activityKind?: ActivityKind;
  attemptState?: AttemptState;
  answerReleaseState?: AnswerReleaseState;
  matchState?: MatchState;
  protectedAnswers?: ProtectedItemPayload;
  pedagogyAction?: PedagogyContext["action"];
  previousHintLevel?: HintLevel;
  learnerResponseShape?: LearnerResponseShape;
  misconceptionUncertain?: boolean;
  pedagogyMode?: PedagogyExecutionMode;
  pedagogyShadowRunId?: string;
  pedagogyShadowCaseId?: string;
  suppressLearnerSideEffects?: boolean;
  pedagogyShadowObserver?: (output: {
    baselineAnswer: string;
    candidateAnswer: string;
  }) => void | Promise<void>;
  imageParts?: readonly Extract<ProviderInputPart, { type: "image" }>[];
  pageContext?: TutorPageContext | null;
}

export async function askTutorRag(params: AskTutorParams): Promise<TutorRagResult> {
  const requestStartedAt = Date.now();
  const { studentId, courseId, question, sessionId, protectedAnswers } = params;
  const imageParts = params.imageParts ?? [];
  const pageContext = params.pageContext ?? null;
  const hasPageContext = pageContext !== null;
  const hasCodingContext = Boolean(pageContext?.id.startsWith("coding:"));
  const hasImages = imageParts.length > 0;
  const accessTier = params.accessTier ?? "standard";
  const idempotencyKey = params.idempotencyKey;
  if (accessTier === "free" && hasImages) {
    throw new Error("FREE_TEXT_ONLY");
  }
  const emitOperationalOutcome = (resultCode: string, cached = false): void => {
    void recordZyraOperationalEventSafe({
      version: "zyra-ops-event-v1",
      eventType: "learner_outcome",
      actorRole: "murid",
      routeClass: hasImages ? "tutor_image" : "tutor_text",
      modelClass: hasImages ? "multimodal" : "text",
      projectFingerprint: null,
      courseFingerprint: zyraOperationalFingerprint(courseId),
      resultCode,
      latencyBucket: zyraLatencyBucket(Date.now() - requestStartedAt),
      sizeBucket: hasImages ? zyraSizeBucket(null) : zyraSizeBucket(new TextEncoder().encode(question).byteLength),
      cacheResult: hasImages ? "bypass" : cached ? "hit" : "miss",
      attachmentCount: imageParts.length,
      sanitizerVersion: hasImages ? "zyra-image-sanitizer-v1" : null,
    });
  };
  const chapterId = params.chapterId ?? null;
  const pedagogyMode = resolvePedagogyExecutionMode({
    requestedMode: params.pedagogyMode,
    environment: zyraRuntimeEnv.ZYX_ENVIRONMENT,
    configuredShadowUserId: zyraRuntimeEnv.STAGING_ZYRA_PEDAGOGY_USER_ID,
    userId: studentId,
  });
  if (pedagogyMode === "shadow" && (!params.pedagogyShadowRunId || !params.pedagogyShadowCaseId)) {
    throw new PedagogyShadowGuardError("PEDAGOGY_SHADOW_CONTEXT_REQUIRED");
  }
  if (params.suppressLearnerSideEffects && pedagogyMode !== "shadow") {
    throw new PedagogyShadowGuardError("PEDAGOGY_SIDE_EFFECT_SUPPRESSION_SHADOW_ONLY");
  }
  if (params.pedagogyShadowObserver && pedagogyMode !== "shadow") {
    throw new PedagogyShadowGuardError("PEDAGOGY_SHADOW_OBSERVER_SHADOW_ONLY");
  }

  const activityKind = params.activityKind ?? (params.attemptState && params.attemptState !== "none" ? "quiz" : "study");
  const attemptState = params.attemptState ?? "none";
  const answerReleaseState = params.answerReleaseState ?? (attemptState === "completed" ? "released" : "hidden");
  const matchState = params.matchState ?? "none";

  const policy = evaluateAssessmentAssistancePolicy({
    activityKind,
    attemptState,
    answerReleaseState,
    matchState,
  });

  const protectedPayload = protectedAnswers || {};
  const profile = accessTier === "free"
    ? { weakConcepts: [], masteredConcepts: [], recentStruggles: [], recentTutorTopics: [] } as LearnerProfile
    : await buildLearnerProfile(studentId, courseId);

  // Load conversation history context
  const history = sessionId
    ? await getConversationMemory({ studentId, courseId, sessionId, limit: 6 })
    : { recentMessages: [] };
  const conversation = history.recentMessages
    .filter((message) => attemptState !== "in_progress" || message.role === "student")
    .map((message) => ({ role: message.role, content: message.content.slice(0, 800) }));
  const historyText = conversation.map((message) => `${message.role === "student" ? "STUDENT" : "ZYRA"}: ${message.content}`).join("\n\n");
  const requestedResponseLanguage: ResponseLanguage = params.responseLanguage === "en" || params.responseLanguage === "id"
    ? params.responseLanguage
    : responseLanguageFromHistory(history.recentMessages) ?? "id";

  // Classify query action deterministically or via AI action classifier
  const classification = await classifyQueryAction(
    { question, historyMessages: history.recentMessages },
    {
      userId: studentId,
      // Free users receive one accepted question per day. Keep action
      // classification deterministic so an ambiguous multi-turn request
      // cannot spend a second allowance before the actual answer generation.
      deterministicOnly: accessTier === "free" || pedagogyMode !== "legacy" || hasImages,
    }
  );
  const responseLanguage = resolveResponseLanguage({
    requestedLanguage: requestedResponseLanguage,
    responseModifiers: classification.responseModifiers,
  });

  // 1. Action: Clarify. Free questions still pass through the allowance
  // boundary, so deterministic clarification cannot bypass the daily limit.
  if (classification.action === "clarify" && !hasImages && !hasCodingContext && accessTier !== "free") {
    emitOperationalOutcome("CLARIFY");
    return {
      answer: responseLanguage === "en"
        ? "Please ask a more specific question about the course material so I can help."
        : "Mohon berikan pertanyaan yang lebih spesifik atau jelas mengenai materi kuliah agar aku bisa membantu.",
      responseLanguage,
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
  if (classification.action === "answer_from_conversation" && !hasCodingContext) {
    const result = await PromptExecutor.run({
      userId: studentId,
      prompt: hasImages ? tutorImageAnswer : tutorUngroundedAnswer,
      variables: { question, conversationHistory: historyText, responseLanguage },
      schema: UngroundedSchema,
      useCase: USE_CASES.UNGROUNDED_TUTOR,
      providerParts: imageParts,
      maxAttempts: hasImages ? 1 : undefined,
      idempotencyKey,
    });
    let ansText = result.success && result.data
      ? sanitizeAnswer(result.data.answer)
      : responseLanguage === "en" ? "Hi, what would you like help learning today?" : "Halo, ada yang bisa aku bantu mengenai materi kuliah hari ini?";

    if (policy) {
      const val = validateTutorOutput(ansText, protectedPayload, policy.allowedHelpLevel);
      if (!val.valid) {
        ansText = responseLanguage === "en"
          ? "Let's focus on the core concept. How would you explain your current understanding?"
          : "Fokus pada pemahaman konsep dasarnya. Coba jelaskan pemahamanmu mengenai topik ini.";
      }
    }

    emitOperationalOutcome(result.success ? "CONVERSATION" : "CONVERSATION_FALLBACK");
    return {
      answer: ansText,
      responseLanguage,
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
  const searchQuestion = hasCodingContext ? question : classification.contentFocus || question;
  let cached = false;
  let budgetExhausted = false;
  let terminalFailure: TutorRagResult["failureCode"] | undefined;

  const generateGeneralTeachingFallback = async (): Promise<TutorRagAnswer | null> => {
    const useCase = USE_CASES.UNGROUNDED_TUTOR;
    const result = await PromptExecutor.run({
      userId: studentId,
      prompt: hasImages ? selectImageTutorPrompt(pageContext?.id, attemptState) : tutorUngroundedAnswer,
      variables: { question, conversationHistory: historyText, responseLanguage },
      schema: UngroundedSchema,
      useCase,
      providerParts: imageParts,
      maxAttempts: hasImages ? 1 : undefined,
      idempotencyKey,
    });

    if (!result.success || !result.data) {
      if (!result.errors[0]?.includes("DAILY_QUOTA_EXCEEDED")) {
        console.error("tutor general knowledge fallback failed:", result.errors[0]);
      }
      if (result.errors[0]?.includes("DAILY_QUOTA_EXCEEDED")) {
        budgetExhausted = true;
        terminalFailure = "quota_exhausted";
      } else {
        terminalFailure = "provider_unavailable";
      }
      return null;
    }

    if (useCase === USE_CASES.UNGROUNDED_TUTOR) {
      await UsageBudgetService.recordPremiumUsage(studentId);
    }

    let ansText = composeUngroundedTeachingAnswer(result.data, responseLanguage);
    if (policy) {
      const validation = validateTutorOutput(ansText, protectedPayload, policy.allowedHelpLevel);
      if (!validation.valid) {
        ansText = responseLanguage === "en"
          ? "Let's focus on the core concept first. Which definition or property applies here?"
          : "Fokus pada pemahaman konsep dasarnya. Coba definisikan dulu rumus atau sifat yang berlaku.";
      }
    }

    return {
      answer: ansText,
      sources: [],
      matchedConcepts: result.data.matchedConcepts,
      confidence: result.data.confidence,
      grounded: false,
      coverageState: "none",
    };
  };

  let retrieved: RetrievedSource[] = [];
  if (hasCodingContext || !shouldRetrieveTutorEvidence(hasImages)) {
    retrieved = [];
  } else if (classification.action === "reuse_previous_evidence") {
    // Reuse only the active exchange. An ungrounded latest reply must not
    // inherit evidence from an older topic; empty rehydration retrieves below.
    const historySources = latestConversationSources(history.recentMessages);
    const canonicalRequest = {
      studentId,
      courseId,
      chapterId,
      isEnrolled: accessTier !== "free",
      accessTier,
      allowedChapterIds: params.freeChapterIds,
      activityKind,
      attemptState,
      answerReleaseState,
      matchState,
    };
    const rehydrated = await rehydrateCanonicalSourceIds(canonicalRequest, historySources.map((source) => source.id));
    retrieved = rehydrated.sources.map((source) => ({
      type: source.type,
      id: source.id,
      label: source.label,
      href: source.href,
      content: source.content,
    }));
    if (retrieved.length === 0) {
      retrieved = await retrieve(courseId, chapterId, searchQuestion, { studentId, accessTier, freeChapterIds: params.freeChapterIds, activityKind, attemptState, answerReleaseState, matchState });
    }
  } else if (accessTier !== "free" && await isMetaExamQuery(searchQuestion)) {
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
      retrieved = await retrieve(courseId, chapterId, searchQuestion, {
        studentId,
        accessTier,
        freeChapterIds: params.freeChapterIds,
        activityKind,
      attemptState,
      answerReleaseState,
      matchState,
    });
  }

  if (pageContext && !hasImages) {
    retrieved = [
      {
        type: "question",
        id: pageContext.id,
        label: pageContext.label,
        href: pageContext.href,
        content: pageContext.content,
      },
      ...retrieved.filter((source) => source.id !== pageContext.id),
    ];
  }

  const evidenceVersion = computeEvidenceVersion(retrieved);
  const cacheKey = buildTutorCacheKey({
    courseId,
    chapterId,
    academicQuery: searchQuestion,
    evidenceVersion,
    responseLanguage,
  });

  const remoteCacheEnabled = conversation.length === 0 && !hasImages
    && accessTier !== "free"
    && !hasPageContext
    && zyraRuntimeEnv.FEATURE_ZYRA_SEMANTIC_CACHE_V1 === "1"
    && classification.action === "retrieve"
    && retrieved.length > 0
    && !attemptState;
  const remoteCache = remoteCacheEnabled ? new ZyraRemoteCache() : null;
  const evidenceHash = sha256(retrieved
    .map((source) => `${source.id}:${source.content ?? ""}`)
    .sort()
    .join(";"));
  const remoteIdentity = remoteCacheEnabled
    ? buildZyraCacheIdentity({
        courseId,
        ideas: retrieved.slice(0, 64).map((source) => ({ ideaId: source.id, version: 1 })),
        evidenceHash,
        normalizedIntent: searchQuestion,
        promptVersion: TUTOR_PROMPT_VERSION,
        policyVersion: TUTOR_POLICY_VERSION,
        responseSchemaVersion: TUTOR_SCHEMA_VERSION,
        evidenceVersion: evidenceHash,
        language: responseLanguage,
        routeClass: "default",
        visualCapabilityVersion: "visual-v1",
        assessmentMode: "none",
      })
    : null;
  const remoteCacheKey = remoteIdentity?.cacheKey;
  let remoteFlightId: string | null = null;
  let remoteCacheCandidate: TutorRagAnswer | null = null;
  let remoteCacheGateClosed = false;

  let base: TutorRagAnswer | null = null;
  let pedagogyFallback = false;
  let pedagogyShadow: PedagogyShadowComparison | undefined;
  let pedagogyCanvasSpec: CanvasSpec | null = null;

  // Shared Tier 1 cache lookup: ONLY for direct 'retrieve' actions
  if (conversation.length === 0 && accessTier !== "free" && classification.action === "retrieve" && !hasImages && !hasPageContext) {
    if (remoteCache && remoteCacheKey) {
      try {
        let shared = await remoteCache.get(remoteCacheKey);
        if (!shared) {
          const flight = await remoteCache.acquire(remoteCacheKey, `tutor-${sha256(studentId).slice(0, 24)}`);
          if (flight.status === "leader") {
            remoteFlightId = flight.flightId;
          } else if (flight.status === "completed") {
            shared = await remoteCache.get(remoteCacheKey);
          } else {
            shared = await remoteCache.waitForResult(remoteCacheKey, 10_000);
            if (!shared) remoteCacheGateClosed = true;
          }
        }
        if (shared) {
          base = sharedScaffoldToTutorAnswer(shared);
          cached = true;
        }
      } catch (error) {
        remoteCacheGateClosed = true;
        if (!(error instanceof CacheFlightError)) {
          console.error("zyra semantic cache request failed");
        }
      }
    } else {
      base = await kvGet<TutorRagAnswer>(cacheKey);
    }
    if (base && typeof base.answer === "string") {
      let ansText = sanitizeAnswer(base.answer, base.sources);

      if (policy) {
        const val = validateTutorOutput(ansText, protectedPayload, policy.allowedHelpLevel);
        if (!val.valid) {
          ansText = assessmentSafeFallback(responseLanguage);
        }
      }

      base = {
        ...base,
        answer: ansText,
        canvasSpec: isZyraCanvasFeatureEnabled() ? base.canvasSpec ?? null : null,
      };
      assertNoStudentTextInSharedCache(cacheKey, base, [studentId, sessionId ?? ""]);
      const cacheAllowance = await logCacheHit(
        studentId,
        "tutor_rag",
        accessTier,
        idempotencyKey ? `${idempotencyKey}:cache` : undefined,
      );
      if (cacheAllowance && !cacheAllowance.accepted) {
        const quotaExhausted = [
          "PER_MINUTE_LIMIT",
          "TOTAL_INTERACTION_LIMIT",
          "PROVIDER_TURN_LIMIT",
          "PREMIUM_LIMIT",
        ].includes(cacheAllowance.reason);
        budgetExhausted = quotaExhausted;
        terminalFailure = quotaExhausted ? "quota_exhausted" : "provider_unavailable";
        // Do not fall through to provider generation after a cache-hit
        // allowance rejection. The cached bytes are an answer interaction too.
        remoteCacheGateClosed = true;
        base = null;
      }
    } else {
      base = null;
    }
  }

  if (!base && !remoteCacheGateClosed) {
    if (retrieved.length === 0) {
      base = await generateGeneralTeachingFallback();
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

      // The coding descriptor is resolved and authorized by the server. A
      // short help button or follow-up need not lexically repeat Python source.
      const usesCurrentPageContext = pageContext !== null && (hasCodingContext || isCurrentQuizContextQuery(searchQuestion));
      const evidenceEval: EvidenceClassification = usesCurrentPageContext
        ? {
            state: "full",
            claims: [{
              claimId: "current-page-context",
              status: "supported",
              sourceIds: [pageContext.id],
            }],
            missingScope: [],
            conflictSummary: null,
            reasonCodes: ["CURRENT_QUIZ_PAGE_CONTEXT"],
          }
        : classifyEvidence({
            query: searchQuestion,
            sources: sourceEnvelopes,
          });

      if (evidenceEval.state === "conflict") {
        base = {
          answer: evidenceEval.conflictSummary ?? (responseLanguage === "en"
            ? "The course materials contain conflicting information. Please review the referenced sources."
            : "Terdapat perbedaan informasi pada sumber materi. Silakan tinjau kembali sumber yang dirujuk."),
          sources: contextSources.map((s) => ({ type: s.type, id: s.id, label: s.label, href: s.href })),
          matchedConcepts: [],
          confidence: 0,
          grounded: false,
          coverageState: "conflict",
        };
      } else if (evidenceEval.state === "none") {
        base = await generateGeneralTeachingFallback();
      } else {
        const contextBlock = buildSanitizedContextBlock(sourceEnvelopes);

        const sourceList = contextSources.map((s) => `${s.id} | ${s.type} | ${s.label}`).join("\n");
        const sanitizedQuestion = sanitizePromptInput(question);

        // Tier 1 shared generation: ZERO student history in prompt
        let result: {
          success: boolean;
          data?: z.infer<typeof GroundedSchema>;
          errors: string[];
          violationCodes: string[];
        };

        if (pedagogyMode !== "legacy") {
          const pedagogyAction = params.pedagogyAction
            ?? (classification.action === "reuse_previous_evidence" ? "follow_up" : "new_topic");
          const pedagogyContext = buildPedagogyContext({
            courseId,
            chapterId,
            question: sanitizedQuestion,
            responseLanguage,
            action: pedagogyAction,
            activityKind,
            attemptState,
            answerReleaseState,
            matchState,
            allowDirectAnswerReveal: policy?.allowDirectAnswerReveal ?? attemptState === "none",
            assessmentReasonCode: policy?.reasonCode ?? "ASSESSMENT_POLICY_DISABLED",
            evidenceSufficiency: evidenceEval.state === "full" ? "sufficient" : evidenceEval.state === "partial" ? "limited" : "insufficient",
            previousHintLevel: params.previousHintLevel,
            learnerResponseShape: params.learnerResponseShape,
            misconceptionUncertain: params.misconceptionUncertain ?? evidenceEval.state === "partial",
            responseModifiers: classification.responseModifiers,
          });
          const pedagogyEvidence: PedagogyEvidenceInput[] = contextSources.map((source) => ({
            id: source.id,
            version: source.version ?? 1,
            kind: source.type,
            title: source.label,
            content: source.content,
            href: source.href,
          }));
          const runCandidate = () => runPedagogicalTurn({
            userId: studentId,
            learnerQuestion: sanitizedQuestion,
            context: pedagogyContext,
            evidence: pedagogyEvidence,
            protectedAnswers,
            generate: true,
            cacheKey: pedagogyMode === "shadow" ? undefined : remoteCacheKey,
            cacheTtlSeconds: pedagogyMode === "shadow" ? undefined : remoteCache ? SHARED_TUTOR_TTL_SECONDS : undefined,
            idempotencyKey: pedagogyMode === "shadow"
              ? `pedagogy-shadow:${params.pedagogyShadowRunId}:${params.pedagogyShadowCaseId}:candidate`
              : idempotencyKey,
            imageParts,
            conversation,
          });

          if (pedagogyMode === "shadow") {
            const shadowStartedAt = Date.now();
            const [baselineResult, candidateResult] = await Promise.all([
              PromptExecutor.run({
                userId: studentId,
                prompt: hasCodingContext ? (pageContext?.id.startsWith("coding:generate:") && attemptState === "none" ? codingGenerationAnswer : codingGroundedAnswer) : tutorGroundedAnswer,
                variables: {
                  question: sanitizedQuestion,
                  contextBlock,
                  sourceList,
                  conversationHistory: historyText,
                  responseLanguage,
                },
                schema: GroundedSchema,
                useCase: USE_CASES.GROUNDED_RAG,
                cachePolicy: "bypass",
                maxAttempts: 1,
                idempotencyKey: `pedagogy-shadow:${params.pedagogyShadowRunId}:${params.pedagogyShadowCaseId}:legacy`,
              }),
              runCandidate(),
            ]);
            result = baselineResult;
            if (params.pedagogyShadowObserver) {
              const candidateSources = pedagogyEvidence.map((source) => ({ ...source, version: source.version ?? 1 }));
              const candidateAnswer = teachingResponseToTutorAnswer(candidateResult.response, candidateSources);
              await params.pedagogyShadowObserver({
                baselineAnswer: baselineResult.data?.answer ?? "",
                candidateAnswer: candidateAnswer.answer,
              });
            }
            pedagogyShadow = await recordPedagogyShadowComparison({
              runId: params.pedagogyShadowRunId!,
              caseId: params.pedagogyShadowCaseId!,
              courseId,
              baselineOutcome: baselineResult.outcome,
              candidateOutcome: candidateResult.outcome,
              selectedState: candidateResult.plan.state,
              hintLevel: candidateResult.plan.hintLevel,
              candidateUsedFallback: candidateResult.usedFallback,
              candidateViolationCodes: candidateResult.violationCodes,
              evidenceIds: pedagogyEvidence.map((source) => source.id),
              latencyMs: Date.now() - shadowStartedAt,
            });
          } else {
            const pedagogyResult = await runCandidate();
            pedagogyFallback = pedagogyResult.usedFallback;
            const pedagogySources = pedagogyEvidence.map((source) => ({ ...source, version: source.version ?? 1 }));
            const legacy = teachingResponseToTutorAnswer(pedagogyResult.response, pedagogySources);
            pedagogyCanvasSpec = legacy.canvasSpec ?? null;

            if (pedagogyResult.usedFallback) {
              const legacyFallback = await PromptExecutor.run({
                userId: studentId,
                prompt: hasCodingContext ? (pageContext?.id.startsWith("coding:generate:") && attemptState === "none" ? codingGenerationAnswer : codingGroundedAnswer) : tutorGroundedAnswer,
                variables: {
                  question: sanitizedQuestion,
                  contextBlock,
                  sourceList,
                  conversationHistory: historyText,
                  responseLanguage,
                },
                schema: GroundedSchema,
                useCase: USE_CASES.GROUNDED_RAG,
                cachePolicy: conversation.length ? "bypass" : remoteCache ? "public_scaffold" : undefined,
                cacheKey: remoteCacheKey,
                cacheTtlSeconds: remoteCache ? SHARED_TUTOR_TTL_SECONDS : undefined,
                idempotencyKey,
                structuredOutputMode: "legacy-fallback",
              });
              if (legacyFallback.success && legacyFallback.data?.answer) {
                result = {
                  success: true,
                  data: legacyFallback.data,
                  errors: [],
                  violationCodes: legacyFallback.violationCodes,
                };
              } else {
                result = {
                  success: true,
                  data: {
                    covered: legacy.grounded,
                    answer: legacy.answer,
                    sourceIds: pedagogyResult.response.citations.map((citation) => citation.sourceId),
                    matchedConcepts: legacy.matchedConcepts,
                    confidence: legacy.confidence,
                  },
                  errors: [],
                  violationCodes: pedagogyResult.violationCodes,
                };
              }
            } else {
              result = {
                success: true,
                data: {
                  covered: legacy.grounded,
                  answer: legacy.answer,
                  sourceIds: pedagogyResult.response.citations.map((citation) => citation.sourceId),
                  matchedConcepts: legacy.matchedConcepts,
                  confidence: legacy.confidence,
                },
                errors: [],
                violationCodes: pedagogyResult.violationCodes,
              };
            }
          }
        } else {
          result = await PromptExecutor.run({
            userId: studentId,
            prompt: hasCodingContext ? (pageContext?.id.startsWith("coding:generate:") && attemptState === "none" ? codingGenerationAnswer : codingGroundedAnswer) : tutorGroundedAnswer,
            variables: {
              question: sanitizedQuestion,
              contextBlock,
              sourceList,
              conversationHistory: historyText,
              responseLanguage,
            },
            schema: GroundedSchema,
            useCase: USE_CASES.GROUNDED_RAG,
            cachePolicy: conversation.length ? "bypass" : remoteCache ? "public_scaffold" : undefined,
            cacheKey: remoteCacheKey,
            cacheTtlSeconds: remoteCache ? SHARED_TUTOR_TTL_SECONDS : undefined,
            providerParts: imageParts,
            maxAttempts: hasImages ? 1 : undefined,
            idempotencyKey,
          });
        }

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

            let ansText = sanitizeAnswer(d.answer, sources);

            if (policy) {
              const validation = validateTutorOutput(ansText, protectedPayload, policy.allowedHelpLevel);
              if (!validation.valid) {
                ansText = assessmentSafeFallback(responseLanguage);
              }
            }

            base = {
              answer: ansText,
              sources,
              matchedConcepts: d.matchedConcepts,
              confidence: d.confidence,
              grounded: true,
              coverageState: finalCoverageState,
              canvasSpec: pedagogyCanvasSpec,
            };
          } else {
            let ansText = sanitizeAnswer(d.answer, retrieved);

            base = {
              answer: ansText,
              sources: [],
              matchedConcepts: d.matchedConcepts,
              confidence: d.confidence,
              grounded: false,
              coverageState: finalCoverageState === "full" ? "none" : finalCoverageState,
              canvasSpec: pedagogyCanvasSpec,
            };
          }

          const isEligibleToCache =
            conversation.length === 0 && classification.action === "retrieve" &&
            accessTier !== "free" &&
            !hasPageContext &&
            base.grounded &&
            (base.coverageState === "full" || base.coverageState === "partial") &&
            base.sources.length > 0 &&
            !pedagogyFallback;

          if (isEligibleToCache) {
            assertNoStudentTextInSharedCache(cacheKey, base, [studentId, sessionId ?? ""]);
            if (remoteCache && remoteFlightId) {
              remoteCacheCandidate = base;
            } else if (!remoteCache) {
              await kvPut(cacheKey, base, SHARED_TUTOR_TTL_SECONDS);
            }
          }
        } else if (result.errors[0]?.includes("DAILY_QUOTA_EXCEEDED")) {
          budgetExhausted = true;
          terminalFailure = "quota_exhausted";
        } else {
          console.error("tutor grounded generation failed:", result.errors[0]);
          terminalFailure = "provider_unavailable";
        }
      }
    }
  }

  if (remoteCache && remoteFlightId && remoteCacheKey && remoteIdentity) {
    try {
      if (remoteCacheCandidate) {
        const scaffold = tutorAnswerToSharedScaffold(remoteCacheCandidate, remoteIdentity);
        await remoteCache.put(remoteCacheKey, scaffold, SHARED_TUTOR_TTL_SECONDS);
        await remoteCache.complete(remoteCacheKey, remoteFlightId, `zyra:entry:v1:${sha256(remoteCacheKey).slice(0, 32)}`);
      } else {
        await remoteCache.fail(remoteCacheKey, remoteFlightId);
      }
    } catch {
      await remoteCache.fail(remoteCacheKey, remoteFlightId).catch(() => undefined);
    }
  }

 if (!base) {
 emitOperationalOutcome(terminalFailure === "quota_exhausted" ? "BUDGET_EXHAUSTED" : "PROVIDER_UNAVAILABLE");
 return {
 answer: "",
 responseLanguage,
 sources: [],
 matchedConcepts: [],
 confidence: 0,
 grounded: false,
 cached: false,
 addendum: null,
 personalized: null,
 budgetExhausted,
 failureCode: terminalFailure ?? "provider_unavailable",
 };
 }

 // Plan 008: learner-local adaptation runs after shared cache lookup and write.
 let adaptation: ZyraAdaptationDecision | null = null;
 let adaptedAnswer = base.answer;
 const readOnly = pedagogyMode === "shadow" || Boolean(params.suppressLearnerSideEffects);
 try {
   adaptation = await getZyraAdaptation({ studentId, courseId, readOnly });
   adaptedAnswer = composePersonalizedAnswer(base.answer, adaptation, responseLanguage);
   if (!readOnly) {
     await recordZyraLearningEvent(studentId, {
       courseId,
       eventKind: "tutor_question",
       sourceType: "tutor",
       outcome: "unknown",
       representation: "text",
     });
   }
 } catch {
   // Personalization is additive. A profile failure must not remove grounded text tutoring.
   adaptation = null;
   adaptedAnswer = base.answer;
 }

 // Tier 2: deterministic addendum, runs on hits AND misses
  const addendum = await buildAddendum(studentId, courseId, base, profile, responseLanguage);

  // The harness renders exactly the validated canvasSpec emitted by the model.
  // It never mines visuals out of prose: an answer without a structured spec
  // simply has no interactive visual.
  const recoveredCanvasSpec = isZyraCanvasFeatureEnabled()
    ? base.canvasSpec ?? null
    : null;

 // Tier 3: personalized AI, only for weak concepts, charged, silent on exhaustion
  let personalized: string | null = null;
  if (accessTier !== "free" && addendum && pedagogyMode === "legacy" && !hasImages) {
   const useCase = USE_CASES.WEAK_CONCEPT_GUIDANCE;
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
   responseLanguage,
   },
   schema: PersonalSchema,
   useCase,
   });
  if (result.success && result.data) {
  if (useCase === USE_CASES.WEAK_CONCEPT_GUIDANCE) {
  await UsageBudgetService.recordPremiumUsage(studentId);
  }
          let guidanceText = sanitizeAnswer(result.data.guidance);
          if (policy) {
            const val = validateTutorOutput(guidanceText, protectedPayload, policy.allowedHelpLevel);
            if (!val.valid) {
              guidanceText = responseLanguage === "en"
                ? "Tip: Review the core definition before trying a similar problem."
                : "Tips: Tinjau kembali definisi dasarnya sebelum mencoba soal serupa.";
            }
          }
          personalized = guidanceText;
        }
 // quota exceeded or failure: serve Tier 1+2 silently
 }

 // Session memory + learning event (deterministic)
  if (!params.suppressLearnerSideEffects) {
    if (base.matchedConcepts.length > 0) {
    await updateTutorSessionSummary(studentId, courseId, base.matchedConcepts);
    }
    await recordLearningEvent({
    studentId,
    courseId,
    eventType: "tutor_question",
    conceptName: base.matchedConcepts[0] ?? null,
    });
  }

  emitOperationalOutcome(base.grounded ? "GROUNDED" : "ABSTAIN", cached);
  return {
    ...base,
    responseLanguage,
    answer: adaptedAnswer,
    canvasSpec: recoveredCanvasSpec,
    cached,
    addendum,
    personalized,
    adaptation,
    budgetExhausted,
    pedagogyShadow,
  };
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
