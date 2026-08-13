import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UsageBudgetService } from "@/lib/usage-budget-service";

export const dynamic = "force-dynamic";

/** Returns only the authenticated actor's Zyra allowance summary. */
export async function GET() {
  if (!UsageBudgetService.isAllowanceEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await UsageBudgetService.currentUserSummary(session.user.id);
  if (!summary) {
    return NextResponse.json({ error: "Allowance unavailable" }, { status: 403 });
  }

  const { userId: _userId, ...publicSummary } = summary;
  return NextResponse.json({ summary: publicSummary });
}
