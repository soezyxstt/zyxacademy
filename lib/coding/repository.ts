import { and, count, desc, eq, gt, lt, max, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { codingAttempts } from "@/db/schema";
import type { db as database } from "@/db";
import type { CodingAttempt, CodingAttemptRepository } from "./submissions";
import { codingEvaluationSchema } from "./contracts";

type Database = typeof database;
function toAttempt(row: typeof codingAttempts.$inferSelect): CodingAttempt {
  return { id: row.id, learnerId: row.learnerId, courseId: row.courseId, surface: row.surface, surfaceId: row.surfaceId, ordinal: row.ordinal, request: row.request, evaluation: row.evaluation };
}

export function createCodingAttemptRepository(db: Database): CodingAttemptRepository {
  const leases = new Map<string, string>();
  return {
    async reserve(input) {
      return db.transaction(async (tx) => {
        const scope = and(eq(codingAttempts.learnerId, input.learnerId), eq(codingAttempts.surface, input.surface), eq(codingAttempts.surfaceId, input.surfaceId));
        const [existing] = await tx.select().from(codingAttempts).where(and(scope, eq(codingAttempts.requestId, input.request.requestId))).limit(1);
        const now = Date.now();
        if (existing) {
          if (existing.courseId !== input.courseId || JSON.stringify(existing.request) !== JSON.stringify(input.request)) throw new Error("CODING_REQUEST_CONFLICT");
          if (existing.status === "completed" || (existing.status === "pending" && existing.leaseExpiresAt > now)) return { created: false, attempt: toAttempt(existing) };
          const token = randomUUID();
          const [reclaimed] = await tx.update(codingAttempts).set({ status: "pending", evaluation: null, leaseToken: token, leaseExpiresAt: now + 120_000 }).where(and(eq(codingAttempts.id, existing.id), eq(codingAttempts.leaseToken, existing.leaseToken))).returning();
          if (!reclaimed) throw new Error("CODING_ATTEMPT_BUSY");
          leases.set(reclaimed.id, token);
          return { created: true, attempt: toAttempt(reclaimed) };
        }
        if (input.deadlineMs !== null && now > input.deadlineMs) throw new Error("CODING_DEADLINE_PASSED");
        await tx.update(codingAttempts).set({ status: "failed" }).where(and(scope, eq(codingAttempts.status, "pending"), lt(codingAttempts.leaseExpiresAt, now)));
        const [stats] = await tx.select({ total: count() }).from(codingAttempts).where(and(scope, ne(codingAttempts.status, "failed")));
        const [sequence] = await tx.select({ ordinal: max(codingAttempts.ordinal) }).from(codingAttempts).where(scope);
        if (input.maxAttempts !== null && stats.total >= input.maxAttempts) throw new Error("CODING_ATTEMPT_LIMIT");
        // Only one active grading job per learner/surface. Prevent runtime resource flooding.
        const [pending] = await tx.select({ id: codingAttempts.id }).from(codingAttempts).where(and(eq(codingAttempts.learnerId, input.learnerId), eq(codingAttempts.status, "pending"), gt(codingAttempts.leaseExpiresAt, now))).limit(1);
        if (pending) throw new Error("CODING_ATTEMPT_BUSY");
        const token = randomUUID();
        const [row] = await tx.insert(codingAttempts).values({
          id: randomUUID(), learnerId: input.learnerId, courseId: input.courseId,
          problemId: input.request.problem.problemId, problemVersion: input.request.problem.version,
          surface: input.surface, surfaceId: input.surfaceId, requestId: input.request.requestId,
          ordinal: (sequence.ordinal ?? 0) + 1, request: input.request, status: "pending",
          leaseToken: token, leaseExpiresAt: now + 120_000,
        }).returning();
        leases.set(row.id, token);
        return { created: true, attempt: toAttempt(row) };
      });
    },
    async complete(attemptId, rawEvaluation) {
      const evaluation = codingEvaluationSchema.parse(rawEvaluation);
      const token = leases.get(attemptId);
      if (!token || evaluation.authority !== "trusted_server") throw new Error("CODING_INVALID_COMPLETION");
      const [row] = await db.update(codingAttempts).set({ evaluation, status: evaluation.verdict === "ungradable" ? "failed" : "completed" }).where(and(
        eq(codingAttempts.id, attemptId), eq(codingAttempts.leaseToken, token), eq(codingAttempts.status, "pending"), gt(codingAttempts.leaseExpiresAt, Date.now()),
        eq(codingAttempts.problemId, evaluation.problem.problemId), eq(codingAttempts.problemVersion, evaluation.problem.version),
      )).returning();
      if (!row) throw new Error("CODING_STALE_COMPLETION");
      leases.delete(attemptId);
      return toAttempt(row);
    },
  };
}

export function loadCodingHistory(db: Database, learnerId: string, problemId: string, version: number) {
  return db.select().from(codingAttempts).where(and(eq(codingAttempts.learnerId, learnerId), eq(codingAttempts.problemId, problemId), eq(codingAttempts.problemVersion, version))).orderBy(desc(codingAttempts.createdAt), desc(codingAttempts.ordinal)).limit(20);
}
