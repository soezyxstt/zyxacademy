export type SpreadsheetConflict = {
  code: "block_modified" | "manual_rows" | "manual_columns";
  message: string;
};

export type SpreadsheetExportPayload = {
  entityType: string;
  entityId: string;
  title: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
  folderSubpath?: string;
};

export type SpreadsheetExportOutcome =
  | { status: "ok"; spreadsheetUrl: string; spreadsheetId: string; isNew: boolean }
  | { status: "needs_confirmation"; conflicts: SpreadsheetConflict[]; spreadsheetUrl: string }
  | { status: "error"; message: string };

async function postSpreadsheet(
  payload: SpreadsheetExportPayload & { confirmOverwrite?: boolean }
): Promise<SpreadsheetExportOutcome> {
  try {
    const res = await fetch("/api/admin/export-spreadsheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data?.success) {
      return {
        status: "ok",
        spreadsheetUrl: data.spreadsheetUrl,
        spreadsheetId: data.spreadsheetId,
        isNew: data.isNew,
      };
    }
    if (data?.needsConfirmation) {
      return {
        status: "needs_confirmation",
        conflicts: data.conflicts ?? [],
        spreadsheetUrl: data.spreadsheetUrl,
      };
    }
    return { status: "error", message: data?.error || "Gagal membuat Google Spreadsheet." };
  } catch (err: any) {
    return { status: "error", message: err?.message || "Terjadi kesalahan koneksi Google Sheets API." };
  }
}

export function postSpreadsheetExport(payload: SpreadsheetExportPayload): Promise<SpreadsheetExportOutcome> {
  return postSpreadsheet(payload);
}

export function postSpreadsheetExportConfirmed(payload: SpreadsheetExportPayload): Promise<SpreadsheetExportOutcome> {
  return postSpreadsheet({ ...payload, confirmOverwrite: true });
}
