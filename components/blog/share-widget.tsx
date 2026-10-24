"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Copy, Check, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SiLine } from "react-icons/si";
import { useTranslations } from "@/lib/i18n/client";

// Custom SVG Brand Icons
const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" {...props}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

// Removed LineIcon custom SVG as we are using SiLine from react-icons/si library

const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="size-4.5" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" {...props}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

interface ShareBlockProps {
  slug?: string;
  title: string;
  description?: string;
  inline?: boolean;
  locale?: "id" | "en";
}

export function ShareBlock({ slug, title, description, inline = false, locale }: ShareBlockProps) {
  const t = useTranslations("marketing");
  const [shareUrl, setShareUrl] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [canShare, setCanShare] = React.useState(false);

  React.useEffect(() => {
    if (slug) {
      setShareUrl(`${window.location.origin}${locale ? `/${locale}` : ""}/blog/${slug}`);
    } else {
      setShareUrl(window.location.href);
    }
    
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      setCanShare(true);
    }
  }, [slug]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(t("blog.shareCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("blog.shareCopyFailed"));
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator === "undefined" || !(navigator as any).share) return;
    try {
      await navigator.share({
        title: title,
        text: description || title,
        url: shareUrl,
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(t("blog.shareFailed"));
      }
    }
  };

  const socialShares = [
    {
      name: "WhatsApp",
      icon: WhatsAppIcon,
      href: `https://api.whatsapp.com/send?text=${encodeURIComponent(title + " " + shareUrl)}`,
      color: "hover:bg-[#25D366]/10 hover:text-[#25D366] hover:border-[#25D366]/30",
      sizeClass: "size-5",
    },
    {
      name: "Line",
      icon: SiLine,
      href: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`,
      color: "hover:bg-[#06C755]/10 hover:text-[#06C755] hover:border-[#06C755]/30",
      sizeClass: "size-5.5", // SiLine looks best slightly larger to be readable
    },
    {
      name: "X (Twitter)",
      icon: XIcon,
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}`,
      color: "hover:bg-foreground/10 hover:text-foreground hover:border-foreground/30",
      sizeClass: "size-4.5",
    },
    {
      name: "Facebook",
      icon: FacebookIcon,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      color: "hover:bg-[#1877F2]/10 hover:text-[#1877F2] hover:border-[#1877F2]/30",
      sizeClass: "size-5",
    },
  ];

  return (
    <div className={cn("space-y-4", inline && "border border-border bg-card p-6 rounded-xl shadow-xs")}>
      {inline && (
        <div className="space-y-1">
          <h4 className="font-heading font-bold text-foreground text-body-base">
            {t("blog.shareArticleTitle")}
          </h4>
          <p className="text-body-sm text-muted-foreground">
            {t("blog.shareArticleDescription")}
          </p>
        </div>
      )}

      {/* Direct Copy Block */}
      <div className="space-y-1.5">
        <label className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider block">
          {t("blog.copyUrl")}
        </label>
        <div className="flex gap-2">
          <Input
            value={shareUrl}
            readOnly
            onClick={handleCopy}
            className="cursor-pointer bg-muted/30 select-all border-border hover:border-primary/50 transition-colors flex-1"
            title={t("blog.clickToCopy")}
          />
          <Button 
            variant="outline" 
            onClick={handleCopy}
            className="shrink-0"
            title={t("blog.copyUrl")}
          >
            {copied ? (
              <>
                <Check className="size-4 mr-1 text-status-success" />
                {t("blog.copy")}
              </>
            ) : (
              <>
                <Copy className="size-4 mr-1" />
                {t("blog.copy")}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Social Media Sharing */}
      <div className="space-y-1.5 pt-2">
        <label className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider block">
          {t("blog.shareTo")}
        </label>
        <div className="flex flex-wrap gap-2.5 items-center">
          {socialShares.map((social) => (
            <a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center justify-center rounded-full border border-border bg-card text-muted-foreground size-10 transition-all",
                social.color
              )}
              title={t("blog.shareToPlatform", { platform: social.name })}
            >
              <social.icon className={social.sizeClass} />
            </a>
          ))}

          {canShare && (
            <button
              onClick={handleNativeShare}
              className="flex items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 size-10 transition-all"
              title={t("blog.shareViaSystem")}
            >
              <Share2 className="size-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ShareDialogProps {
  slug?: string;
  title: string;
  description?: string;
  trigger?: React.ReactNode;
  locale?: "id" | "en";
}

export function ShareDialog({ slug, title, description, trigger, locale }: ShareDialogProps) {
  const t = useTranslations("marketing");
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Share2 className="size-4 mr-1.5" />
            {t("blog.share")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("blog.shareDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("blog.shareDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="pt-2">
          <ShareBlock slug={slug} title={title} description={description} locale={locale} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
