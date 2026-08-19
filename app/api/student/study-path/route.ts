import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { enrollments } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { getOrComputeStudyPath, bucketStudyPathByDays } from "@/lib/study-path-service";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) {
    return NextResponse.json({ error: "courseId required" }, { status: 400 });
  }

  // Verify active enrollment
  if (session.user.role !== "admin") {
    const [enrollment] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, session.user.id),
          eq(enrollments.courseId, courseId),
          gt(enrollments.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!enrollment) {
      return NextResponse.json({ error: "Not enrolled or enrollment expired" }, { status: 403 });
    }
  }

  try {
    const steps = await getOrComputeStudyPath(session.user.id, courseId);

    // Optional deadline-driven day plan: ?days=N ("I have a midterm in N days").
    const daysParam = req.nextUrl.searchParams.get("days");
    const days = daysParam ? Number.parseInt(daysParam, 10) : null;
    const dayPlan = days && Number.isFinite(days) && days > 0 ? bucketStudyPathByDays(steps, days) : null;

    return NextResponse.json({ steps, dayPlan });
  } catch (err: any) {
    console.error("Error retrieving study path:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve study path" },
      { status: 500 }
    );
  }
}
