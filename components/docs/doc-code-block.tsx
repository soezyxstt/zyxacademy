"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocLocale } from "@/lib/docs/types";

export function DocCodeBlock({
  label,
  code,
  locale,
}: {
  label?: string;
  code: string;
  locale: DocLocale;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const copyLabel = locale === "en" ? "Copy" : "Salin";
  const copiedLabel = locale === "en" ? "Copied" : "Disalin";

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-between gap-2 border-b border-border/80 bg-muted/40 px-3.5 py-2">
        <span className="truncate text-metadata font-medium text-muted-foreground">
          {label ?? (locale === "en" ? "Example" : "Contoh")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={handleCopy}
          aria-label={copied ? copiedLabel : copyLabel}
          className="text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="size-3.5 text-status-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          <span>{copied ? copiedLabel : copyLabel}</span>
        </Button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-code text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
