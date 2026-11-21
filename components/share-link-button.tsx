"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { shareLink } from "@/lib/native/share";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export interface ShareLinkButtonProps {
  title: string;
  text?: string;
  url?: string;
  variant?: "ghost" | "outline";
  size?: "icon-sm" | "icon-lg" | "sm";
  className?: string;
  iconClassName?: string;
}

export function ShareLinkButton({
  title,
  text,
  url,
  variant = "outline",
  size = "icon-sm",
  className,
  iconClassName,
}: ShareLinkButtonProps) {
  const common = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
    };
  }, []);

  const label = common("share.button");

  async function handleShare() {
    if (sharing) return;
    const targetUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!targetUrl) return;
    setSharing(true);
    try {
      const result = await shareLink({
        title,
        text,
        url: targetUrl,
        dialogTitle: label,
      });
      if (result.ok) {
        if (result.method === "clipboard") {
          setCopied(true);
          toast.success(common("share.linkCopied"));
          if (copiedTimerRef.current !== null) {
            clearTimeout(copiedTimerRef.current);
          }
          copiedTimerRef.current = setTimeout(() => {
            setCopied(false);
            copiedTimerRef.current = null;
          }, 2000);
        }
      } else if (!result.cancelled) {
        toast.error(common("share.failed"));
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={variant}
            size={size}
            aria-label={label}
            disabled={sharing}
            onClick={() => void handleShare()}
            className={cn(className)}
          >
            {copied ? (
              <Check className={cn("size-4 text-status-success", iconClassName)} aria-hidden="true" />
            ) : (
              <Share2 className={cn("size-4", iconClassName)} aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
