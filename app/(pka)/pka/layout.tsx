import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * Minimal, standalone shell for the Tutorial PKA campaign - deliberately
 * skips StudentSidebar/CoursePageShell so this reads as a distinct landing
 * microsite rather than the standard course experience, while still using
 * Zyx design tokens.
 */
export default function PkaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" aria-label="Zyx Academy" className="shrink-0">
            <Logo />
          </Link>
          <Link
            href="/courses"
            className="text-body-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Ke Zyx Academy
          </Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
