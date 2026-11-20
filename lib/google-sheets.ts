import { createHash } from "node:crypto";
import { getGoogleFormsAccessToken } from "@/lib/google-forms";
import { db } from "@/db";
import { exportSpreadsheets, customForms, quizTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllAdminEmails } from "@/lib/google-drive-permissions";

type CellValue = string | number | boolean | null | undefined;

export type SpreadsheetConflictCode = "block_modified" | "manual_rows" | "manual_columns";

export interface SpreadsheetConflict {
  code: SpreadsheetConflictCode;
  message: string;
}

export interface SyncSpreadsheetInput {
  entityType: "form" | "quiz" | "pka" | "system";
  entityId: string;
  title: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
  folderSubpath?: string; // e.g. "forms/Feedback"
  confirmOverwrite?: boolean; // Trusted MCP callers verify the sheet fingerprint before syncing.
  confirmedRevision?: string;
}

export interface SyncSpreadsheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  isNew: boolean;
  sharingIncomplete?: boolean;
  revision?: string;
  needsConfirmation?: boolean;
  conflicts?: SpreadsheetConflict[];
}

function normalizeCell(value: CellValue): string {
  return value === null || value === undefined ? "" : String(value);
}

export function gridFingerprint(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const normalized = [headers.map(normalizeCell), ...rows.map((row) => row.map(normalizeCell))];
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function detectConflicts(params: {
  prevGrid: string[][];
  prevHeaderCount: number;
  prevRowCount: number;
  newHeaders: string[];
  newRows: (string | number | boolean | null | undefined)[][];
  storedFingerprint?: string | null;
}): SpreadsheetConflict[] {
  const { prevGrid, prevHeaderCount, prevRowCount, newHeaders, newRows, storedFingerprint } = params;
  const conflicts: SpreadsheetConflict[] = [];

  const prevLastRow = Math.max(prevRowCount, 1);
  const prevLastCol = Math.max(prevHeaderCount, 1);
  const newLastRow = newRows.length + 1;
  const newLastCol = newHeaders.length;

  // 1. Manual edits inside the previously owned block: compare the stored fingerprint
  //    with a fingerprint of the same block in the current grid.
  if (storedFingerprint) {
    const blockRows = prevGrid.slice(0, Math.min(prevLastRow, prevGrid.length)).map((row) => row.slice(0, prevLastCol));
    const blockHeaders = blockRows[0] ?? [];
    const blockData = blockRows.slice(1).map((row) => {
      while (row.length < prevLastCol) row.push("");
      return row;
    });
    const currentBlockFingerprint = gridFingerprint(blockHeaders, blockData);
    if (currentBlockFingerprint !== storedFingerprint) {
      conflicts.push({
        code: "block_modified",
        message: "Ada edit manual di dalam blok data. Export akan menimpa area data yang sudah Anda ubah.",
      });
    }
  }

  // 2. Manual rows: any non-empty cell below the previous block within the previous columns.
  let hasManualRows = false;
  for (let r = prevLastRow; r < Math.min(prevGrid.length, newLastRow); r++) {
    for (let c = 0; c < newLastCol; c++) {
      if ((prevGrid[r]?.[c] ?? "").trim() !== "") {
        hasManualRows = true;
        break;
      }
    }
    if (hasManualRows) break;
  }
  if (hasManualRows && newLastRow > prevLastRow) {
    conflicts.push({
      code: "manual_rows",
      message: "Ada catatan di bawah data yang akan tertimpa karena jumlah baris data bertambah.",
    });
  }

  // 3. Manual columns: any non-empty cell to the right of the previous block within the previous rows.
  let hasManualCols = false;
  for (let c = prevLastCol; c < newLastCol; c++) {
    for (let r = 0; r < Math.min(prevLastRow, newLastRow, prevGrid.length); r++) {
      if ((prevGrid[r]?.[c] ?? "").trim() !== "") {
        hasManualCols = true;
        break;
      }
    }
    if (hasManualCols) break;
  }
  if (hasManualCols && newLastCol > prevLastCol) {
    conflicts.push({
      code: "manual_columns",
      message: "Ada catatan di kanan data yang akan tertimpa karena jumlah kolom data bertambah.",
    });
  }

  return conflicts;
}

export async function ensureGoogleDriveFolderPath(segments: string[]): Promise<string> {
  const token = await getGoogleFormsAccessToken();
  let currentParentId = "root";

  for (const segment of segments) {
    if (!segment.trim()) continue;

    // Search for existing folder
    const escapedSegment = segment.replace(/'/g, "\\'");
    const q = `mimeType='application/vnd.google-apps.folder' and name='${escapedSegment}' and '${currentParentId}' in parents and trashed=false`;
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!searchRes.ok) throw new Error(`Drive search error: ${await searchRes.text()}`);
    const searchData = await searchRes.json();

    if (searchData.files && searchData.files.length > 0) {
      currentParentId = searchData.files[0].id;
    } else {
      // Create folder
      const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: segment,
          mimeType: "application/vnd.google-apps.folder",
          parents: [currentParentId]
        }),
      });

      if (!createRes.ok) throw new Error(`Drive create folder error: ${await createRes.text()}`);
      const createData = await createRes.json();
      currentParentId = createData.id;
    }
  }

  return currentParentId;
}

