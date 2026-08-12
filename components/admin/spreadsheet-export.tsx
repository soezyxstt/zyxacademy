"use client";

import { useCallback, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  postSpreadsheetExport,
  postSpreadsheetExportConfirmed,
  type SpreadsheetConflict,
  type SpreadsheetExportPayload,
} from "@/lib/export-spreadsheet-client";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";

export type SpreadsheetExportSuccess = { spreadsheetUrl: string; isNew: boolean };

export function useSpreadsheetExport(opts: {
  onSuccess?: (result: SpreadsheetExportSuccess) => void;
  onError?: (message: string) => void;
}) {
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
        opts.onError?.("Gagal menimpa Google Spreadsheet.");
      }
    } finally {
      setConfirming(false);
      setPending(null);
    }
  }, [pending, opts]);

  const confirmDialog = pending ? (
    <AdminConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      destructive={false}
      icon={AlertTriangle}
      title="Timpa edit manual?"
      confirmLabel="Ya, Timpa"
      cancelLabel="Batal"
      loading={confirming}
      onConfirm={confirmOverwrite}
      description={
        <div className="space-y-2">
          <p>Export akan menimpa area data Zyx. Area di luar blok data (kolom kanan dan baris bawah) tetap aman:</p>
          <ul className="list-disc pl-4 space-y-1">
            {pending.conflicts.map((conflict) => (
              <li key={conflict.code}>{conflict.message}</li>
            ))}
          </ul>
        </div>
      }
    />
  ) : null;

  return { exporting, confirming, confirmDialog, runExport };
}
