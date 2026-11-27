import type { ReactNode } from "react";
import { headers } from "next/headers";
import { Providers } from "./providers";
import "./fixture.css";
export default async function Layout({ children }: { children: ReactNode }) {
  const locale = (await headers()).get("x-fixture-locale") === "en" ? "en" : "id";
  return <html lang={locale} suppressHydrationWarning><head><link rel="icon" href="data:," /></head><body><Providers locale={locale}>{children}</Providers></body></html>;
}
