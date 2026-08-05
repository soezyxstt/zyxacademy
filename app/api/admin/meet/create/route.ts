import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { createGoogleMeetSpace } from "@/lib/google-meet";

export async function POST(req: Request) {
  try {
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const accessType = body.accessType || "OPEN";

    const space = await createGoogleMeetSpace({ accessType });
    return NextResponse.json({ success: true, space });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create Google Meet space" }, { status: 500 });
  }
}
