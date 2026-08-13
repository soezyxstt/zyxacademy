import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { endGoogleMeetActiveConference } from "@/lib/google-meet";

export async function POST(req: Request) {
  try {
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const { spaceName } = await req.json();
    if (!spaceName) {
      return NextResponse.json({ error: "spaceName is required" }, { status: 400 });
    }

    await endGoogleMeetActiveConference(spaceName);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to end active conference" }, { status: 500 });
  }
}
