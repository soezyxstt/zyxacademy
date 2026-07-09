/**
 * GET /api/notifications/history
 *
 * Returns paginated notification records for the authenticated user.
 * Admin users may optionally fetch any user's history via ?userId=.
 *
 * Query params:
 * - page (default: 1)
 * - limit (default: 20, max: 100)
 * - userId (admin only ; fetch another user's history)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
 // 1. Authenticate
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const { searchParams } = req.nextUrl;
 const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
 const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
 const offset = (page - 1) * limit;

 // Admin can query any user's notifications; non-admin can only see their own
 const requestedUserId = searchParams.get("userId");
 let targetUserId: string;

 if (requestedUserId && requestedUserId !== session.user.id) {
 if (session.user.role !== "admin") {
 return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 }
 targetUserId = requestedUserId;
 } else {
 targetUserId = session.user.id;
 }

 try {
 const rows = await db
 .select()
 .from(notifications)
 .where(eq(notifications.userId, targetUserId))
 .orderBy(desc(notifications.createdAt))
 .limit(limit)
 .offset(offset);

 return NextResponse.json({ notifications: rows, page, limit });
 } catch (err) {
 console.error("[notifications/history] Error:", err);
 return NextResponse.json({ error: "Internal server error" }, { status: 500 });
 }
}
