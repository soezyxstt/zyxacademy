import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";
import { ZyraOpsMetricsSchema } from "./ops/contracts";

export function zyraOpsQuery(userId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.zyraOps(userId),
    queryFn: ({ signal }) => requestJson("/api/admin/zyra/ops", ZyraOpsMetricsSchema, { signal }),
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
