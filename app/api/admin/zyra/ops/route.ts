import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import { getZyraOpsMetrics } from "@/lib/zyra/ops";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (zyraRuntimeEnv.FEATURE_ZYRA_AI_OPS_V1 !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json(await getZyraOpsMetrics());
  } catch {
    return NextResponse.json({ error: "Zyra ops unavailable" }, { status: 503 });
  }
}
