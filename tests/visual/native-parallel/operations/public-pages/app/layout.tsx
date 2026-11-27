import type { ReactNode } from "react";
import { headers } from "next/headers";
import { loadMessages } from "@/lib/i18n/catalogs";
import { Providers } from "./providers";
import "./fixture.css";

export default async function Layout({ children }: { children: ReactNode }) {
  const request = await headers();
  const locale = request.get("x-fixture-locale") === "en" ? "en" : "id";
  const dark = request.get("x-fixture-theme") === "dark";
  const messages = await loadMessages(locale);
  return <html lang={locale} suppressHydrationWarning className={dark ? "dark" : undefined}>
    <head><link rel="icon" href="data:," /></head>
    <body><Providers locale={locale} theme={dark ? "dark" : "light"} messages={messages}>{children}</Providers></body>
  </html>;
}
