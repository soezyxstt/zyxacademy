import { queryOptions } from "@tanstack/react-query";
import { pricingDiscountsSchema } from "@/lib/pricing-discounts";
import { requestJson } from "./http";
import { queryKeys } from "./keys";

export const pricingDiscountsQuery = () => queryOptions({
  queryKey: queryKeys.public.pricing(),
  queryFn: ({ signal }) => requestJson("/api/pricing", pricingDiscountsSchema, { signal }),
  staleTime: 0,
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always",
  retry: false,
});
