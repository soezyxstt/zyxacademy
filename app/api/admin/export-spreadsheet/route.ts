import { googleOperationError } from "@/lib/google-operation-error";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/authorization";
import { syncGoogleSpreadsheet } from "@/lib/google-sheets";

import { db } from "@/db";
import { exportSpreadsheets } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const params = new URL(req.url).searchParams;
  const type = params.get("entityType");
  const id = params.get("entityId");
  if (!id || !type || !["form", "quiz", "pka"].includes(type)) {
    return NextResponse.json({ error: "Invalid entity" }, { status: 400 });
  }
  const sheet = await db.query.exportSpreadsheets.findFirst({
    columns: { spreadsheetUrl: true },
    where: eq(exportSpreadsheets.id, `${type}_${id}`),
  });
  return NextResponse.json({ spreadsheetUrl: sheet?.spreadsheetUrl ?? null }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
      return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { entityType, entityId, folderSubpath, confirmedRevision } = body;
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
      confirmedRevision: typeof confirmedRevision === "string" ? confirmedRevision : undefined,
    });

    if (result.needsConfirmation) {
      return NextResponse.json({
        success: false,
        needsConfirmation: true,
        revision: result.revision,
        conflicts: result.conflicts ?? [],
        spreadsheetId: result.spreadsheetId,
        spreadsheetUrl: result.spreadsheetUrl,
      });
    }

    return NextResponse.json({
      success: true,
      spreadsheetId: result.spreadsheetId,
      spreadsheetUrl: result.spreadsheetUrl,
      isNew: result.isNew,
      sharingIncomplete: result.sharingIncomplete,
    });
  } catch (error) {
    const code = googleOperationError(error);
    console.error("Spreadsheet export failed", { code });
    return NextResponse.json({ code }, { status: 500 });
  }
}
