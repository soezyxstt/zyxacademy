import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { syncGoogleSpreadsheet } from "@/lib/google-sheets";

export async function POST(req: Request) {
  try {
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const { entityType, entityId, folderSubpath } = body;
    const title = (body.title || "Data").trim();
    const headersList = Array.isArray(body.headers) ? body.headers : [];
    const rowsMatrix = Array.isArray(body.rows) ? body.rows : [];

    if (!entityType || !entityId) {
      return NextResponse.json({ error: "entityType and entityId are required." }, { status: 400 });
    }

    if (headersList.length === 0) {
      return NextResponse.json({ error: "Header columns are required for spreadsheet export." }, { status: 400 });
    }

    const result = await syncGoogleSpreadsheet({
      entityType,
      entityId,
      title,
      headers: headersList,
      rows: rowsMatrix,
      folderSubpath,
    });

    return NextResponse.json({
      success: true,
      spreadsheetId: result.spreadsheetId,
      spreadsheetUrl: result.spreadsheetUrl,
      isNew: result.isNew,
    });
  } catch (error: any) {
    console.error("Failed to export to Google Spreadsheet:", error);
    return NextResponse.json({ error: error.message || "Failed to create Google Spreadsheet." }, { status: 500 });
  }
}
