/**
 * PATCH /api/notifications/read
 *
 * Marks one or more notification records as read for the authenticated user.
 *
 * Body: { ids: string[] } ; notification IDs to mark as read
 * OR: { all: true } ; mark all of the user's notifications as read
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { notificationVisibility } from "@/lib/notifications/discussion-history";
import { eq, inArray, and } from "drizzle-orm";
import { z } from "zod";

const readSchema = z.union([
 z.object({ ids: z.array(z.string().uuid()).min(1) }),
 z.object({ all: z.literal(true) }),
]);

export async function PATCH(req: NextRequest) {
 // 1. Authenticate
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 // 2. Parse body
 let body: unknown;
 try {
 body = await req.json();
 } catch {
 return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
 }

 const parsed = readSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
 }

 const userId = session.user.id;

 try {
 const visible = await notificationVisibility(userId, userId, "all" in parsed.data ? { unreadOnly: true } : { ids: parsed.data.ids });
 if ("all" in parsed.data) {
 // Mark all as read
 await db
 .update(notifications)
 .set({ read: true })
 .where(and(eq(notifications.userId, userId), eq(notifications.read, false), visible));
 } else {
 // Mark specific IDs ; enforce userId ownership so users can't mark others' notifications
 await db
 .update(notifications)
 .set({ read: true })
 .where(
 and(
 eq(notifications.userId, userId),
 inArray(notifications.id, parsed.data.ids), visible
 )
 );
 }

 return NextResponse.json({ success: true });
 } catch (err) {
 console.error("[notifications/read] Error:", err);
 return NextResponse.json({ error: "Internal server error" }, { status: 500 });
 }
}
