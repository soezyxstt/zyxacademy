"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { explainBundleError } from "@/lib/bundle/admin-errors";
import { useTranslations } from "@/lib/i18n/client";

type Props = {
  kind: "idea" | "product";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStaged: (importId: string) => void;
};

export function MaterialBundleUploadDialog({ kind, open, onOpenChange, onStaged }: Props) {
  const t = useTranslations("adminAcademic");
  const adminT = useTranslations("admin");
  const mediaT = useTranslations("adminMedia");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = kind === "idea" ? t("materials.ideaTab") : t("materials.productTab");
  const endpoint = kind === "idea" ? "/api/admin/bundles/idea" : "/api/admin/bundles/product";
  const uploadError = kind === "idea" ? "IDEA_BUNDLE_UPLOAD_FAILED" : "PRODUCT_BUNDLE_UPLOAD_FAILED";

  function close(openState: boolean) {
    onOpenChange(openState);
    if (!openState) {
      setFile(null);
      setError(null);
    }
  }

  async function submit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const previewForm = new FormData();
      previewForm.set("file", file);
      previewForm.set("intent", "preview");
      const previewResponse = await fetch(endpoint, { method: "POST", body: previewForm });
      const previewPayload = await previewResponse.json() as { draft?: unknown; error?: string; reasonCodes?: string[] };
      if (!previewResponse.ok || !previewPayload.draft) throw new Error(previewPayload.reasonCodes?.join(", ") || previewPayload.error || uploadError);

      const stageForm = new FormData();
      stageForm.set("file", file);
      stageForm.set("intent", "stage");
      stageForm.set("draft", JSON.stringify(previewPayload.draft));
      const stageResponse = await fetch(endpoint, { method: "POST", body: stageForm });
      const stagePayload = await stageResponse.json() as { result?: { importId?: string }; error?: string; reasonCodes?: string[] };
      if (!stageResponse.ok || !stagePayload.result?.importId) throw new Error(stagePayload.reasonCodes?.join(", ") || stagePayload.error || `${kind.toUpperCase()}_BUNDLE_STAGE_FAILED`);

      close(false);
      onStaged(stagePayload.result.importId);
    } catch (uploadFailure) {
      setError(explainBundleError(uploadFailure instanceof Error ? uploadFailure.message : uploadError, (key) => adminT(`bundleErrors.${key}`)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("materials.uploadTitle", { label })}</DialogTitle>
          <DialogDescription>{t("materials.uploadDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); }} />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" />{mediaT("media.selectFile", { name: t("materials.zipFile") })}
            </Button>
            {file && <span className="min-w-0 break-all text-body-sm text-foreground">{file.name}</span>}
          </div>
          <p className="text-body-xs text-muted-foreground">{t("materials.uploadHint")}</p>
        </div>
        {error && <p className="rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-body-sm text-status-error">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)} disabled={loading}>{t("common.cancel")}</Button>
          <Button type="button" onClick={() => void submit()} disabled={!file || loading} isLoading={loading}><Upload className="size-4" />{t("materials.stageForReview")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
