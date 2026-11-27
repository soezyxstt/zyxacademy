"use client";

import { useEffect, useState, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import admin from "@/messages/id/admin.json";
import adminOps from "@/messages/id/adminOps.json";
import common from "@/messages/id/common.json";
import core from "@/messages/id/core.json";
import ui from "@/messages/id/ui.json";
import zyra from "@/messages/id/zyra.json";

export function MonitoringProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  return <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={{ admin, adminOps, common, core, ui, zyra }}>
    <QueryClientProvider client={queryClient}>
      <div data-monitoring-hydrated={String(hydrated)}>{hydrated ? children : null}</div>
    </QueryClientProvider>
  </NextIntlClientProvider>;
}
