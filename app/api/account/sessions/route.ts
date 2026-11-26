import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { session } from "@/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { describeDeviceSession } from "@/lib/auth/device-session-label";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
 const active = await auth.api.getSession({ headers: request.headers });
 if (!active) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
 const rows = await db.select({ id: session.id, userAgent: session.userAgent, createdAt: session.createdAt,
  updatedAt: session.updatedAt, expiresAt: session.expiresAt }).from(session)
  .where(and(eq(session.userId, active.user.id), gt(session.expiresAt, new Date())))
  .orderBy(desc(session.updatedAt));
 return NextResponse.json({ sessions: rows.map(row => ({ id: row.id, label: describeDeviceSession(row.userAgent),
  createdAt: row.createdAt, updatedAt: row.updatedAt, expiresAt: row.expiresAt,
  current: row.id === active.session.id })) }, { headers });
}

export async function DELETE(request: NextRequest) {
 const active = await auth.api.getSession({ headers: request.headers });
 if (!active) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
 const input = z.object({ id: z.string().min(1).max(256) }).safeParse(await request.json().catch(() => null));
 if (!input.success) return NextResponse.json({ error: "Invalid session" }, { status: 400, headers });
 if (input.data.id === active.session.id) return NextResponse.json({ error: "Use normal sign out for the current session" }, { status: 409, headers });
 const [owned] = await db.select({ token: session.token }).from(session)
  .where(and(eq(session.id, input.data.id), eq(session.userId, active.user.id))).limit(1);
 if (!owned) return NextResponse.json({ error: "Session not found" }, { status: 404, headers });
 // Better Auth revokes the actual session, not only the UI entry. Its deletion
 // also cascades to session-bound push registrations. Never return the token.
 await auth.api.revokeSession({ headers: request.headers, body: { token: owned.token } });
 return NextResponse.json({ success: true }, { headers });
}
