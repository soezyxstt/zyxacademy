import { eq } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db";
import { aiQuestionBank } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type BankRow = typeof aiQuestionBank.$inferSelect;

export const questionBankInputSchema = z
  .object({
    prompt: z.string().min(1).max(4000),
    options: z.array(z.string().max(2000)),
    correctIndices: z.array(z.number().int()),
    acceptableAnswers: z.array(z.string().max(2000)).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    questionType: z.enum(["multiple_choice", "multiple_choices", "short_answer", "essay"]),
    explanation: z.string().max(8000),
    tags: z.array(z.string().max(64)).max(50),
  })
  .superRefine((val, ctx) => {
    const isChoiceType =
      val.questionType === "multiple_choice" || val.questionType === "multiple_choices";
    if (isChoiceType) {
      if (val.options.length < 2 || val.options.some((o) => !o.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "Pilihan jawaban wajib diisi minimal dua opsi.",
        });
      }
      if (val.correctIndices.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctIndices"],
          message: "Minimal satu kunci jawaban wajib dipilih.",
        });
      }
    }
    if (val.questionType === "short_answer") {
      const accepted = val.acceptableAnswers ?? [];
      if (accepted.length < 1 || accepted.some((a) => !a.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acceptableAnswers"],
          message: "Minimal satu kunci jawaban diterima wajib diisi.",
        });
      }
    }
  });

export type QuestionBankFields = z.infer<typeof questionBankInputSchema>;

export class QuestionBankWriteError extends Error {
  constructor(readonly code: "QUESTION_BANK_NOT_FOUND" | "QUESTION_BANK_WRONG_COURSE" | "HISTORICAL_QUESTION_IMMUTABLE" | "REVISION_CONFLICT") {
    super(code);
  }
}

export function questionBankRevision(row: BankRow) {
  const { useCount: _uses, qualityScore: _quality, ...content } = row;
  return revisionOf(content);
}

export async function writeQuestionBankRecord(tx: Tx, scope: { id: string; courseId: string; allowedCourseIds?: readonly string[]; expectedRevision?: string },
  mutation: { kind: "create" | "update"; data: QuestionBankFields } | { kind: "delete" }) {
  let previous: BankRow | null = null;
  if (mutation.kind !== "create") {
    const [row] = await tx.select().from(aiQuestionBank).where(eq(aiQuestionBank.id, scope.id)).limit(1).for("update");
    if (!row) throw new QuestionBankWriteError("QUESTION_BANK_NOT_FOUND");
    if (scope.allowedCourseIds && !scope.allowedCourseIds.includes(row.courseId)) throw new QuestionBankWriteError("QUESTION_BANK_WRONG_COURSE");
    if (row.origin !== "zyx_original") throw new QuestionBankWriteError("HISTORICAL_QUESTION_IMMUTABLE");
    if (scope.expectedRevision !== undefined && questionBankRevision(row) !== scope.expectedRevision) throw new QuestionBankWriteError("REVISION_CONFLICT");
    previous = row;
  }

  if (mutation.kind === "delete") {
    await tx.delete(aiQuestionBank).where(eq(aiQuestionBank.id, scope.id));
    return { previous, current: null };
  }
  const { data } = mutation;
  const values = {
    prompt: data.prompt, options: data.options, correctIndices: data.correctIndices,
    acceptableAnswers: data.acceptableAnswers ?? [], difficulty: data.difficulty,
    questionType: data.questionType, explanation: data.explanation, tags: data.tags,
  };
  const [current] = mutation.kind === "update"
    ? await tx.update(aiQuestionBank).set(values).where(eq(aiQuestionBank.id, scope.id)).returning()
    : await tx.insert(aiQuestionBank).values({ ...values, id: scope.id, courseId: scope.courseId, status: "active", reviewStatus: "published" }).returning();
  if (!current) throw new QuestionBankWriteError("QUESTION_BANK_NOT_FOUND");
  return { previous, current };
}
