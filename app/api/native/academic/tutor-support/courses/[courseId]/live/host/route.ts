import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { NextRequest } from "next/server";
import { POST as controlRoom } from "@/app/api/live/[sessionId]/control/route";
import { POST as createRoom } from "@/app/api/live/sessions/route";
import { db } from "@/db";
import { liveQuizSessions, user } from "@/db/schema";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { requireTutorCourseAccess } from "@/lib/auth/request-cache";
import { env } from "@/lib/env";
import { makeHostToken } from "@/lib/live-host-token";
import { handleTutorLive } from "@/lib/native/academic/handle-tutor-live";
import { tutorSupportServices } from "@/lib/native/academic/tutor-support-services";

async function handle(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const origin = new URL(resolveAuthBaseUrl()).origin;
  const { courseId } = await params;
  const baseUrl = env.NEXT_PUBLIC_REALTIME_URL;
  const secret = env.LIVE_HMAC_SECRET;
  const configured = env.FEATURE_LIVE === "1" && Boolean(baseUrl && secret);
  function web(path: string, body: object) {
    return new NextRequest(new URL(path, origin), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: request.signal,
    });
  }
  async function ownedRoomFilter(accountId: string, course: string, id?: string) {
    const access = await requireTutorCourseAccess(accountId, course, { allowAdmin: false });
    const aliases = [access.courseId, access.legacyCourseId, course].filter((value): value is string => Boolean(value));
    return and(eq(liveQuizSessions.tutorId, accountId), inArray(liveQuizSessions.courseId, aliases),
      id === undefined ? undefined : eq(liveQuizSessions.id, id));
  }
  return handleTutorLive(request, courseId, origin, {
    ...tutorSupportServices,
    async resume(accountId, course, id) {
      if (!configured || !baseUrl || !secret) return null;
      const owned = await ownedRoomFilter(accountId, course, id);
      const [row] = await db.select({
        id: liveQuizSessions.id, code: liveQuizSessions.code, questions: liveQuizSessions.questionsSnapshot, name: user.name,
      }).from(liveQuizSessions).innerJoin(user, eq(user.id, liveQuizSessions.tutorId))
        .where(and(owned, ne(liveQuizSessions.state, "ended"))).orderBy(desc(liveQuizSessions.createdAt)).limit(1);
      if (!row) return null;
      let questions = row.questions;
      if (typeof questions === "string") {
        try { questions = JSON.parse(questions) as typeof questions; } catch { questions = []; }
      }
      return {
        id: row.id, code: row.code, questionCount: Array.isArray(questions) ? questions.length : 0,
        wsUrl: `${baseUrl}/room/${row.id}/websocket`, hostToken: makeHostToken(accountId, row.name, row.id, secret),
      };
    },
    async create(course, templateId) {
      if (!configured) return new Response(null, { status: 503 });
      return createRoom(web("/api/live/sessions", { courseId: course, templateId }));
    },
    async control(id, action) {
      if (!configured) return new Response(null, { status: 503 });
      return controlRoom(web(`/api/live/${encodeURIComponent(id)}/control`, { action }), {
        params: Promise.resolve({ sessionId: id }),
      });
    },
    async ownsRoom(userId, course, id) {
      const owned = await ownedRoomFilter(userId, course, id);
      const [row] = await db.select({ id: liveQuizSessions.id }).from(liveQuizSessions).where(owned).limit(1);
      return Boolean(row);
    },
  });
}

export const GET = handle;
export const POST = handle;
