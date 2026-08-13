import { z } from "zod";

const id = z.string().min(1);
const positiveInteger = z.number().int().positive();
const timestamp = z.string().datetime({ offset: true });

const snapshotValueSchema = z.unknown();

export const assessmentTypeSchema = z.enum(["quiz", "tryout"]);
export type AssessmentType = z.infer<typeof assessmentTypeSchema>;

export const cakupanQuizSchema = z
  .object({ assessmentType: z.literal("quiz"), chapterIds: z.array(id).length(1) })
  .strict();
export const cakupanTryoutSchema = z
  .object({ assessmentType: z.literal("tryout"), chapterIds: z.array(id).min(1) })
  .strict();
export const cakupanAsesmenSchema = z.discriminatedUnion("assessmentType", [cakupanQuizSchema, cakupanTryoutSchema]);
export const assessmentScopeSchema = cakupanAsesmenSchema;

export const immutableAttemptSnapshotSchema = z
  .object({
    renderedQuestion: snapshotValueSchema,
    optionOrder: z.array(id),
    response: snapshotValueSchema,
    gradingPolicy: snapshotValueSchema,
    contentVersion: positiveInteger,
  })
  .strict();
export type ImmutableAttemptSnapshot = z.infer<typeof immutableAttemptSnapshotSchema>;

export const blueprintAsesmenSchema = z
  .object({
    id,
    version: positiveInteger,
    assessmentType: assessmentTypeSchema,
    chapterIds: z.array(id).min(1),
    blueprintHash: z.string().min(1),
  })
  .strict()
  .superRefine((blueprint, ctx) => {
    if (blueprint.assessmentType === "quiz" && blueprint.chapterIds.length !== 1) {
      ctx.addIssue({ code: "custom", message: "quiz blueprint must target exactly one chapter", path: ["chapterIds"] });
    }
  });

export const asesmenSchema = z
  .object({
    id,
    blueprintId: id,
    title: z.string().min(1),
    version: positiveInteger,
    scope: cakupanAsesmenSchema,
    status: z.enum(["draft", "published", "archived"]),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const itemAsesmenSchema = z
  .object({
    id,
    assessmentId: id,
    questionId: id,
    orderIndex: z.number().int().nonnegative(),
    ideaIds: z.array(id).min(1),
    contentVersion: positiveInteger,
  })
  .strict();

export const percobaanAsesmenSchema = z
  .object({
    id,
    assessmentId: id,
    muridId: id,
    status: z.enum(["in_progress", "submitted", "graded"]),
    startedAt: timestamp,
    submittedAt: timestamp.nullable(),
  })
  .strict();

export const jawabanMuridSchema = z
  .object({
    id,
    attemptId: id,
    itemAssessmentId: id,
    renderedQuestionSnapshot: snapshotValueSchema,
    optionOrderSnapshot: z.array(id),
    responseSnapshot: snapshotValueSchema,
    gradingPolicySnapshot: snapshotValueSchema,
    contentVersionSnapshot: positiveInteger,
    submittedAt: timestamp,
  })
  .strict();
export type JawabanMurid = z.infer<typeof jawabanMuridSchema>;

export function attemptSnapshotFromAnswer(answer: JawabanMurid): ImmutableAttemptSnapshot {
  return immutableAttemptSnapshotSchema.parse({
    renderedQuestion: answer.renderedQuestionSnapshot,
    optionOrder: answer.optionOrderSnapshot,
    response: answer.responseSnapshot,
    gradingPolicy: answer.gradingPolicySnapshot,
    contentVersion: answer.contentVersionSnapshot,
  });
}

export function attemptSnapshotsEqual(left: ImmutableAttemptSnapshot, right: ImmutableAttemptSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}
