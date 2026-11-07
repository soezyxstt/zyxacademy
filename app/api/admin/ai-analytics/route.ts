import { NextResponse } from "next/server";
import { getAiStats } from "@/lib/ai/analytics";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards";

/**
 * GET /api/admin/ai-analytics
 * Returns AI request stats for the analytics page (tutor or admin via canonical role guard).
 */
export async function GET() {
  try {
    await assertTutorOrAdmin();
    const stats = getAiStats();
    return NextResponse.json(stats);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
