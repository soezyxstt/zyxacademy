import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { geminiKeyPool } from "@/lib/gemini-keys";
import { MODEL_REGISTRY } from "@/lib/ai/provider/model-registry";
import { db } from "@/db";
import { aiUsageEvents } from "@/db/schema";
import { and, gte, eq, sql } from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const diagnostics = geminiKeyPool.getDiagnostics();

    const todayUtc = new Date().toISOString().slice(0, 10);
    const startOfDay = new Date(`${todayUtc}T00:00:00.000Z`);

    const usageByModel = await db
      .select({
        model: aiUsageEvents.model,
        count: sql<number>`count(*)`,
        totalTokens: sql<number>`coalesce(sum(${aiUsageEvents.tokens}), 0)`,
      })
      .from(aiUsageEvents)
      .where(
        and(
          gte(aiUsageEvents.createdAt, startOfDay),
          eq(aiUsageEvents.requestType, "premium:tutor"),
        )
      )
      .groupBy(aiUsageEvents.model);

    const totalTodayDb = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiUsageEvents)
      .where(gte(aiUsageEvents.createdAt, startOfDay));

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      rpdLimits: Object.fromEntries(Object.values(MODEL_REGISTRY).map((entry) => [entry.id, entry.limits.perProjectRpd])),
      geminiKeys: diagnostics,
      usageByModel,
      totalRequestsToday: totalTodayDb[0]?.count ?? 0,
    });
  } catch (err) {
    console.error("key diagnostics failed:", err);
    return NextResponse.json({ error: "Failed to load diagnostics" }, { status: 500 });
  }
}
