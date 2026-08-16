import { createHash } from "node:crypto";
import { db } from "@/db";
import { studentQuizAttempts, aiQuestionBank, knowledgeObjects, websiteMaterials, attemptFeedback, quizTemplates } from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { kvGet, kvPut } from "@/lib/kv-cache";
import { generateContentWithFallback } from "@/lib/gemini";
import { USE_CASES } from "@/lib/ai-router";
import { randomUUID } from "node:crypto";
import { validateTutorOutput } from "@/lib/assessment-assistance-policy";

interface FeedbackPayload {
 whyWrong: string;
 misconceptionName?: string | null;
 correctApproach: string[];
 reviewHref: string;
}

interface DistractorEntryShape {
 optionIndex: number;
 kind: string;
 misconceptionKoId: string | null;
 label: string;
}

/** First N sentences of a block of text, trimmed for a feedback card. */
function firstSentences(text: string, max = 2): string {
 const clean = text.replace(/\s+/g, " ").trim();
 const parts = clean.split(/(?<=[.!?])\s+/);
 return parts.slice(0, max).join(" ").slice(0, 400);
}

export function normalizeAnswer(indices: number[]): string {
 const sorted = [...indices].sort((a, b) => a - b);
 return JSON.stringify(sorted);
}

export function getAnswerHash(normalized: string): string {
 return createHash("sha256").update(normalized).digest("hex");
}

export async function getReviewHref(courseId: string, conceptName: string | null): Promise<string> {
 if (!conceptName) return `/courses/${courseId}`;
 
 const [row] = await db
 .select({ materialId: websiteMaterials.id })
 .from(websiteMaterials)
 .innerJoin(knowledgeObjects, eq(knowledgeObjects.chapterId, websiteMaterials.chapterId))
 .where(
 and(
 eq(websiteMaterials.courseId, courseId),
 eq(knowledgeObjects.conceptName, conceptName)
 )
 )
 .limit(1);

 if (row?.materialId) {
 return `/courses/${courseId}/material/${row.materialId}`;
 }
 return `/courses/${courseId}`;
}

