import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { ZyraAllowanceSummarySchema } from "@/lib/zyra/murid/contracts";
import { queryKeys } from "./keys";
import { requestJson, requireAccount } from "./http";

export const allowanceSchema = z.object({
  summary: ZyraAllowanceSummarySchema.extend({ accessTier: z.enum(["free", "standard"]).default("standard") }),
});
export const allowanceQuery = (userId: string | null, courseId?: string | null) => queryOptions({
  queryKey: queryKeys.allowance(userId, courseId), enabled: Boolean(userId),
  queryFn: async ({ signal }) => {
    requireAccount(userId);
    const search = courseId ? `?courseId=${encodeURIComponent(courseId)}` : "";
    return (await requestJson(`/api/zyra/allowance${search}`, allowanceSchema, { signal })).summary;
  },
  staleTime: 15_000,
});
