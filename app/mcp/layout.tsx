import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTranslations } from "@/lib/i18n/server";

export default async function McpLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("consent");
  return (
    <div className="relative flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-13 max-w-2xl items-center justify-between px-(--page-gutter)">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <Logo variant="horizontal" className="[--logo-height:1.25rem]" />
          </Link>
          <ThemeToggle mode="navbar" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-(--page-gutter) py-(--section-gap)">
        {children}
      </main>

      <footer className="border-t border-border/60 py-(--related-gap) text-body-xs text-muted-foreground">
        <nav className="mx-auto flex max-w-2xl flex-wrap items-center gap-(--related-gap) px-(--page-gutter)">
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            {t("shell.privacy")}
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            {t("shell.terms")}
          </Link>
          <Link href="/about" className="transition-colors hover:text-foreground">
            {t("shell.about")}
          </Link>
        </nav>
      </footer>
    </div>
  );
}
