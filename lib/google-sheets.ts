import { getGoogleFormsAccessToken } from "@/lib/google-forms";

export interface CreateSpreadsheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
}

/**
 * Creates a Google Spreadsheet using Google Sheets REST API v4.
 *
 * @param title The title of the Google Spreadsheet
 * @param headers Array of header column strings
 * @param rows Matrix of row values
 */
export async function createGoogleSpreadsheet(
  title: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): Promise<CreateSpreadsheetResult> {
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

  const res = await fetch("https://sheets.googleapis.com/v1/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error("Google Sheets API Error:", errorBody);
    throw new Error(`Google Sheets API error (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  return {
    spreadsheetId,
    spreadsheetUrl,
  };
}
