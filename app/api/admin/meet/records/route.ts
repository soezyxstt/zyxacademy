import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { listConferenceRecords } from "@/lib/google-meet";

export async function GET(req: Request) {
  try {
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || undefined;
    const pageToken = searchParams.get("pageToken") || undefined;

    const data = await listConferenceRecords(filter, 50, pageToken);
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to list conference records" }, { status: 500 });
  }
}
