import { z } from "zod";
import { tryoutGradeNotesLimit, tryoutGradeRevisionPattern } from "@/packages/academic/tryout-grade";

export const tryoutGradeInputSchema = z.object({
  score: z.number().int().min(0).max(100),
  notes: z.string().max(tryoutGradeNotesLimit).refine((value) => !value.includes("\0")),
  expectedRevision: z.string().regex(tryoutGradeRevisionPattern).optional(),
}).strict();

export type TryoutGradeInput = z.input<typeof tryoutGradeInputSchema> & { courseId: string; submissionId: string };
export const registeredTryoutGradeInput = tryoutGradeInputSchema.required();

export const TRYOUT_GRADE_REQUEST_CONFLICT = "TUTOR_GRADING_CONFLICT: REQUEST_REUSED";
