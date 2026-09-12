"use client";

import { useSyncExternalStore } from "react";
import { getPlanPricingPhase, type PlanPricingPhase } from "@/lib/pricing-constants";

function subscribe(update: () => void) {
  const timer = window.setInterval(update, 1000);
  window.addEventListener("focus", update);
  document.addEventListener("visibilitychange", update);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", update);
    document.removeEventListener("visibilitychange", update);
  };
}

// A neutral server snapshot prevents cached HTML from advertising an expired price.
const serverSnapshot = () => null;

export function usePlanPricingPhase() {
  return useSyncExternalStore<PlanPricingPhase | null>(subscribe, getPlanPricingPhase, serverSnapshot);
}
