import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getIdeaMasteryWithFallback } from "@/lib/pemahaman/compatibility";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ideaId = request.nextUrl.searchParams.get("ideaId");
  if (!ideaId) return NextResponse.json({ error: "ideaId required" }, { status: 400 });

  const conceptName = request.nextUrl.searchParams.get("conceptName") ?? undefined;
  const mastery = await getIdeaMasteryWithFallback(session.user.id, ideaId, conceptName);
  return NextResponse.json({ ideaId, mastery });
}
