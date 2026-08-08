import { createHash } from "node:crypto";
import { getGoogleFormsAccessToken } from "@/lib/google-forms";
import { db } from "@/db";
import { env } from "@/lib/env";
import { exportSpreadsheets, customForms, quizTemplates, pengguna, penggunaPeran, peran, user } from "@/db/schema";
import { and, eq } from "drizzle-orm";

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
  confirmOverwrite?: boolean;
}

export interface SyncSpreadsheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  isNew: boolean;
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
  for (let r = prevLastRow; r < prevGrid.length; r++) {
    for (let c = 0; c < prevLastCol; c++) {
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
  for (let c = prevLastCol; c < maxCols(prevGrid); c++) {
    for (let r = 0; r < Math.min(prevLastRow, prevGrid.length); r++) {
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

function maxCols(grid: string[][]): number {
  let max = 0;
  for (const row of grid) {
    if (row.length > max) max = row.length;
  }
  return max;
}

export async function ensureGoogleDriveFolderPath(segments: string[]): Promise<string> {
  const token = await getGoogleFormsAccessToken();
  let currentParentId = "root";

  for (const segment of segments) {
    if (!segment.trim()) continue;

    // Search for existing folder
    const q = `mimeType='application/vnd.google-apps.folder' and name='${segment.replace(/'/g, "\'")}' and '${currentParentId}' in parents and trashed=false`;
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
  const moveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}&removeParents=${previousParents}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!moveRes.ok) throw new Error(`Drive move file error: ${await moveRes.text()}`);
}

export async function getAdminEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(penggunaPeran)
    .innerJoin(pengguna, eq(penggunaPeran.penggunaId, pengguna.id))
    .innerJoin(user, eq(pengguna.id, user.id))
    .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
    .where(and(eq(pengguna.status, "active"), eq(peran.code, "admin")));

  return rows.map((r) => r.email).filter(Boolean);
}

export async function grantDriveEditorAccess(fileId: string, emails: string[]) {
  const uniqueEmails = [...new Set(emails.map((e) => e.trim().toLowerCase()))].filter(Boolean);
  if (uniqueEmails.length === 0) return;

  const token = await getGoogleFormsAccessToken();

  const permsRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(emailAddress,role)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!permsRes.ok) throw new Error(`Drive permissions list error: ${await permsRes.text()}`);
  const permsData = (await permsRes.json()) as { permissions?: { emailAddress?: string }[] };
  const existing = new Set(
    (permsData.permissions ?? []).map((p) => p.emailAddress?.toLowerCase()).filter(Boolean)
  );

  for (const email of uniqueEmails) {
    if (existing.has(email)) continue;
    const createRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }),
      }
    );
    if (!createRes.ok) {
      // 403 is returned when the user is already a collaborator; treat as success.
      if (createRes.status === 403) continue;
      throw new Error(`Drive permission create error for ${email}: ${await createRes.text()}`);
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
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1%3AZZ100000`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sheets read error: ${await res.text()}`);

  const data = (await res.json()) as { values?: unknown[][] };
  return (data.values ?? []).map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
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
          startRow: 0,
          startColumn: 0,
          endRow: newLastRow,
          endColumn: newLastCol,
        },
        fields: "userEnteredValue,userEnteredFormat",
        rows: [{ values: formattedHeaderValues }, ...formattedRows],
      }
    },
  ];

  // Clear the stale tail of the previously owned block (rows and/or columns that shrank).
  if (prevLastRow > newLastRow) {
    requests.push({
      updateCells: {
        range: {
          sheetId: 0,
          startRow: newLastRow,
          startColumn: 0,
          endRow: prevLastRow,
          endColumn: Math.max(prevLastCol, newLastCol),
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
          startRow: 0,
          startColumn: newLastCol,
          endRow: Math.max(prevLastRow, newLastRow),
          endColumn: prevLastCol,
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
          sheetId: 0
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
  const { entityType, entityId, title, headers, rows, folderSubpath, confirmOverwrite } = input;
  const idStr = `${entityType}_${entityId}`;

  const existing = await db.query.exportSpreadsheets.findFirst({
    where: eq(exportSpreadsheets.id, idStr)
  });

  let spreadsheetId = existing?.spreadsheetId;
  let spreadsheetUrl = existing?.spreadsheetUrl;
  let driveFolderId = existing?.driveFolderId;
  let isNew = false;
  let needsConfirmation = false;
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

      if (conflicts.length > 0 && !confirmOverwrite) {
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

  if (!needsConfirmation && env.FEATURE_DRIVE_EDITOR_SYNC === "1") {
    try {
      const adminEmails = await getAdminEmails();
      await grantDriveEditorAccess(spreadsheetId!, adminEmails);
      if (isNew && driveFolderId) {
        await grantDriveEditorAccess(driveFolderId, adminEmails);
      }
    } catch (error: any) {
      console.error("Failed to grant Drive editor access to admins:", error);
    }
  }

  return {
    spreadsheetId: spreadsheetId!,
    spreadsheetUrl: spreadsheetUrl!,
    isNew,
    needsConfirmation,
    conflicts,
  };
}
