/**
 * POST /api/live/join ; validates session code + enrollment, returns 60s HMAC token
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { enrollments } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { mintStudentLiveJoin } from "@/lib/live-student-join";
import { and, eq, gt } from "drizzle-orm";

const JoinSchema = z.object({
 code: z.string().length(6),
 courseId: z.string().min(1),
});

export async function POST(req: NextRequest) {
 if (env.FEATURE_LIVE !== "1") return NextResponse.json({ error: "Disabled" }, { status: 404 });

 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = JoinSchema.safeParse(await req.json());
 if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

 const { code, courseId } = body.data;

 // Validate enrollment
 const now = new Date();
 if (session.user.role !== "admin") {
 const [enrollment] = await db
 .select({ id: enrollments.id })
 .from(enrollments)
 .where(
 and(
 eq(enrollments.userId, session.user.id),
 eq(enrollments.courseId, courseId),
 gt(enrollments.expiresAt, now)
 )
 )
 .limit(1);
 if (!enrollment) {
 return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 });
 }
 }

 const joined = await mintStudentLiveJoin({ userId: session.user.id, name: session.user.name, courseId, code });
 return NextResponse.json(joined.body, { status: joined.status });
}
