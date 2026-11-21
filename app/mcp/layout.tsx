import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTranslations } from "@/lib/i18n/server";

export default async function McpLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("consent");
  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      {/* Minimalist Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <Logo variant="horizontal" className="[--logo-height:1.25rem]" />
          </Link>
          <ThemeToggle mode="navbar" />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-start justify-center py-5 sm:py-8 px-4 sm:px-6">
        {children}
      </main>

      {/* Minimalist Footer */}
      <footer className="w-full border-t border-border/60 py-6 text-center text-body-xs text-muted-foreground">
        <div className="container mx-auto flex max-w-5xl flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6">
          <p>{t("shell.footerDescription")}</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              {t("shell.privacy")}
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              {t("shell.terms")}
            </Link>
            <Link href="/about" className="hover:text-foreground transition-colors">
              {t("shell.about")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
