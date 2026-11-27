import type { FormSheetConflict, FormSheetReceipt, ManagementReceipt } from "./management-contract";

const conflictCodes = new Set<FormSheetConflict>(["block_modified", "manual_rows", "manual_columns"]);

export function validFormSheetUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.origin === "https://docs.google.com" && !url.username && !url.password &&
      /^\/spreadsheets\/d\/[A-Za-z0-9_-]+(?:\/edit)?$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export function readFormSheetReceipt(value: unknown, id: string): FormSheetReceipt | null {
  if (!value || typeof value !== "object") return null;
  const received = value as ManagementReceipt;
  if (received.id !== id || !received.formSheet || typeof received.formSheet !== "object") return null;
  const sheet = received.formSheet;
  if (sheet.kind === "saved" && typeof sheet.created === "boolean" && typeof sheet.sharingIncomplete === "boolean") {
    const url = validFormSheetUrl(sheet.url);
    return url ? { ...sheet, url } : null;
  }
  if (sheet.kind === "confirm" && typeof sheet.revision === "string" && /^[a-f0-9]{64}$/.test(sheet.revision) &&
    Array.isArray(sheet.conflicts) && sheet.conflicts.length > 0 && sheet.conflicts.every(code => conflictCodes.has(code))) return sheet;
  return null;
}
