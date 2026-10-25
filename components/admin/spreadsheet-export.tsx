"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { AlertTriangle } from "lucide-react";
import {
  postSpreadsheetExport,
  postSpreadsheetExportConfirmed,
  type SpreadsheetConflict,
  type SpreadsheetExportPayload,
} from "@/lib/export-spreadsheet-client";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";

export type SpreadsheetExportSuccess = { spreadsheetUrl: string; isNew: boolean };

const conflictMessageKey: Record<SpreadsheetConflict["code"], string> = {
  block_modified: "conflicts.blockModified",
  manual_rows: "conflicts.manualRows",
  manual_columns: "conflicts.manualColumns",
};

export function useSpreadsheetExport(opts: {
  onSuccess?: (result: SpreadsheetExportSuccess) => void;
  onError?: (message: string) => void;
}) {
  const t = useTranslations("admin.export");
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<{
    payload: SpreadsheetExportPayload;
    conflicts: SpreadsheetConflict[];
  } | null>(null);

  const runExport = useCallback(
    async (payload: SpreadsheetExportPayload) => {
      setExporting(true);
      try {
        const outcome = await postSpreadsheetExport(payload);
        if (outcome.status === "ok") {
          opts.onSuccess?.({ spreadsheetUrl: outcome.spreadsheetUrl, isNew: outcome.isNew });
        } else if (outcome.status === "needs_confirmation") {
          setPending({ payload, conflicts: outcome.conflicts });
        } else {
          opts.onError?.(outcome.message);
        }
      } finally {
        setExporting(false);
      }
    },
    [opts]
  );

  const confirmOverwrite = useCallback(async () => {
    if (!pending) return;
    setConfirming(true);
    try {
      const outcome = await postSpreadsheetExportConfirmed(pending.payload);
      if (outcome.status === "ok") {
        opts.onSuccess?.({ spreadsheetUrl: outcome.spreadsheetUrl, isNew: outcome.isNew });
      } else if (outcome.status === "error") {
        opts.onError?.(outcome.message);
      } else {
        opts.onError?.(t("overwriteError"));
      }
    } finally {
      setConfirming(false);
      setPending(null);
    }
  }, [pending, opts, t]);

  const confirmDialog = pending ? (
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

  return { exporting, confirming, confirmDialog, runExport };
}
