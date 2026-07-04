/**
 * AI Question Generation Pipeline (Knowledge Object Architecture)
 *
 * Workflow:
 * Tutor Request → Create Job → Fetch KOs → Generate questions for each KO → Complete Job
 *
 * Runs asynchronously; the HTTP handler returns the job ID immediately.
 * The pipeline updates ai_generation_jobs status as it progresses.
 */

import { randomUUID } from 'crypto';
import { db } from '@/db';
import { aiGenerationJobs, knowledgeObjects } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateQuestionsForKOBatch } from '@/lib/question-generator';
import { inngest } from '@/lib/inngest';

export interface GenerationJobParams {
 courseId: string;
 tutorId: string;
 chapterId: string;
 koId?: string;
 targetCount: number;
}

/** In-memory log buffer per job ; flushed by flushJobProgress to avoid N+1 DB round trips. */
const progressBuffers = new Map<string, string[]>();

/** Buffers a progress step in memory. Call flushJobProgress to persist. */
export function bufferJobProgress(jobId: string, step: string): void {
 const buf = progressBuffers.get(jobId) ?? [];
 buf.push(`[${new Date().toLocaleString("id-ID")}] ${step}`);
 progressBuffers.set(jobId, buf);
}

/** Flushes buffered log entries into the DB with a single read-modify-write. */
export async function flushJobProgress(jobId: string): Promise<void> {
 const buf = progressBuffers.get(jobId);
 if (!buf || buf.length === 0) return;
 progressBuffers.set(jobId, []);

 const [job] = await db
 .select({ promptParameters: aiGenerationJobs.promptParameters })
 .from(aiGenerationJobs)
 .where(eq(aiGenerationJobs.id, jobId))
 .limit(1);

 if (job) {
 const params = (job.promptParameters as Record<string, any>) || {};
 const logs = [...((params.logs as string[]) || []), ...buf];
 await db
 .update(aiGenerationJobs)
 .set({ promptParameters: { ...params, logs }, updatedAt: new Date() })
 .where(eq(aiGenerationJobs.id, jobId));
 }
}

/** Buffers a step and immediately flushes ; backward-compatible for callers that need instant persistence. */
export async function updateJobProgress(jobId: string, step: string): Promise<void> {
 bufferJobProgress(jobId, step);
 await flushJobProgress(jobId);
}

/**
 * Creates a job row and dispatches the pipeline to Inngest. Returns the job ID.
 *
 * The actual work runs in the `ai.generation.job.start` Inngest worker
 * (see lib/inngest-functions.ts). This is required on Vercel: a fire-and-forget
 * promise is killed the moment the HTTP response is sent, leaving jobs stuck.
 */
export async function startGenerationJob(params: GenerationJobParams): Promise<string> {
 const jobId = randomUUID();
 const { courseId, tutorId, chapterId, koId, targetCount } = params;

 await db.insert(aiGenerationJobs).values({
 id: jobId,
 tutorId,
 courseId,
 status: 'pending',
 promptParameters: {
 chapterId,
 koId,
 logs: [`[${new Date().toLocaleString("id-ID")}] Job dibuat.`]
 } as Record<string, unknown>,
 targetCount,
 generatedCount: 0,
 tokenUsage: 0,
 });

 await inngest.send({
 name: 'ai.generation.job.start',
 data: { jobId, params },
 });

 return jobId;
}

/**
 * Executes the KO question-generation pipeline under Inngest step control.
 * Each KO batch is its own durable step so long jobs survive across
 * serverless invocations and are retried independently.
 */
