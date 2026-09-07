import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

async function retiredResponse() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "AUTHORING_CONTEXT_FORBIDDEN" }, { status: 403 });
  }
  return NextResponse.json(
    { error: "BROWSER_MANUAL_AUTHORING_RETIRED", replacement: "/admin/courses" },
    { status: 410 },
  );
}

export const GET = retiredResponse;
export const POST = retiredResponse;
