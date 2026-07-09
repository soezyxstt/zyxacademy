/**
 * POST /api/notifications/send
 *
 * Admin-only route to send push notifications programmatically.
 *
 * Supports three targeting modes:
 * - "all" ; broadcast to every user with a token
 * - "course" ; all students enrolled in a specific course
 * - "user" ; single user by userId
 *
 * Body:
 * {
 * target: "all" | "course" | "user",
 * targetId?: string, // courseId or userId depending on target
 * title: string,
 * body: string,
 * link?: string,
 * metadata?: Record<string, string>
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { enrollments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendAdminBroadcast } from "@/lib/notifications/send";

// ─── Input validation ─────────────────────────────────────────────────────────

const sendSchema = z.object({
 target: z.enum(["all", "course", "user"]),
 /** Required when target is "course" or "user". */
 targetId: z.string().optional(),
 title: z.string().min(1).max(100),
 body: z.string().min(1).max(500),
 link: z.string().url().optional().or(z.literal("")).or(z.string().startsWith("/")),
 metadata: z.record(z.string(), z.string()).optional(),
});

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
 // 1. Admin-only auth check
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user || session.user.role !== "admin") {
 return NextResponse.json({ error: "Forbidden ; admin only" }, { status: 403 });
 }

 // 2. Parse and validate body
 let body: unknown;
 try {
 body = await req.json();
 } catch {
 return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
 }

 const parsed = sendSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json(
 { error: "Invalid payload", issues: parsed.error.flatten() },
 { status: 422 }
 );
 }

  const { target, targetId, title, body: msgBody, link = "/dashboard" } = parsed.data;

 // 3. Resolve target user IDs
 let resolvedTarget: "all" | string[];

 try {
 if (target === "all") {
 resolvedTarget = "all";
 } else if (target === "course") {
 if (!targetId) {
 return NextResponse.json(
 { error: "targetId (courseId) is required when target is 'course'" },
 { status: 422 }
 );
 }
 const enrolled = await db
 .select({ userId: enrollments.userId })
 .from(enrollments)
 .where(eq(enrollments.courseId, targetId));
 resolvedTarget = enrolled.map((e) => e.userId);

 if (resolvedTarget.length === 0) {
 return NextResponse.json({ success: true, message: "No enrolled students found", attempted: 0 });
 }
 } else {
 // target === "user"
 if (!targetId) {
 return NextResponse.json(
 { error: "targetId (userId) is required when target is 'user'" },
 { status: 422 }
 );
 }
 resolvedTarget = [targetId];
 }

 // 4. Send
 const result = await sendAdminBroadcast(title, msgBody, link, resolvedTarget);

 return NextResponse.json({
 success: true,
 attempted: result.attempted,
 succeeded: result.succeeded,
 failedCount: result.failedTokens.length,
 errors: result.errors,
 });
 } catch (err) {
 console.error("[notifications/send] Error:", err);
 return NextResponse.json({ error: "Internal server error" }, { status: 500 });
 }
}
