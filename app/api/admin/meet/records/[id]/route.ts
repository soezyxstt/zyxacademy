import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { getCompleteMeetingAnalytics } from "@/lib/google-meet";

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

    const analytics = await getCompleteMeetingAnalytics(id);
    return NextResponse.json({ success: true, analytics });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch meeting analytics" }, { status: 500 });
  }
}
