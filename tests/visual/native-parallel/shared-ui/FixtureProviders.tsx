"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

export function FixtureProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