export async function generateMistakeFeedback(attemptId: string): Promise<void> {
 // 1. Fetch attempt
 const [attempt] = await db
 .select()
 .from(studentQuizAttempts)
 .where(eq(studentQuizAttempts.id, attemptId))
 .limit(1);

 if (!attempt) {
 throw new Error(`Attempt ${attemptId} not found`);
 }

 if (attempt.status === "in_progress") {
   // In-progress attempts must not generate or expose answer feedback
   return;
 }

 const snapshot = attempt.questionsSnapshot as Array<{ id: string; correct_indices: number[] }>;
 const answers = (attempt.answersSnapshot as Record<string, number[]>) ?? {};

 // 2. Identify wrong answers
 const wrongQuestions: Array<{ id: string; correctIndices: number[]; submitted: number[]; index: number }> = [];
 
 snapshot.forEach((q, index) => {
 const submitted = answers[q.id] ?? [];
 const isCorrect =
 submitted.length === q.correct_indices.length &&
 submitted.every((i) => q.correct_indices.includes(i));
 
 if (!isCorrect) {
 wrongQuestions.push({
 id: q.id,
 correctIndices: q.correct_indices,
 submitted,
 index,
 });
 }
 });

 if (wrongQuestions.length === 0) {
 return;
 }

 // Resolve courseId from the template once.
 const [templateRow] = await db
 .select({ courseId: quizTemplates.courseId })
 .from(quizTemplates)
 .where(eq(quizTemplates.id, attempt.templateId))
 .limit(1);
 const resolvedCourseId = templateRow?.courseId || "calc-1";

 // Fetch bank details for ALL wrong questions up front (incl. distractor map).
 const allWrongIds = wrongQuestions.map((w) => w.id);
 const allBankRows = await db
 .select({
 id: aiQuestionBank.id,
 prompt: aiQuestionBank.prompt,
 options: aiQuestionBank.options,
 correctIndices: aiQuestionBank.correctIndices,
 explanation: aiQuestionBank.explanation,
 distractorMap: aiQuestionBank.distractorMap,
 conceptName: knowledgeObjects.conceptName,
 courseId: aiQuestionBank.courseId,
 })
 .from(aiQuestionBank)
 .leftJoin(knowledgeObjects, eq(aiQuestionBank.knowledgeObjectId, knowledgeObjects.id))
 .where(inArray(aiQuestionBank.id, allWrongIds));
 const bankMap = new Map(allBankRows.map((r) => [r.id, r]));

 // 3. Tier the wrong questions: deterministic (tagged misconception) first.
 const hits: Array<{ questionId: string; questionIndex: number; payload: FeedbackPayload }> = [];
 const deterministic: Array<{ questionId: string; questionIndex: number; payload: FeedbackPayload }> = [];
 const misses: Array<{ id: string; correctIndices: number[]; submitted: number[]; index: number; cacheKey: string }> = [];

 // Find selected misconception distractors so we can fetch their KO content in one query.
 const pendingForLLM: typeof wrongQuestions = [];
 const detPlan: Array<{ wq: (typeof wrongQuestions)[number]; entry: DistractorEntryShape }> = [];

 for (const wq of wrongQuestions) {
 const details = bankMap.get(wq.id);
 const dmap = (details?.distractorMap as DistractorEntryShape[] | null) ?? [];
 const submitted = new Set(wq.submitted);
 const tagged = dmap.find((e) => e.kind === "misconception" && e.misconceptionKoId && submitted.has(e.optionIndex));
 if (tagged) {
 detPlan.push({ wq, entry: tagged });
 } else {
 pendingForLLM.push(wq);
 }
 }

 // Build deterministic payloads from misconception KO content (no AI call).
 if (detPlan.length > 0) {
 const koIds = Array.from(new Set(detPlan.map((p) => p.entry.misconceptionKoId!).filter(Boolean)));
 const koRows = koIds.length
 ? await db
 .select({ id: knowledgeObjects.id, title: knowledgeObjects.title, content: knowledgeObjects.content })
 .from(knowledgeObjects)
 .where(inArray(knowledgeObjects.id, koIds))
 : [];
 const koMap = new Map(koRows.map((r) => [r.id, r]));

 for (const { wq, entry } of detPlan) {
 const details = bankMap.get(wq.id);
 const opts = (details?.options as string[]) ?? [];
 const correctIndices = (Array.isArray(details?.correctIndices) ? details!.correctIndices : []) as number[];
 const correctText = correctIndices.map((i) => opts[i] ?? `Opsi ${i}`).join(", ");
 const ko = entry.misconceptionKoId ? koMap.get(entry.misconceptionKoId) : undefined;
 const reviewHref = await getReviewHref(resolvedCourseId, details?.conceptName ?? null);

 const payload: FeedbackPayload = {
 whyWrong: ko
 ? firstSentences(ko.content)
 : "Pilihan yang kamu ambil mencerminkan miskonsepsi umum pada konsep ini.",
 misconceptionName: ko?.title ?? entry.label,
 correctApproach: [`Jawaban yang benar: ${correctText}`],
 reviewHref,
 };
 deterministic.push({ questionId: wq.id, questionIndex: wq.index, payload });
 }
 }

 // 4. Remaining questions: KV cache, then Gemini batch.
 for (const wq of pendingForLLM) {
 const norm = normalizeAnswer(wq.submitted);
 const hash = getAnswerHash(norm);
 const cacheKey = `feedback:${wq.id}:${hash}`;

 const cached = await kvGet<FeedbackPayload>(cacheKey);
 if (cached) {
 hits.push({ questionId: wq.id, questionIndex: wq.index, payload: cached });
 } else {
 misses.push({ ...wq, cacheKey });
 }
 }

 const newFeedbacks: Array<{ questionId: string; questionIndex: number; payload: FeedbackPayload }> = [];

 if (misses.length > 0) {

 // Build batch prompt
 let promptItems = "";
 misses.forEach((m) => {
 const details = bankMap.get(m.id);
 if (!details) return;

 const opts = (details.options as string[]) ?? [];
 const formattedOptions = opts.map((o, i) => `${i}: ${o}`).join("\n");
 const submittedAnswers = m.submitted.map((i) => opts[i] ?? `Option ${i}`).join(", ");
 const correctIndices = (Array.isArray(details.correctIndices) ? details.correctIndices : []) as number[];
 const correctAnswers = m.correctIndices.map((i) => opts[i] ?? `Option ${i}`).join(", ");

 promptItems += `
Question ID: ${m.id}
Concept: ${details.conceptName ?? "General"}
Question Prompt: ${details.prompt}
Options:
${formattedOptions}
Correct Indices: [${correctIndices.join(", ")}] (${correctAnswers})
Student's Selected Indices: [${m.submitted.join(", ")}] (${submittedAnswers})
Authoritative Question Explanation: ${details.explanation}
---
`;
 });

 const userPrompt = `You are Zyra, a friendly AI study assistant for Indonesian university students made by Zyx. Your tone is warm, casual, and encouraging ; like a kakak tingkat who has been through the same struggle. Use informal Indonesian (e.g. 'kamu', 'aku', 'nih', 'yuk') but stay accurate. Never use em dashes or en dashes.
Review the following student mistakes and generate clear, constructive feedback for each.
You must output a JSON array of objects. Do not include any Markdown wrapper like \`\`\`json. Output raw JSON only.

JSON schema:
\`\`\`json
[
 {
 "questionId": "string",
 "whyWrong": "Casual, friendly explanation in Indonesian of why the student's selected answer is incorrect. Explain the core flaw warmly without being condescending. No em or en dashes.",
 "misconceptionName": "Short descriptive label for the misconception (e.g. 'Normal force equals weight', 'Confusing limit with function value'), or null if none",
 "correctApproach": [
 "Step 1 to solve correctly in Indonesian",
 "Step 2 to solve correctly in Indonesian (max 3 steps)"
 ]
 }
]
\`\`\`

Mistakes to analyze:
${promptItems}`;

 try {
  const { response } = await generateContentWithFallback({
  useCase: USE_CASES.MISTAKE_FEEDBACK,
  contents: userPrompt,
  config: {
  responseMimeType: "application/json",
  },
  });

 const rawText = response.text || "";
 const cleanJSON = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
 const parsed = JSON.parse(cleanJSON) as Array<{
 questionId: string;
 whyWrong: string;
 misconceptionName?: string | null;
 correctApproach: string[];
 }>;

 for (const item of parsed) {
 const miss = misses.find((m) => m.id === item.questionId);
 if (!miss) continue;

  const details = bankMap.get(item.questionId);
  const reviewHref = await getReviewHref(resolvedCourseId, details?.conceptName ?? null);

  let whyWrongText = item.whyWrong;
  if (details) {
    const detailsAny = details as any;
    const correctOpts = Array.isArray(detailsAny.options) && Array.isArray(detailsAny.correctIndices)
      ? detailsAny.correctIndices.map((idx: number) => detailsAny.options[idx]).filter((v: any): v is string => typeof v === "string")
      : [];
    const val = validateTutorOutput(
      `${whyWrongText} ${(item.correctApproach || []).join(" ")}`,
      {
        correctOptions: correctOpts,
        explanationText: details.explanation ?? "",
      },
      "socratic_only"
    );
    if (!val.valid) {
      whyWrongText = "Periksa kembali konsep dasarnya untuk memahami letak kekeliruan.";
    }
  }

  const payload: FeedbackPayload = {
  whyWrong: whyWrongText,
  misconceptionName: item.misconceptionName || null,
  correctApproach: item.correctApproach || [],
  reviewHref,
  };

 // Cache it in KV
 await kvPut(miss.cacheKey, payload, 30 * 24 * 3600);

 newFeedbacks.push({
 questionId: item.questionId,
 questionIndex: miss.index,
 payload,
 });
 }
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err);
 const isQuota = /429|RESOURCE_EXHAUSTED|quota/i.test(msg);
 if (isQuota) {
 // Rethrow so Inngest retries with backoff; submission record is already written
 throw err;
 }
 console.error("Gemini mistake feedback generation failed:", err);
 // Fallback for non-quota errors: write placeholders so the student is not stuck
 for (const miss of misses) {
 const details = bankMap.get(miss.id);
 const reviewHref = await getReviewHref(resolvedCourseId, details?.conceptName ?? null);
 const payload: FeedbackPayload = {
 whyWrong: "Penjelasan otomatis gagal dibuat. Coba diskusikan soal ini bareng Zyra ya!",
 misconceptionName: null,
 correctApproach: ["Periksa kembali materi pembelajaran terkait."],
 reviewHref,
 };
 newFeedbacks.push({
 questionId: miss.id,
 questionIndex: miss.index,
 payload,
 });
 }
 }
 }

 // 5. Store all feedback rows (deterministic + cache hits + new) in database
 const allFeedback = [...deterministic, ...hits, ...newFeedbacks];
 if (allFeedback.length > 0) {
 const insertValues = allFeedback.map((f) => ({
 id: randomUUID(),
 attemptId,
 questionIndex: f.questionIndex,
 payload: f.payload,
 }));

 await db.insert(attemptFeedback).values(insertValues).onConflictDoNothing();
 }
}