export async function moveFileToDriveFolder(fileId: string, folderId: string) {
  const token = await getGoogleFormsAccessToken();

  // Get current parents
  const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!fileRes.ok) throw new Error(`Drive get file error: ${await fileRes.text()}`);
  const fileData = await fileRes.json();
  const previousParents = fileData.parents ? fileData.parents.join(",") : "";

  // Move
  const moveParams = new URLSearchParams({ addParents: folderId, supportsAllDrives: "true" });
  if (previousParents) moveParams.set("removeParents", previousParents);
  const moveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${moveParams}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!moveRes.ok) throw new Error(`Drive move file error: ${await moveRes.text()}`);
}

export async function getAdminEmails(): Promise<string[]> {
  return getAllAdminEmails();
}

export async function grantDriveEditorAccess(fileId: string, emails: string[]) {
  const uniqueEmails = [...new Set(emails.map((e) => e.trim().toLowerCase()))].filter(Boolean);
  if (uniqueEmails.length === 0) return;

  const token = await getGoogleFormsAccessToken();

  const permsRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,emailAddress,role)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!permsRes.ok) throw new Error(`Drive permissions list error: ${await permsRes.text()}`);
  const permsData = (await permsRes.json()) as { permissions?: { id?: string; emailAddress?: string; role?: string }[] };
  const existing = new Map((permsData.permissions ?? []).map((p) => [p.emailAddress?.toLowerCase(), p]));

  for (const email of uniqueEmails) {
    const permission = existing.get(email);
    if (permission?.role && ["owner", "organizer", "fileOrganizer", "writer"].includes(permission.role)) continue;
    if (permission?.id) {
      const update = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${encodeURIComponent(permission.id)}?supportsAllDrives=true`,
        { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ role: "writer" }) }
      );
      if (!update.ok) throw new Error("Could not update Drive editor permissions.");
      continue;
    }
    const createRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }),
      }
    );
    if (!createRes.ok) {
      const errorText = await createRes.text();
      const alreadyGranted =
        createRes.status === 403 && /already|exist|collaborator/i.test(errorText);
      if (alreadyGranted) continue;
      throw new Error(`Drive permission create error for ${email}: ${errorText}`);
    }
  }
}

/**
 * Reads the used grid of the first sheet (sheetId 0) as a 2D string array.
 * Returns null when the spreadsheet no longer exists (404).
 */
export async function readSheetGrid(spreadsheetId: string): Promise<string[][] | null> {
  const token = await getGoogleFormsAccessToken();

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGetByDataFilter`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ dataFilters: [{ gridRange: { sheetId: 0 } }], valueRenderOption: "FORMULA" }),
    }
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sheets read error: ${await res.text()}`);

  const data = (await res.json()) as { valueRanges?: { valueRange: { values?: unknown[][] } }[] };
  if (!data.valueRanges?.length) throw new Error("Export tab unavailable");
  return (data.valueRanges[0].valueRange.values ?? []).map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
}

/**
 * Writes only the app-owned data block (headers + data rows) at A1.
 * Anything outside the explicit range (columns right of the data, rows below it)
 * is preserved. A stale tail of a previously larger owned block is cleared.
 * Returns false when the spreadsheet no longer exists (404).
 */
export async function writeOwnedBlock(
  spreadsheetId: string,
  title: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  prevLastRow: number,
  prevLastCol: number
): Promise<boolean> {
  const token = await getGoogleFormsAccessToken();

  const formattedHeaderValues = headers.map((h) => ({
    userEnteredValue: { stringValue: String(h ?? "") },
    userEnteredFormat: {
      textFormat: { bold: true },
      backgroundColorStyle: { rgbColor: { red: 0.9, green: 0.93, blue: 0.98 } },
    },
  }));

  const formattedRows = rows.map((row) => ({
    values: row.map((cell) => {
      const valStr = normalizeCell(cell);
      return {
        userEnteredValue: { stringValue: valStr },
      };
    }),
  }));

  const newLastRow = rows.length + 1;
  const newLastCol = headers.length;

  const requests: unknown[] = [
    {
      updateSpreadsheetProperties: {
        properties: { title: `Zyx Export - ${title}` },
        fields: "title"
      }
    },
    {
      updateCells: {
        range: {
          sheetId: 0,
          startRowIndex: 0,
          startColumnIndex: 0,
          endRowIndex: newLastRow,
          endColumnIndex: newLastCol,
        },
        fields: "userEnteredValue,userEnteredFormat",
        rows: [{ values: formattedHeaderValues }, ...formattedRows],
      }
    },
  ];

  const metadata = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,gridProperties(rowCount,columnCount)))`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (metadata.status === 404) return false;
  if (!metadata.ok) throw new Error(`Sheets metadata error: ${await metadata.text()}`);
  type GridSheet = { properties: { sheetId: number; gridProperties: { rowCount: number; columnCount: number } } };
  const { sheets } = await metadata.json() as { sheets: GridSheet[] };
  const grid = sheets.find(sheet => sheet.properties.sheetId === 0)?.properties.gridProperties;
  if (!grid) throw new Error("Export tab unavailable");
  for (const [dimension, length] of [["ROWS", newLastRow - grid.rowCount], ["COLUMNS", newLastCol - grid.columnCount]] as const) {
    if (length > 0) requests.unshift({ appendDimension: { sheetId: 0, dimension, length } });
  }
  // Manually deleted rows or columns no longer need to be cleared.
  prevLastRow = Math.min(prevLastRow, grid.rowCount);
  prevLastCol = Math.min(prevLastCol, grid.columnCount);

  // Clear the stale tail of the previously owned block (rows and/or columns that shrank).
  if (prevLastRow > newLastRow) {
    requests.push({
      updateCells: {
        range: {
          sheetId: 0,
          startRowIndex: newLastRow,
          startColumnIndex: 0,
          endRowIndex: prevLastRow,
          endColumnIndex: prevLastCol,
        },
        fields: "userEnteredValue,userEnteredFormat",
        rows: [],
      },
    });
  }
  if (prevLastCol > newLastCol) {
    requests.push({
      updateCells: {
        range: {
          sheetId: 0,
          startRowIndex: 0,
          startColumnIndex: newLastCol,
          endRowIndex: prevLastRow,
          endColumnIndex: prevLastCol,
        },
        fields: "userEnteredValue,userEnteredFormat",
        rows: [],
      },
    });
  }

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    if (res.status === 404) return false;
    throw new Error(`Sheets update error: ${await res.text()}`);
  }
  return true;
}

