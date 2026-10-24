"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FormattedDate } from "@/components/ui/formatted-date";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { QRCodeSVG } from "qrcode.react";
import { Link as LinkIcon, QrCode, Copy } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useTranslations } from "@/lib/i18n/client";

type ShortLink = {
  id: string;
  slug: string;
  url: string;
  title: string | null;
  clicks: number;
  createdAt: string | number;
};

export default function ShortLinksPage() {
  const t = useTranslations("adminOps");
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  const fetchLinks = async () => {
    try {
      const res = await fetch("/api/admin/short-links");
      if (res.ok) {
        const data = await res.json();
        setLinks(data);
      }
    } catch (error) {
      console.error("Failed to fetch links", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, slug, title: title.trim() || null }),
      });

      if (res.ok) {
        const newLink = await res.json();
        setLinks([newLink, ...links]);
        setUrl("");
        setTitle("");
        setSlug("");
        toast.success(t("shortLinksUI.created"));
      } else {
        toast.error(t("shortLinksUI.createFailed"));
      }
    } catch (error) {
      console.error(error);
      toast.error(t("shortLinksUI.createFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t("shortLinksUI.copied"));
  };

  const getFullUrl = (slug: string) => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/s/${slug}`;
    }
    return `/s/${slug}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={LinkIcon} title={t("shortLinks.title")} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <div className="md:col-span-1">
          <Card className="p-4 gap-4">
            <CardHeader className="p-0">
              <CardTitle className="font-heading text-body-base font-bold">{t("shortLinksUI.createTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="url" className="text-body-sm font-semibold">
                    {t("shortLinksUI.destination")}
                  </Label>
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-body-sm font-semibold">
                    {t("shortLinksUI.title")}
                  </Label>
                  <Input
                    id="title"
                    type="text"
                    placeholder={t("shortLinksUI.titlePlaceholder")}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slug" className="text-body-sm font-semibold">
                    {t("shortLinksUI.customSlug")}
                  </Label>
                  <Input
                    id="slug"
                    type="text"
                    placeholder={t("shortLinksUI.slugPlaceholder")}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? t("shortLinksUI.creating") : t("shortLinksUI.create")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <TooltipProvider>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {loading ? (
                <div className="p-6 text-center text-body-sm text-muted-foreground">{t("shortLinksUI.loading")}</div>
              ) : links.length === 0 ? (
                <div className="p-4">
                  <AdminEmptyState compact title={t("shortLinksUI.empty")} />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {links.map((link) => (
                    <div
                      key={link.id}
                      className="p-3 sm:p-3.5 flex items-center justify-between gap-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <LinkIcon className="size-3.5 text-primary shrink-0" />
                          <span className="font-medium text-body-sm text-foreground truncate">
                            {link.title || `/s/${link.slug}`}
                          </span>
                          {link.title && (
                            <span className="text-body-xs text-muted-foreground">(/s/{link.slug})</span>
                          )}
                        </div>
                        <p className="text-body-xs text-muted-foreground truncate" title={link.url}>
                          {link.url}
                        </p>
                        <div className="text-body-xs text-muted-foreground flex items-center gap-1.5">
                          <span>{link.clicks} {t("shortLinksUI.clicks")}</span>
                          <span>·</span>
                          <FormattedDate
                            date={link.createdAt}
                            options={{ day: "numeric", month: "short", year: "numeric" }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              onClick={() => copyToClipboard(getFullUrl(link.slug))}
                              aria-label={t("shortLinksUI.copy")}
                            >
                              <Copy className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("shortLinksUI.copy")}</TooltipContent>
                        </Tooltip>

                        <Dialog>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="icon-sm" aria-label={t("shortLinksUI.qr")}>
                                  <QrCode className="size-3.5" />
                                </Button>
                              </DialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent>{t("shortLinksUI.qr")}</TooltipContent>
                          </Tooltip>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>{t("shortLinksUI.qrFor", { slug: link.slug })}</DialogTitle>
                            </DialogHeader>
                            <div className="flex flex-col items-center justify-center p-6 space-y-4">
                              <div className="bg-white p-4 rounded-xl border border-border shadow-sm">
                                <QRCodeSVG
                                  id={`qr-${link.slug}`}
                                  value={getFullUrl(link.slug)}
                                  size={200}
                                  level={"H"}
                                  includeMargin={true}
                                />
                              </div>
                              <Button
                                variant="secondary"
                                className="w-full text-body-sm"
                                onClick={() => {
                                  const svg = document.getElementById(`qr-${link.slug}`);
                                  if (!svg) return;
                                  const svgData = new XMLSerializer().serializeToString(svg);
                                  const canvas = document.createElement("canvas");
                                  const ctx = canvas.getContext("2d");
                                  const img = new Image();
                                  img.onload = () => {
                                    canvas.width = img.width;
                                    canvas.height = img.height;
                                    ctx?.drawImage(img, 0, 0);
                                    const pngFile = canvas.toDataURL("image/png");
                                    const downloadLink = document.createElement("a");
                                    downloadLink.download = `qrcode-${link.slug}.png`;
                                    downloadLink.href = `${pngFile}`;
                                    downloadLink.click();
                                  };
                                  img.src = "data:image/svg+xml;base64," + btoa(svgData);
                                }}
                              >
                                {t("shortLinksUI.downloadPng")}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