export async function executeGenerationJob(
 step: any,
 jobId: string,
 params: GenerationJobParams
): Promise<{ generated: number; failedKOs: number }> {
 const { courseId, chapterId, koId } = params;

 await step.run('mark-processing', async () => {
 await db
 .update(aiGenerationJobs)
 .set({ status: 'processing', updatedAt: new Date() })
 .where(eq(aiGenerationJobs.id, jobId));
 await updateJobProgress(jobId, 'Status diubah ke processing. Memulai pipeline generasi berbasis Knowledge Objects.');
 });

 const activeKOs: Array<{ id: string; title: string }> = await step.run('fetch-active-kos', async () => {
 const conditions = [
 eq(knowledgeObjects.courseId, courseId),
 eq(knowledgeObjects.chapterId, chapterId),
 eq(knowledgeObjects.status, 'active'),
 ];
 if (koId && koId !== 'all') {
 conditions.push(eq(knowledgeObjects.id, koId));
 }
 return await db
 .select({ id: knowledgeObjects.id, title: knowledgeObjects.title })
 .from(knowledgeObjects)
 .where(and(...conditions));
 });

 if (activeKOs.length === 0) {
 await step.run('fail-no-kos', async () => {
 await updateJobProgress(jobId, 'Tidak ada Objek Pengetahuan aktif ditemukan.');
 await db
 .update(aiGenerationJobs)
 .set({ status: 'failed', errorMessage: 'Tidak ada Objek Pengetahuan aktif untuk diproses.', updatedAt: new Date() })
 .where(eq(aiGenerationJobs.id, jobId));
 });
 return { generated: 0, failedKOs: 0 };
 }

 await step.run('log-kos-found', async () => {
 await updateJobProgress(jobId, `Menemukan ${activeKOs.length} Objek Pengetahuan aktif untuk diproses.`);
 });

 const koTitleMap = new Map(activeKOs.map((k) => [k.id, k.title]));
 let successCount = 0;
 const errors: string[] = [];

 const BATCH_SIZE = 5;
 for (let i = 0; i < activeKOs.length; i += BATCH_SIZE) {
 const koBatch = activeKOs.slice(i, i + BATCH_SIZE);
 const koIds = koBatch.map((ko) => ko.id);

 const batchResult = await step.run(`generate-batch-${i}`, async () => {
 const localErrors: string[] = [];
 let localInserted = 0;
 try {
 bufferJobProgress(jobId, `Memulai batch generasi soal kuis untuk ${koIds.length} Objek Pengetahuan.`);
 const res = await generateQuestionsForKOBatch(koIds);
 for (const result of res.results) {
 const koTitle = koTitleMap.get(result.koId) || result.koId;
 if (result.success) {
 localInserted += result.insertedCount;
 bufferJobProgress(jobId, `Berhasil membuat soal untuk KO: "${koTitle}" (${result.insertedCount} soal dimasukkan).`);
 } else {
 const koError = result.errors.join('; ');
 localErrors.push(`KO "${koTitle}": ${koError}`);
 bufferJobProgress(jobId, `Gagal membuat soal untuk KO: "${koTitle}". Detail: ${koError}`);
 }
 }
 } catch (err: any) {
 const errMsg = err?.message || String(err);
 localErrors.push(`Batch KOs [${koIds.join(', ')}]: ${errMsg}`);
 bufferJobProgress(jobId, `Error saat memproses batch KO. Detail: ${errMsg}`);
 }
 await flushJobProgress(jobId);
 return { inserted: localInserted, errors: localErrors };
 });

 successCount += batchResult.inserted;
 errors.push(...batchResult.errors);

 await step.run(`update-count-${i}`, async () => {
 await db
 .update(aiGenerationJobs)
 .set({ generatedCount: successCount, updatedAt: new Date() })
 .where(eq(aiGenerationJobs.id, jobId));
 });
 }

 await step.run('finalize', async () => {
 if (errors.length > 0) {
 bufferJobProgress(jobId, `Generasi selesai dengan beberapa kesalahan. Jumlah kesalahan: ${errors.length}.`);
 } else {
 bufferJobProgress(jobId, 'Generasi selesai untuk semua Objek Pengetahuan.');
 }
 bufferJobProgress(jobId, 'Status job diperbarui. Pipeline selesai.');
 await flushJobProgress(jobId);

 await db
 .update(aiGenerationJobs)
 .set({
 status: errors.length === activeKOs.length ? 'failed' : 'completed',
 generatedCount: successCount,
 errorMessage: errors.length > 0 ? `Beberapa KO gagal diproses:\n${errors.slice(0, 3).join('\n')}` : null,
 updatedAt: new Date(),
 })
 .where(eq(aiGenerationJobs.id, jobId));
 });

 return { generated: successCount, failedKOs: errors.length };
}

