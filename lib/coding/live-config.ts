import { z } from "zod";
import { codingLocatorSchema } from "./contracts";

/** Public question locator and policy sent by the authenticated room socket. */
export const liveCodingConfigSchema = codingLocatorSchema.extend({
  maxAttempts: z.number().int().positive().max(100).nullable(),
  assistance: z.enum(["disabled", "hints", "full"]),
  scoring: z.enum(["best", "latest"]),
  durationSeconds: z.number().int().min(30).max(3600),
}).strict();

export type LiveCodingConfig = z.infer<typeof liveCodingConfigSchema>;

/** The ad hoc Tutor flow uses one published problem and a five-minute round. */
export function adHocLiveCodingQuestion(problem: z.infer<typeof codingLocatorSchema>): LiveCodingConfig {
  return { ...problem, maxAttempts: null, assistance: "hints", scoring: "best", durationSeconds: 300 };
}
