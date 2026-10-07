import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function McpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      {/* Minimalist Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <Logo presentation="default" disableAnimation={true} className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-border/80 bg-muted/50 px-2.5 py-1 text-body-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-status-success" />
              <span>Otorisasi aman MCP</span>
            </div>
            <ThemeToggle mode="navbar" />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center py-8 sm:py-12 px-4 sm:px-6">
        {children}
      </main>

      {/* Minimalist Footer */}
      <footer className="w-full border-t border-border/60 py-6 text-center text-body-xs text-muted-foreground">
        <div className="container mx-auto flex max-w-5xl flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6">
          <p>Zyx Academy. Model Context Protocol authoring gateway.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privasi
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Ketentuan
            </Link>
            <Link href="/about" className="hover:text-foreground transition-colors">
              Tentang Zyx
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
