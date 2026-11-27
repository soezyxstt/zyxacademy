import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { readDocInline } from "@/packages/academic/docs/inline";

export function DocRichText({ text }: { text: string }) {
  const parts = readDocInline(text);

  return (
    <>
      {parts.map((part, index): ReactNode => {
        if (part.kind === "link") {
          const { text: label, href } = part;
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

        if (part.kind === "code") {
          return (
            <code
              key={index}
              className="rounded-md border border-border/80 bg-muted/70 px-1.5 py-0.5 font-mono text-code text-foreground break-words"
            >
              {part.text}
            </code>
          );
        }

        if (part.kind === "strong") {
          return (
            <strong key={index} className="font-semibold text-foreground">
              {part.text}
            </strong>
          );
        }

        return <span key={index}>{part.text}</span>;
      })}
    </>
  );
}
