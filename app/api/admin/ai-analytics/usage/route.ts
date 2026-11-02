import { NextResponse } from "next/server";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards";
import { db } from "@/db";
import { aiUsageEvents, user } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    await assertTutorOrAdmin();

    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    let startDate: Date;
    let endDate: Date;

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else {
      // Default to last 30 days
      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
    }
    
    // Ensure end date includes the full day
    endDate.setHours(23, 59, 59, 999);

    const conditions = sql`${aiUsageEvents.createdAt} >= ${startDate.toISOString()}::timestamptz
      AND ${aiUsageEvents.createdAt} <= ${endDate.toISOString()}::timestamptz`;

    // 1. Group by user
    const usersUsage = await db
      .select({
        userId: aiUsageEvents.userId,
        name: user.name,
        email: user.email,
        requests: sql<number>`count(${aiUsageEvents.id})`,
        inputTokens: sql<number>`sum(${aiUsageEvents.inputTokens})`,
        outputTokens: sql<number>`sum(${aiUsageEvents.outputTokens})`,
        totalTokens: sql<number>`sum(${aiUsageEvents.tokens})`,
      })
      .from(aiUsageEvents)
      .leftJoin(user, eq(aiUsageEvents.userId, user.id))
      .where(conditions)
      .groupBy(aiUsageEvents.userId, user.name, user.email)
      .orderBy(desc(sql`count(${aiUsageEvents.id})`));

    // 2. Group by day for the chart
    const dateExpr = sql<string>`to_char(${aiUsageEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

    const dailyUsage = await db
      .select({
        date: dateExpr,
        requests: sql<number>`count(${aiUsageEvents.id})`,
        inputTokens: sql<number>`sum(${aiUsageEvents.inputTokens})`,
        outputTokens: sql<number>`sum(${aiUsageEvents.outputTokens})`,
      })
      .from(aiUsageEvents)
      .where(conditions)
      .groupBy(dateExpr)
      .orderBy(dateExpr);

    return NextResponse.json({
      success: true,
      data: {
        users: usersUsage.map(u => ({
          ...u,
          requests: Number(u.requests || 0),
          inputTokens: Number(u.inputTokens || 0),
          outputTokens: Number(u.outputTokens || 0),
          totalTokens: Number(u.totalTokens || 0),
        })),
        daily: dailyUsage.map(d => ({
          ...d,
          requests: Number(d.requests || 0),
          inputTokens: Number(d.inputTokens || 0),
          outputTokens: Number(d.outputTokens || 0),
        })),
      },
    });
  } catch (err: any) {
    console.error("Failed to fetch AI usage analytics:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
