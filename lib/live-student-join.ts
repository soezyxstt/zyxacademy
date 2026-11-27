import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { liveQuizSessions } from "@/db/schema";
import { env } from "@/lib/env";

/** Call after the route has authenticated the caller and authorized the course. */
export async function mintStudentLiveJoin({ userId, name, courseId, code }: { userId: string; name: string; courseId: string; code: string }) {
  const [session] = await db.select({ id: liveQuizSessions.id, state: liveQuizSessions.state }).from(liveQuizSessions)
    .where(and(eq(liveQuizSessions.code, code.toUpperCase()), eq(liveQuizSessions.courseId, courseId))).limit(1);
  if (!session) return { status: 404, body: { error: "Session not found" } } as const;
  if (session.state === "ended") return { status: 410, body: { error: "Session has ended" } } as const;
  const secret = env.LIVE_HMAC_SECRET;
  if (!secret) return { status: 503, body: { error: "Server not configured for live quiz" } } as const;
  const payload = { userId, name, sessionId: session.id, exp: Date.now() + 60_000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("hex");
  const realtimeUrl = env.NEXT_PUBLIC_REALTIME_URL;
  return { status: 200, body: { sessionId: session.id, token: `${encoded}.${signature}`,
    wsUrl: realtimeUrl ? `${realtimeUrl}/room/${session.id}/websocket` : null, sessionState: session.state } } as const;
}
