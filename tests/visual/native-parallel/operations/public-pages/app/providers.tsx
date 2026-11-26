"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { Toaster } from "@/components/ui/toast";
import type { MessageCatalog } from "@/lib/i18n/catalogs";

export function Providers({ children, locale, theme, messages }: {
  children: ReactNode;
  locale: "id" | "en";
  theme: "light" | "dark";
  messages: Record<string, MessageCatalog>;
}) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  useEffect(() => {
    document.documentElement.dataset.publicReferenceReady = "true";
    return () => { delete document.documentElement.dataset.publicReferenceReady; };
  }, []);
  return <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" forcedTheme={theme} enableSystem={false}>
      <LocaleProvider initialLocale={locale} initialMessages={messages}>
        {children}
        <Toaster />
      </LocaleProvider>
    </ThemeProvider>
  </QueryClientProvider>;
}
