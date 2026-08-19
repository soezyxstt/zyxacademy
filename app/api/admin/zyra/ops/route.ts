import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getZyraOpsMetrics } from "@/lib/zyra/ops";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getZyraOpsMetrics());
  } catch {
    return NextResponse.json({ error: "Zyra ops unavailable" }, { status: 503 });
  }
}