export async function createGoogleSpreadsheet(
  title: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const token = await getGoogleFormsAccessToken();

  const formattedHeaderValues = headers.map((h) => ({
    userEnteredValue: { stringValue: String(h ?? "") },
    userEnteredFormat: {
      textFormat: { bold: true },
      backgroundColorStyle: { rgbColor: { red: 0.9, green: 0.93, blue: 0.98 } },
    },
  }));

  const formattedRows = rows.map((row) => ({
    values: row.map((cell) => {
      const valStr = normalizeCell(cell);
      return {
        userEnteredValue: { stringValue: valStr },
      };
    }),
  }));

  const payload = {
    properties: {
      title: `Zyx Export - ${title}`,
    },
    sheets: [
      {
        properties: {
          title: "Responses & Data",
          sheetId: 0,
          gridProperties: { rowCount: Math.max(1000, rows.length + 1), columnCount: Math.max(26, headers.length) },
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [{ values: formattedHeaderValues }, ...formattedRows],
          },
        ],
      },
    ],
  };

  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Google Sheets create error: ${await res.text()}`);
  }

  const data = await res.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  return { spreadsheetId, spreadsheetUrl };
}

export async function syncGoogleSpreadsheet(input: SyncSpreadsheetInput): Promise<SyncSpreadsheetResult> {
  const { entityType, entityId, title, headers, rows, folderSubpath, confirmedRevision } = input;
  const idStr = `${entityType}_${entityId}`;

  const existing = await db.query.exportSpreadsheets.findFirst({
    where: eq(exportSpreadsheets.id, idStr)
  });

  let spreadsheetId = existing?.spreadsheetId;
  let spreadsheetUrl = existing?.spreadsheetUrl;
  let driveFolderId = existing?.driveFolderId;
  let isNew = false;
  let needsConfirmation = false;
  let revision: string | undefined;
  let sharingIncomplete = false;
  let conflicts: SpreadsheetConflict[] = [];

  if (existing) {
    let prevGrid = await readSheetGrid(spreadsheetId!);
    if (prevGrid === null) {
      // 404 self-healing: recreate the spreadsheet.
      await db.delete(exportSpreadsheets).where(eq(exportSpreadsheets.id, idStr));
      spreadsheetId = undefined;
      spreadsheetUrl = undefined;
      driveFolderId = undefined;
    } else {
      let prevHeaderCount = existing.lastHeaderCount ?? 0;
      let prevRowCount = existing.lastRowCount ?? 0;

      if (prevHeaderCount === 0 && prevRowCount === 0) {
        // Legacy spreadsheet created before metadata was stored: infer the previous
        // owned block from the current grid so the first re-export can still warn.
        prevHeaderCount = prevGrid[0]?.length ?? headers.length;
        prevRowCount = prevGrid.length;
      }

      conflicts = detectConflicts({
        prevGrid,
        prevHeaderCount,
        prevRowCount,
        newHeaders: headers,
        newRows: rows,
        storedFingerprint: existing.lastWrittenFingerprint,
      });

      revision = createHash("sha256").update(JSON.stringify([spreadsheetId, prevGrid, headers, rows])).digest("hex");
      if (conflicts.length > 0 && !input.confirmOverwrite && revision !== confirmedRevision) {
        needsConfirmation = true;
      } else {
        const ok = await writeOwnedBlock(spreadsheetId!, title, headers, rows, prevRowCount, prevHeaderCount);
        if (!ok) {
          // 404 self-healing: recreate the spreadsheet.
          await db.delete(exportSpreadsheets).where(eq(exportSpreadsheets.id, idStr));
          spreadsheetId = undefined;
          spreadsheetUrl = undefined;
          driveFolderId = undefined;
        } else {
          await db.update(exportSpreadsheets).set({
            lastHeaderCount: headers.length,
            lastRowCount: rows.length + 1,
            lastWrittenFingerprint: gridFingerprint(headers, rows),
          }).where(eq(exportSpreadsheets.id, idStr));
        }
      }
    }
  }

  if (!spreadsheetId) {
    isNew = true;
    const created = await createGoogleSpreadsheet(title, headers, rows);
    spreadsheetId = created.spreadsheetId;
    spreadsheetUrl = created.spreadsheetUrl;

    // Drive folder moving
    const basePath = ["Zyx Export"];
    if (folderSubpath) {
      basePath.push(...folderSubpath.split("/").filter(Boolean));
    }
    const folderId = await ensureGoogleDriveFolderPath(basePath);
    await moveFileToDriveFolder(spreadsheetId, folderId);
    driveFolderId = folderId;

    // DB persistence
    await db.insert(exportSpreadsheets).values({
      id: idStr,
      entityType,
      entityId,
      spreadsheetId,
      spreadsheetUrl,
      driveFolderId,
      folderPath: basePath.join("/"),
      lastHeaderCount: headers.length,
      lastRowCount: rows.length + 1,
      lastWrittenFingerprint: gridFingerprint(headers, rows),
    });

    if (entityType === "form") {
      await db.update(customForms).set({ spreadsheetId, spreadsheetUrl }).where(eq(customForms.id, entityId));
    } else if (entityType === "quiz") {
      // quiz entityId is usually `${templateId}:${type}` so we extract templateId
      const templateId = entityId.split(":")[0];
      await db.update(quizTemplates).set({ spreadsheetId, spreadsheetUrl }).where(eq(quizTemplates.id, templateId));
    }
  }

  if (!needsConfirmation && process.env.FEATURE_DRIVE_EDITOR_SYNC === "1") {
    try {
      const adminEmails = await getAdminEmails();
      await grantDriveEditorAccess(spreadsheetId!, adminEmails);
      if (isNew && driveFolderId) {
        await grantDriveEditorAccess(driveFolderId, adminEmails);
      }
    } catch {
      sharingIncomplete = true;
    }
  }

  return {
    spreadsheetId: spreadsheetId!,
    spreadsheetUrl: spreadsheetUrl!,
    isNew,
    needsConfirmation,
    revision,
    sharingIncomplete,
    conflicts,
  };
}
