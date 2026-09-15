import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UsageBudgetService } from "@/lib/usage-budget-service";
import { resolveCourseAccess } from "@/lib/student/course-access";

export const dynamic = "force-dynamic";

/** Returns only the authenticated actor's Zyra allowance summary. */
export async function GET(request: Request) {
  if (!UsageBudgetService.isAllowanceEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const courseId = new URL(request.url).searchParams.get("courseId")?.trim() || null;
  if (!courseId || courseId === "unknown") {
    return NextResponse.json({ error: "Course context required" }, { status: 400 });
  }

  const access = await resolveCourseAccess({ courseId, userId: session.user.id });
  // Allowance is derived from the canonical course decision. This preserves
  // the one-question Free lane while keeping inactive or unknown courses,
  // including for admins, out of the summary boundary.
  if (!access.hasCourseAccess) {
    return NextResponse.json({ error: "Allowance unavailable" }, { status: 403 });
  }
  const accessTier = access.tier === "free" ? "free" : "standard";
  const summary = await UsageBudgetService.currentUserSummary(session.user.id, new Date(), accessTier);
  if (!summary) {
    return NextResponse.json({ error: "Allowance unavailable" }, { status: 403 });
  }

  const { userId: _userId, ...publicSummary } = summary;
  return NextResponse.json({ summary: { ...publicSummary, accessTier } });
}
