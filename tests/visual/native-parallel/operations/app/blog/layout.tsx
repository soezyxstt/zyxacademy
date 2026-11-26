import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import MarketingLayout from "@/app/(marketing)/layout";
import { QueryProvider } from "@/components/providers/query-provider";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getAppLocale } from "@/lib/i18n/server";
import { loadCatalog } from "@/lib/i18n/catalogs";

export default async function BlogFixtureLayout({ children }: { children: ReactNode }) {
  if (process.env.BLOG_SHELL_FIXTURE !== "1") return children;

  const locale = await getAppLocale();
  const catalogs = ["marketing", "ui", "learning", "common", "core", "notifications"];
  const messages = Object.fromEntries(await Promise.all(catalogs.map(async (catalog) =>
    [catalog, await loadCatalog(locale, catalog)],
  )));
  return (
    <QueryProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <LocaleProvider initialLocale={locale} initialMessages={messages}>
          <div className="flex min-h-screen flex-col font-sans">
            <MarketingLayout>{children}</MarketingLayout>
          </div>
        </LocaleProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
