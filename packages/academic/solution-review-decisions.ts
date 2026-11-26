import { z } from "zod";

const decision = z.enum(["approved", "changes_requested"]);
export const solutionItemDecisionSchema = z.object({
  itemId: z.string().min(1),
  itemHash: z.string().regex(/^[a-f0-9]{64}$/),
  correctness: decision,
  reasoning: decision,
  problemProvenance: decision,
  solutionProvenance: decision,
  release: decision,
  notes: z.string().trim().max(2000).optional(),
}).strict();
export type SolutionItemDecision = z.infer<typeof solutionItemDecisionSchema>;
