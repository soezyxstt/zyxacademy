import { z } from "zod";
import { codingLocatorSchema, codingSubmissionRequestSchema, executionResultSchema, pythonSourceSchema } from "./contracts";
import { codingHelpIntentSchema } from "./zyra";

export const codingSurfaceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("article"), articleId: z.string().min(1), articleVersion: z.number().int().positive(), partId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("live_quiz"), sessionId: z.string().min(1), questionIndex: z.number().int().nonnegative() }).strict(),
]);
export const codingSubmitHttpSchema = z.object({ courseId: z.string().min(1), surface: codingSurfaceSchema, submission: codingSubmissionRequestSchema }).strict();
export const codingHelpRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("playground"), code: pythonSourceSchema, stdin: z.string().max(8000).default(""), execution: executionResultSchema.nullable(), intent: codingHelpIntentSchema }).strict(),
  z.object({ kind: z.literal("exercise"), problem: codingLocatorSchema, code: pythonSourceSchema, stdin: z.string().max(8000).default(""), intent: codingHelpIntentSchema, surface: codingSurfaceSchema, attemptId: z.string().min(1).optional(), execution: executionResultSchema.optional() }).strict(),
]);

export function codingSurfaceIdentity(surface: z.infer<typeof codingSurfaceSchema>): string {
  return surface.kind === "article"
    ? `article:${surface.articleId}:${surface.articleVersion}:${surface.partId}`
    : `live:${surface.sessionId}:${surface.questionIndex}`;
}
