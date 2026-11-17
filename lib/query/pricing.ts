import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { pricingDiscountsSchema } from "@/lib/pricing-discounts";
import { queryKeys } from "./keys";
import { requestJson } from "./http";

export const pricingQuery = () => queryOptions({
  queryKey: queryKeys.pricing(),
  queryFn: ({ signal }) => requestJson("/api/pricing", pricingDiscountsSchema, { signal }),
  staleTime: 25_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: "always",
});

export async function cachePricingResponse(client: QueryClient, value: unknown) {
  const data = pricingDiscountsSchema.parse(value);
  const { queryKey } = pricingQuery();
  await client.cancelQueries({ queryKey, exact: true });
  client.setQueryData(queryKey, data);
}
