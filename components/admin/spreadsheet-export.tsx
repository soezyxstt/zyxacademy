"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n/client";

import { AdminIconAction } from "@/components/admin/icon-action";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { GoogleSetupHelp } from "@/components/admin/google-setup-help";
import { AlertTriangle, ExternalLink, Sheet } from "lucide-react";
import {
  postSpreadsheetExport,
  postSpreadsheetExportConfirmed,
  type SpreadsheetConflict,
  type SpreadsheetExportPayload,
} from "@/lib/export-spreadsheet-client";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { isNativeSystemBrowserSupported, openNativeSystemBrowser } from "@/lib/native/auth";

export type SpreadsheetExportSuccess = { spreadsheetUrl: string; isNew: boolean; sharingIncomplete: boolean };

const conflictMessageKey: Record<SpreadsheetConflict["code"], string> = {
  block_modified: "conflicts.blockModified",
  manual_rows: "conflicts.manualRows",
  manual_columns: "conflicts.manualColumns",
};

export function useSpreadsheetExport(opts: {
  scope: string;
  entityType: "form" | "quiz" | "pka";
  enabled?: boolean;
  initialUrl?: string | null;
  onSuccess?: (result: SpreadsheetExportSuccess) => void;
  onError?: (message: string) => void;
}) {
  const t = useTranslations("admin.export");
  const googleError = useTranslations("admin.googleSetup");
  const [exporting, setExporting] = useState(false);
  const [filtered, setFiltered] = useState<SpreadsheetExportPayload | null>(null);
  const [result, setResult] = useState<(SpreadsheetExportSuccess & { scope: string; title: string }) | null>(null);
  const { scope, entityType, initialUrl, enabled = true } = opts;
  const [saved, setSaved] = useState<{ scope: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!enabled || initialUrl) return;
    const abort = new AbortController();
    const params = new URLSearchParams({ entityType, entityId: scope });
    fetch(`/api/admin/export-spreadsheet?${params}`, { signal: abort.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) return;
        const data = await response.json();
        if (!abort.signal.aborted) setSaved({ scope, url: data.spreadsheetUrl });
      })
      .catch(() => {});
    return () => abort.abort();
  }, [scope, entityType, enabled, initialUrl]);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<{
    payload: SpreadsheetExportPayload;
    revision: string;
    conflicts: SpreadsheetConflict[];
  } | null>(null);

  const showResult = useCallback((outcome: SpreadsheetExportSuccess, title: string) => {
    setResult({ ...outcome, title, scope: opts.scope });
    toast.success(t(outcome.isNew ? "created" : "updated"));
    opts.onSuccess?.(outcome);
  }, [opts, t]);

  const submit = useCallback(
    async (payload: SpreadsheetExportPayload) => {
      setExporting(true);
      try {
        const outcome = await postSpreadsheetExport(payload);
        if (outcome.status === "ok") {
          showResult(outcome, payload.title);
        } else if (outcome.status === "needs_confirmation") {
          setPending({ payload, revision: outcome.revision, conflicts: outcome.conflicts });
        } else {
          opts.onError?.(googleError(outcome.message));
        }
      } finally {
        setExporting(false);
      }
    },
    [opts, googleError, showResult]
  );

  const confirmOverwrite = useCallback(async () => {
    if (!pending) return;
    setConfirming(true);
    try {
      const outcome = await postSpreadsheetExportConfirmed(pending.payload, pending.revision);
      setPending(null);
      if (outcome.status === "ok") {
        showResult(outcome, pending.payload.title);
      } else if (outcome.status === "error") {
        opts.onError?.(googleError(outcome.message));
      } else {
        setPending({ ...pending, revision: outcome.revision, conflicts: outcome.conflicts });
      }
    } finally {
      setConfirming(false);
    }
  }, [pending, opts, googleError, showResult]);

  function runExport(payload: SpreadsheetExportPayload, isFiltered = false) {
    if (isFiltered) setFiltered(payload);
    else void submit(payload);
  }

  const currentResult = result?.scope === scope ? result : null;
  const savedUrl = currentResult?.spreadsheetUrl ?? initialUrl ?? (saved?.scope === scope ? saved.url : null);
  const resultPanel = currentResult?.sharingIncomplete ? (
    <p role="status" className="text-body-xs text-foreground">{t("sharingIncomplete")}</p>
  ) : null;

  function sheetControls(onExport: () => void, disabled = false) {
    return (
      <div className="inline-flex items-center gap-1">
        {savedUrl && <AdminIconAction asChild variant="ghost" label={t("open")}>
          <a
            href={savedUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              if (!isNativeSystemBrowserSupported()) return;
              event.preventDefault();
              void openNativeSystemBrowser(savedUrl).then((opened) => {
                if (!opened) window.open(savedUrl, "_blank", "noopener,noreferrer");
              });
            }}
          >
            <ExternalLink />
          </a>
        </AdminIconAction>}
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={onExport}
          disabled={disabled || exporting || confirming} isLoading={exporting || confirming}>
          <Sheet aria-hidden />
          {t(savedUrl ? "updateSheet" : saved?.scope === scope ? "createSheet" : "sheet")}
        </Button>
        <GoogleSetupHelp service="sheets" />
      </div>
    );
  }

  const confirmDialog = filtered ? (
    <AdminConfirmDialog open onOpenChange={(open) => { if (!open) setFiltered(null); }}
      title={t("filteredTitle")} description={t("filteredDescription", { title: filtered.title, count: filtered.rows.length })}
      confirmLabel={t("filteredConfirm")} cancelLabel={t("cancel")}
      onConfirm={() => { setFiltered(null); void submit(filtered); }}
    />
  ) : pending ? (
    <AdminConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      destructive={false}
      icon={AlertTriangle}
      title={t("overwriteTitle")}
      confirmLabel={t("overwriteConfirm")}
      cancelLabel={t("cancel")}
      loading={confirming}
      onConfirm={confirmOverwrite}
      description={
        <div className="space-y-2">
          <p>{t("overwriteDescription")}</p>
          <ul className="list-disc pl-4 space-y-1">
            {pending.conflicts.map((conflict) => (
              <li key={conflict.code}>{t(conflictMessageKey[conflict.code])}</li>
            ))}
          </ul>
        </div>
      }
    />
  ) : null;

  return { exporting, confirming, confirmDialog, resultPanel, sheetControls, runExport };
}
