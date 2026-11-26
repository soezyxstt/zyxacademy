import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { aiQuestionBank, auditMutasi, quizTemplates } from "@/db/schema";
import { buildTutorMutationAuditRow, type TutorMutationAuditInput } from "@/lib/audit/mutasi";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { normalizeDate } from "@/lib/date-utils";
import { stableStringify } from "@/lib/staging/migration-ledger";
import { and, inArray, or } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class QuizTemplateWriteError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409, public readonly code: string) {
    super(code);
  }
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function nativeQuizWriteKey(req: Request): string | null {
  const key = req.headers.get("idempotency-key");
  if (key === null) return null;
  const fetchSite = req.headers.get("sec-fetch-site");
  if (req.headers.get("origin") !== new URL(resolveAuthBaseUrl()).origin || (fetchSite && fetchSite !== "same-origin")) {
    throw new QuizTemplateWriteError(403, "INVALID_ORIGIN");
  }
  if (!/^[a-zA-Z0-9_-]{12,128}$/.test(key) || req.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new QuizTemplateWriteError(400, "INVALID_QUIZ_WRITE");
  }
  return key;
}

export function nativeQuizTemplateId(actorId: string, courseId: string, key: string) {
  return `tpl-native-${digest([actorId, courseId, key]).slice(0, 32)}`;
}

export function nativeQuizAuditRequestId(actorId: string, route: string, key: string) {
  return `req-native-quiz-${digest([actorId, route, key])}`;
}

export function quizTemplateRevision(updatedAt: Date | string) {
  return normalizeDate(updatedAt).getTime();
}

export async function lockQuizCreateScope(tx: Tx, courseId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`zyx:quiz-create:${courseId}`}, 0))`);
}

export async function lockQuizTemplate(tx: Tx, id: string) {
  const [locked] = await tx.select().from(quizTemplates).where(eq(quizTemplates.id, id)).limit(1).for("update");
  if (!locked) throw new QuizTemplateWriteError(404, "QUIZ_NOT_FOUND");
  return locked;
}

export async function quizTemplateReceipt(tx: Tx, audit: TutorMutationAuditInput, payload: unknown) {
  const requestDigest = digest(payload);
  const row = buildTutorMutationAuditRow(audit);
  const [prior] = await tx.select({ actorId: auditMutasi.actorId, after: auditMutasi.afterSnapshot })
    .from(auditMutasi).where(eq(auditMutasi.id, row.id)).limit(1);
  if (!prior) return { replayed: false, requestDigest };
  const snapshot = prior.after?.snapshot;
  if (prior.actorId !== audit.actorId || !snapshot || typeof snapshot !== "object" ||
    (snapshot as Record<string, unknown>).requestDigest !== requestDigest) {
    throw new QuizTemplateWriteError(409, "QUIZ_REQUEST_CONFLICT");
  }
  return { replayed: true, requestDigest };
}

export async function validateNativeQuizSelection(tx: Tx, courseIds: string[], selectionRules: {
  fixedQuestionIds?: string[];
  count: number;
  difficulty_proportions?: { easy: number; medium: number; hard: number };
}) {
  const { fixedQuestionIds, count, difficulty_proportions } = selectionRules;
  if (fixedQuestionIds !== undefined) {
    if (fixedQuestionIds.length !== count || new Set(fixedQuestionIds).size !== count) {
      throw new QuizTemplateWriteError(400, "INVALID_QUIZ_SELECTION");
    }
    const picked = await tx.select({ id: aiQuestionBank.id }).from(aiQuestionBank).where(and(
      inArray(aiQuestionBank.id, fixedQuestionIds), inArray(aiQuestionBank.courseId, courseIds),
      eq(aiQuestionBank.reviewStatus, "published"),
      or(eq(aiQuestionBank.origin, "zyx_original"), eq(aiQuestionBank.origin, "itb_example"), eq(aiQuestionBank.quizEligible, true)),
    )).for("share");
    if (picked.length !== fixedQuestionIds.length) throw new QuizTemplateWriteError(400, "QUIZ_QUESTIONS_NOT_ELIGIBLE");
  } else if (!difficulty_proportions || Object.values(difficulty_proportions).reduce((sum, value) => sum + value, 0) !== count) {
    throw new QuizTemplateWriteError(400, "INVALID_QUIZ_SELECTION");
  }
}
