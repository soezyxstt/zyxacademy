"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { Download, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { saveAuthorizedFile } from "@/lib/native/files";

export type DiscussionAttachmentView = {
  id: string;
  name: string;
  url: string;
  downloadUrl?: string;
  alt?: string;
  width?: number;
  height?: number;
  previewAvailable?: boolean;
};

export function DiscussionAttachment({ attachment }: { attachment: DiscussionAttachmentView }) {
  const t = useTranslations("discussions");
  const common = useTranslations("common");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [fullFailed, setFullFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const expectedUrl = `/api/discussions/attachments/${encodeURIComponent(attachment.id)}`;
  const available = attachment.url === expectedUrl;
  const alt = attachment.alt || attachment.name || t("imageAlt");
  if (!available) return <div role="status" className="flex min-h-24 items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-body-xs text-muted-foreground"><ImageOff className="size-4 shrink-0" aria-hidden="true" />{t("imageUnavailable")}</div>;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const result = await saveAuthorizedFile({
        url: `${expectedUrl}?download=1`,
        fileName: attachment.name,
        title: attachment.name,
      });
      if (!result.ok && !result.cancelled) {
        toast.error(common(result.error === "unauthorized" ? "files.unauthorized" : "files.saveFailed"));
      }
    } finally {
      setSaving(false);
    }
  }

  return <Dialog onOpenChange={(open) => { if (open) { setFullFailed(false); setPreviewFailed(false); } }}>
    <DialogTrigger asChild>
      <button type="button" aria-label={t("enlargeImage", { name: alt })} className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {attachment.previewAvailable === false || previewFailed ? <span className="flex h-full flex-col items-center justify-center gap-2 p-3 text-body-xs text-muted-foreground"><ImageOff className="size-4 shrink-0" aria-hidden="true" /><span>{t("imagePreviewUnavailable")}</span><span className="text-primary underline underline-offset-2">{t("openImage")}</span></span> : <Image src={`${expectedUrl}?preview=1`} alt={alt} fill sizes="(max-width: 640px) 45vw, 240px" unoptimized className="object-cover" onError={() => setPreviewFailed(true)} />}
      </button>
    </DialogTrigger>
    <DialogContent aria-describedby={undefined} className="flex max-h-[calc(100dvh-2rem)] max-w-4xl flex-col gap-3 overflow-hidden p-4 sm:p-5">
      <DialogHeader className="max-h-24 shrink-0 overflow-y-auto">
        <DialogTitle className="break-all">{attachment.name}</DialogTitle>
      </DialogHeader>
      <div className="flex min-h-0 items-center justify-center overflow-auto rounded-lg bg-muted/40">
        {fullFailed ? <div role="status" className="flex flex-wrap items-center gap-2 p-3 text-body-xs text-muted-foreground"><ImageOff className="size-4 shrink-0" aria-hidden="true" />{t("imageUnavailable")}<Button type="button" variant="outline" size="sm" onClick={() => setFullFailed(false)}>{t("retry")}</Button></div> : <Image src={expectedUrl} alt={alt} width={attachment.width || 1200} height={attachment.height || 800} sizes="90vw" unoptimized className="max-h-[70dvh] w-auto max-w-full object-contain" onError={() => setFullFailed(true)} />}
      </div>
      <div className="shrink-0">
        <Button type="button" variant="outline" size="sm" isLoading={saving} onClick={() => void handleSave()}>
          <Download aria-hidden="true" />{t("download")}
        </Button>
      </div>
    </DialogContent>
  </Dialog>;
}
