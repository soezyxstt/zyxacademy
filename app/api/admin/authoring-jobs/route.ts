import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "AUTHORING_JOB_FORBIDDEN" }, { status: 403 });
  }
  return NextResponse.json(
    { error: "BROWSER_MANUAL_AUTHORING_RETIRED", replacement: "/admin/courses" },
    { status: 410 },
  );
}
