/**
 * POST /api/notifications/register-token
 *
 * Stores or updates an FCM registration token for the authenticated user.
 * The `token` field has a UNIQUE constraint so duplicate registrations are
 * automatically handled via an upsert (update updatedAt on conflict).
 *
 * Body: { token: string, device: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userPushTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { z } from "zod";

// ─── Input validation ─────────────────────────────────────────────────────────

const registerSchema = z.object({
 /** Raw FCM registration token from the browser. */
 token: z.string().min(100).max(4096),
 /** Human-readable device label (e.g. truncated userAgent). */
 device: z.string().max(300).default("unknown"),
});

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
 // 1. Authenticate
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 // 2. Parse and validate body
 let body: unknown;
 try {
 body = await req.json();
 } catch {
 return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
 }

 const parsed = registerSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json(
 { error: "Invalid payload", issues: parsed.error.flatten() },
 { status: 422 }
 );
 }

 const { token, device } = parsed.data;
 const userId = session.user.id;

 // 3. Upsert the token
 // If the token already exists (same user OR a different user ; token is globally unique):
 // - If same user: update `device` and `updatedAt`.
 // - If different user: the UNIQUE constraint prevents double-storage;
 // the old record is re-attributed to the current user (device switch).
 try {
 const existing = await db
 .select({ id: userPushTokens.id, userId: userPushTokens.userId })
 .from(userPushTokens)
 .where(eq(userPushTokens.token, token))
 .limit(1);

 if (existing.length > 0) {
 // Token exists ; update userId and device in case of transfer between accounts
 await db
 .update(userPushTokens)
 .set({ userId, device, updatedAt: new Date() })
 .where(eq(userPushTokens.id, existing[0].id));
 } else {
 // New token ; insert
 await db.insert(userPushTokens).values({
 id: randomUUID(),
 userId,
 token,
 device,
 createdAt: new Date(),
 updatedAt: new Date(),
 });
 }

 return NextResponse.json({ success: true });
 } catch (err) {
 console.error("[register-token] DB error:", err);
 return NextResponse.json({ error: "Internal server error" }, { status: 500 });
 }
}
