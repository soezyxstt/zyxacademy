"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { pricingQuery } from "@/lib/query/pricing";

export function usePricingDiscounts() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = setInterval(update, 1000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const query = useQuery(pricingQuery());
  return { settings: query.isError ? undefined : query.data, now, error: query.isError };
}
