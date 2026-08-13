import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import {
  getCompleteMeetingAnalytics,
  listMeetingRecordings,
  listMeetingTranscripts,
} from "@/lib/google-meet";
import { grantAdminEditorAccessToDriveItems } from "@/lib/google-drive-permissions";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Conference record ID is required" }, { status: 400 });
    }

    const [analytics, recordingsRes, transcriptsRes] = await Promise.all([
      getCompleteMeetingAnalytics(id),
      listMeetingRecordings(id),
      listMeetingTranscripts(id),
    ]);

    const driveIds: string[] = [];
    for (const rec of recordingsRes.recordings ?? []) {
      if (rec.driveDestination?.file) driveIds.push(rec.driveDestination.file);
      if (rec.driveDestination?.exportUri) driveIds.push(rec.driveDestination.exportUri);
    }
    for (const tr of transcriptsRes.transcripts ?? []) {
      if (tr.docsDestination?.document) driveIds.push(tr.docsDestination.document);
      if (tr.docsDestination?.exportUri) driveIds.push(tr.docsDestination.exportUri);
    }
    for (const rec of analytics.recordings ?? []) {
      if (rec.driveExportUri) driveIds.push(rec.driveExportUri);
    }
    for (const tr of analytics.transcripts ?? []) {
      if (tr.docsExportUri) driveIds.push(tr.docsExportUri);
    }

    if (env.FEATURE_DRIVE_EDITOR_SYNC === "1" && driveIds.length > 0) {
      await grantAdminEditorAccessToDriveItems(driveIds);
    }

    return NextResponse.json({ success: true, analytics });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch meeting analytics" }, { status: 500 });
  }
}
