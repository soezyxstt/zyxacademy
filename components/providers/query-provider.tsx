"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query/client";
import { AccountTransitionBoundary } from "@/components/auth/account-transition-boundary";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AccountTransitionBoundary />
      {children}
    </QueryClientProvider>
  );
}
