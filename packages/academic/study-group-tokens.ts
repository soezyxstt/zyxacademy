import { z } from "zod";

export const studyGroupTokensRead = z.object({
  groupId: z.string().min(1),
  tokens: z.array(z.object({
    id: z.string().min(1),
    token: z.string().min(1),
    capacity: z.number().int().nonnegative(),
  })),
});

export type StudyGroupTokensRead = z.infer<typeof studyGroupTokensRead>;
