"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { pricingDiscountsSchema } from "@/lib/pricing-discounts";

export function usePricingDiscounts() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = setInterval(update, 1000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const query = useQuery({
    queryKey: ["pricing-discounts"],
    queryFn: async () => {
      const response = await fetch("/api/pricing", { cache: "no-store" });
      if (!response.ok) throw new Error("Harga belum tersedia. Coba lagi.");
      return pricingDiscountsSchema.parse(await response.json());
    },
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
  });
  return { settings: query.isError ? undefined : query.data, now, error: query.isError };
}
