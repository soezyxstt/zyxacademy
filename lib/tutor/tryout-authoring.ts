import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { aiQuestionBank, exams, questions, submissions } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { normalizeQuestionProvenance } from "@/lib/asesmen/question-provenance";
import type { QuestionType, TryoutInput } from "@/packages/native-parity/academic/assessment/model";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TryoutExam = typeof exams.$inferSelect;
type TryoutQuestionRow = typeof questions.$inferSelect;
type TryoutMetadata = Omit<TryoutInput, "openAt" | "closeAt"> & { openAt?: string | null; closeAt?: string | null };

function settingsObject(value: unknown): Record<string, unknown> {
  let settings = value;
  if (typeof value === "string") {
    try { settings = JSON.parse(value); } catch { return {}; }
  }
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? settings as Record<string, unknown>
    : {};
}

export function tryoutMetadataRevision(row: TryoutExam): string {
  const { id, courseId, type, title, status, settings, openAt, closeAt, createdAt } = row;
  return revisionOf({ id, courseId, type, title, status, settings, openAt, closeAt, createdAt });
}

export function tryoutQuestionSetRevision(exam: TryoutExam, rows: readonly TryoutQuestionRow[]): string {
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  return revisionOf([tryoutMetadataRevision(exam), byId]);
}

export function selectableTryoutBankCondition(courseIds: string[]) {
  return and(
    inArray(aiQuestionBank.courseId, courseIds),
    eq(aiQuestionBank.reviewStatus, "published"),
    inArray(aiQuestionBank.origin, ["zyx_original", "itb_example"]),
  );
}

export function tryoutBankQuestionId(content: unknown): string | undefined {
  const bankQuestionId = settingsObject(content).bankQuestionId;
  return typeof bankQuestionId === "string" && bankQuestionId ? bankQuestionId : undefined;
}

export function lockTryoutExam(tx: Transaction, legacyCourseId: string, id: string, strength: "update" | "share" = "update") {
  return tx.select().from(exams).where(and(eq(exams.id, id), eq(exams.courseId, legacyCourseId),
    eq(exams.type, "tryout"))).limit(1).for(strength).then(([row]) => row ?? null);
}

export async function saveTryoutRecord(tx: Transaction, target: { id: string; legacyCourseId: string; previous: TryoutExam | null }, input: TryoutMetadata) {
  const fields = {
    title: input.title,
    status: input.status,
    settings: {
      ...settingsObject(target.previous?.settings),
      timeLimitMinutes: input.timeLimitMinutes,
      maxAttempts: input.maxAttempts,
    },
    openAt: input.openAt ? new Date(input.openAt) : null,
    closeAt: input.closeAt ? new Date(input.closeAt) : null,
  };
  const [saved] = target.previous
    ? await tx.update(exams).set(fields).where(and(eq(exams.id, target.id), eq(exams.courseId, target.legacyCourseId),
      eq(exams.type, "tryout"))).returning()
    : await tx.insert(exams).values({ id: target.id, courseId: target.legacyCourseId, type: "tryout", ...fields }).returning();
  if (!saved) throw new Error("TRYOUT_NOT_FOUND");
  return saved;
}

export type TryoutQuestionFields = Pick<TryoutQuestionRow, "order"> & {
  type: QuestionType;
  prompt: string;
  options?: string[];
  correctIndex?: number;
  correctIndices?: number[];
  acceptsImage?: boolean;
  acceptsFile?: boolean;
  acceptableAnswers?: string[];
};

/** The caller holds the parent exam's write lock. Submitted snapshots are independent rows. */
export async function saveTryoutQuestionRecord(tx: Transaction, target: { exam: TryoutExam; id: string; updating: boolean }, input: TryoutQuestionFields) {
  const withinExam = and(eq(questions.id, target.id), eq(questions.examId, target.exam.id));
  const [previous] = target.updating
    ? await tx.select().from(questions).where(withinExam).limit(1).for("update") : [];
  if (target.updating && !previous) throw new Error("TRYOUT_QUESTION_NOT_FOUND");
  const existing = settingsObject(previous?.content);
  const fields = {
    type: input.type,
    order: input.order,
    content: {
      ...existing,
      prompt: input.prompt,
      options: input.options ?? [],
      correctIndex: input.correctIndex,
      correctIndices: input.correctIndices ?? [],
      acceptsImage: input.acceptsImage ?? (existing.acceptsImage === true),
      acceptsFile: input.acceptsFile ?? false,
      acceptableAnswers: input.acceptableAnswers ?? [],
      ...normalizeQuestionProvenance(existing),
    },
  };
  const [saved] = target.updating
    ? await tx.update(questions).set(fields).where(withinExam).returning()
    : await tx.insert(questions).values({ ...fields, id: target.id, examId: target.exam.id }).returning();
  if (!saved) throw new Error("TRYOUT_QUESTION_NOT_FOUND");
  return saved;
}

/** The restrictive submissions FK is a backstop for the explicit check under the exam lock. */
export async function deleteTryoutRecord(tx: Transaction, exam: TryoutExam) {
  const [submission] = await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.examId, exam.id)).limit(1);
  if (submission) throw new Error("TRYOUT_HAS_SUBMISSIONS");
  await tx.delete(questions).where(eq(questions.examId, exam.id));
  const deleted = await tx.delete(exams).where(and(eq(exams.id, exam.id), eq(exams.courseId, exam.courseId), eq(exams.type, "tryout")))
    .returning({ id: exams.id });
  if (deleted.length !== 1) throw new Error("TRYOUT_NOT_FOUND");
}
