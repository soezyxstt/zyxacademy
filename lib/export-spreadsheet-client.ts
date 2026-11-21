import { googleErrorKey } from "./google-operation-error";

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
  | { status: "ok"; spreadsheetUrl: string; spreadsheetId: string; isNew: boolean; sharingIncomplete: boolean }
  | { status: "needs_confirmation"; revision: string; conflicts: SpreadsheetConflict[]; spreadsheetUrl: string }
  | { status: "error"; message: ReturnType<typeof googleErrorKey> | "adminAccess" | "network" };

async function postSpreadsheet(
  payload: SpreadsheetExportPayload & { confirmedRevision?: string }
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
        sharingIncomplete: data.sharingIncomplete === true,
        isNew: data.isNew,
      };
    }
    if (data?.needsConfirmation) {
      return {
        status: "needs_confirmation",
        revision: data.revision,
        conflicts: data.conflicts ?? [],
        spreadsheetUrl: data.spreadsheetUrl,
      };
    }
    return { status: "error", message: res.status === 403 || res.status === 401 ? "adminAccess" : googleErrorKey(data?.code) };
  } catch {
    return { status: "error", message: "network" };
  }
}

export function postSpreadsheetExport(payload: SpreadsheetExportPayload): Promise<SpreadsheetExportOutcome> {
  return postSpreadsheet(payload);
}

export function postSpreadsheetExportConfirmed(payload: SpreadsheetExportPayload, confirmedRevision: string): Promise<SpreadsheetExportOutcome> {
  return postSpreadsheet({ ...payload, confirmedRevision });
}
