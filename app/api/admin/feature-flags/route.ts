import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getAllFeatureFlagsStatus } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const flags = getAllFeatureFlagsStatus();
    const total = flags.length;
    const activeCount = flags.filter((f) => f.enabled).length;
    const inactiveCount = total - activeCount;
    const coveragePercent = total > 0 ? Number(((activeCount / total) * 100).toFixed(1)) : 0;

    const posthogConfigured = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      posthogConfigured,
      total,
      activeCount,
      inactiveCount,
      coveragePercent,
      flags,
    });
  } catch (err) {
    console.error("Feature flags API error:", err);
    return NextResponse.json(
      { error: "Gagal mengambil data feature flag" },
      { status: 500 }
    );
  }
}
