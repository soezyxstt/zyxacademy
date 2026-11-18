import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { ZyraAllowanceSummarySchema } from "./murid/contracts";
import { requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

export const allowanceSummarySchema = ZyraAllowanceSummarySchema.extend({ accessTier: z.enum(["free", "standard"]).default("standard") });
const allowanceResponseSchema = z.object({ summary: allowanceSummarySchema });
export type AllowanceSummaryView = z.infer<typeof allowanceSummarySchema>;

export function zyraAllowanceQuery(userId: string, courseId?: string) {
  return queryOptions({
    queryKey: queryKeys.zyra.allowance(userId, courseId),
    queryFn: ({ signal }) => requestJson(`/api/zyra/allowance?${new URLSearchParams({ courseId: courseId ?? "" })}`, allowanceResponseSchema, {
      signal, headers: { "x-student-id": userId },
    }),
    enabled: !!userId && !!courseId && courseId !== "unknown",
    staleTime: 30_000,
    retry: false,
  });
}
