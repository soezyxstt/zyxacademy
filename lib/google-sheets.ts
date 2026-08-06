import { getGoogleFormsAccessToken } from "@/lib/google-forms";
import { db } from "@/db";
import { exportSpreadsheets, customForms, quizTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface SyncSpreadsheetInput {
  entityType: "form" | "quiz" | "pka" | "system";
  entityId: string;
  title: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
  folderSubpath?: string; // e.g. "forms/Feedback"
}

export interface SyncSpreadsheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  isNew: boolean;
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

export async function updateGoogleSpreadsheetContent(
  spreadsheetId: string,
  title: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
) {
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
      const valStr = cell === null || cell === undefined ? "" : String(cell);
      return {
        userEnteredValue: { stringValue: valStr },
      };
    }),
  }));

  // Batch update: update title, clear sheet, and update cells
  const payload = {
    requests: [
      {
        updateSpreadsheetProperties: {
          properties: { title: `Zyx Export - ${title}` },
          fields: "title"
        }
      },
      {
        updateCells: {
          range: { sheetId: 0 },
          fields: "userEnteredValue,userEnteredFormat",
          rows: [{ values: formattedHeaderValues }, ...formattedRows],
        }
      }
    ]
  };

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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
      const valStr = cell === null || cell === undefined ? "" : String(cell);
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
  const { entityType, entityId, title, headers, rows, folderSubpath } = input;
  const idStr = `${entityType}_${entityId}`;

  const existing = await db.query.exportSpreadsheets.findFirst({
    where: eq(exportSpreadsheets.id, idStr)
  });

  let spreadsheetId = existing?.spreadsheetId;
  let spreadsheetUrl = existing?.spreadsheetUrl;
  let isNew = false;
  let success = false;

  if (existing) {
    success = await updateGoogleSpreadsheetContent(spreadsheetId!, title, headers, rows);
    if (!success) {
      // 404 fallback self-healing
      await db.delete(exportSpreadsheets).where(eq(exportSpreadsheets.id, idStr));
      spreadsheetId = undefined;
      spreadsheetUrl = undefined;
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

    // DB persistence
    await db.insert(exportSpreadsheets).values({
      id: idStr,
      entityType,
      entityId,
      spreadsheetId,
      spreadsheetUrl,
      driveFolderId: folderId,
      folderPath: basePath.join("/"),
    });

    if (entityType === "form") {
      await db.update(customForms).set({ spreadsheetId, spreadsheetUrl }).where(eq(customForms.id, entityId));
    } else if (entityType === "quiz") {
      // quiz entityId is usually `${templateId}:${type}` so we extract templateId
      const templateId = entityId.split(":")[0];
      await db.update(quizTemplates).set({ spreadsheetId, spreadsheetUrl }).where(eq(quizTemplates.id, templateId));
    }
  }

  return { spreadsheetId: spreadsheetId!, spreadsheetUrl: spreadsheetUrl!, isNew };
}
