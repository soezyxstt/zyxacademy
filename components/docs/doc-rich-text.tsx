import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

const INLINE_TOKEN_RE = /(\[[^\]]+\]\(\/[^)\s]+\)|`[^`]+`|\*\*[^*]+\*\*)/g;

export function DocRichText({ text }: { text: string }) {
  const parts = text.split(INLINE_TOKEN_RE);

  return (
    <>
      {parts.map((part, index): ReactNode => {
        if (!part) return null;

        if (part.startsWith("[") && part.includes("](/")) {
          const match = part.match(/^\[([^\]]+)\]\((\/[^)\s]+)\)$/);
          if (match) {
            const [, label, href] = match;
            const isPathLabel = label.startsWith("/");
            return (
              <Link
                key={index}
                href={href}
                className="inline-flex items-baseline gap-0.5 rounded-sm font-medium text-brand-primary underline decoration-brand-primary/35 underline-offset-4 transition-colors hover:decoration-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className={isPathLabel ? "font-mono text-[0.88em]" : undefined}>{label}</span>
                <ArrowUpRight className="size-3 shrink-0 translate-y-[1px] opacity-70" aria-hidden />
              </Link>
            );
          }
        }

        if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
          return (
            <code
              key={index}
              className="rounded-md border border-border/80 bg-muted/70 px-1.5 py-0.5 font-mono text-code text-foreground break-words"
            >
              {part.slice(1, -1)}
            </code>
          );
        }

        if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
          return (
            <strong key={index} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </>
  );
}
