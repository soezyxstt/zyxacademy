import "server-only";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { codingAttempts, liveQuizSessions, mataKuliah } from "@/db/schema";
import { env } from "@/lib/env";
import { deriveLiveCodingScore } from "./live";
import type { CodingProblemPrivate } from "./contracts";

export const liveCodingConfigSchema = z.object({
  problemId: z.string().min(1), version: z.number().int().positive(),
  maxAttempts: z.number().int().positive().max(100).nullable(),
  assistance: z.enum(["disabled", "hints", "full"]),
  scoring: z.enum(["best", "latest"]),
  durationSeconds: z.number().int().min(30).max(3600),
}).strict();
type Surface = { kind: "live_quiz"; sessionId: string; questionIndex: number };

export async function liveCodingRoomRequest(sessionId: string, operation: "coding-state" | "coding-reserve" | "coding-result", body: object) {
  const origin = env.NEXT_PUBLIC_REALTIME_URL, secret = env.LIVE_HMAC_SECRET;
  if (!origin || !secret) throw new Error("CODING_RUNTIME_CONFIGURATION_REQUIRED");
  const response = await fetch(`${origin}/room/${encodeURIComponent(sessionId)}/${operation}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(response.status === 403 ? "CODING_FORBIDDEN" : "CODING_DEADLINE_PASSED");
  return response.json();
}
export async function resolveLiveCodingSurface(surface: Surface, problem: CodingProblemPrivate, userId: string) {
  const [session] = await db.select({ id: liveQuizSessions.id }).from(liveQuizSessions).innerJoin(mataKuliah, eq(mataKuliah.legacyCourseId, liveQuizSessions.courseId)).where(and(eq(liveQuizSessions.id, surface.sessionId), eq(mataKuliah.id, problem.courseId))).limit(1);
  if (!session) throw new Error("CODING_INVALID_SURFACE");
  const state = await liveCodingRoomRequest(surface.sessionId, "coding-state", { userId, questionIndex: surface.questionIndex });
  const config = liveCodingConfigSchema.parse(state.coding);
  if (config.problemId !== problem.problemId || config.version !== problem.version) throw new Error("CODING_INVALID_SURFACE");
  if (!Number.isFinite(state.deadlineMs)) throw new Error("CODING_INVALID_SURFACE");
  return { surfaceId: `live:${surface.sessionId}:${surface.questionIndex}`, maxAttempts: config.maxAttempts, deadlineMs: state.deadlineMs as number, assistance: config.assistance };
}
export async function reserveLiveCodingExecution(surface: Surface, userId: string, requestId: string) {
  return liveCodingRoomRequest(surface.sessionId, "coding-reserve", { userId, questionIndex: surface.questionIndex, requestId });
}
export async function deliverLiveCodingResult(surface: Surface, problem: CodingProblemPrivate, userId: string, requestId: string) {
  const surfaceId = `live:${surface.sessionId}:${surface.questionIndex}`;
  const attempts = await db.select().from(codingAttempts).where(and(eq(codingAttempts.learnerId, userId), eq(codingAttempts.surfaceId, surfaceId), eq(codingAttempts.problemId, problem.problemId), eq(codingAttempts.problemVersion, problem.version))).orderBy(asc(codingAttempts.ordinal));
  const state = await liveCodingRoomRequest(surface.sessionId, "coding-state", { userId, questionIndex: surface.questionIndex });
  const config = liveCodingConfigSchema.parse(state.coding);
  const evaluations = attempts.flatMap((attempt) => attempt.evaluation ? [attempt.evaluation] : []);
  const score = deriveLiveCodingScore(problem, evaluations, config.scoring);
  return liveCodingRoomRequest(surface.sessionId, "coding-result", { userId, questionIndex: surface.questionIndex, requestId, score, ordinal: Math.max(0, ...attempts.map((attempt) => attempt.ordinal)) });
}
