import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import Plans from "@/app/(marketing)/plans/plans-client";
import marketing from "@/messages/id/marketing.json";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="id" messages={{ marketing }} timeZone="UTC">
    <QueryClientProvider client={client}><Plans /></QueryClientProvider>
  </NextIntlClientProvider>,
);
