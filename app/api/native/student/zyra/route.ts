import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { listTutorSessionsAction, loadTutorHistoryAction } from "@/app/actions/tutor";
import { db } from "@/db";
import { tutorChatMessages } from "@/db/schema";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { FREE_ALLOWANCE_IDEMPOTENCY_PREFIX } from "@/lib/usage-budget-service";
import { tutorHistoryMessageId } from "@/lib/zyra/history-identity";
import { requireNativeStudent } from "../_session";

const id = z.string().min(1).max(160).regex(/^[^/?#\\\s\u0000-\u001f\u007f]+$/u);
const query = z.discriminatedUnion("view", [
  z.object({ view: z.literal("history"), courseId: id, sessionId: id.optional() }).strict(),
  z.object({ view: z.literal("receipt"), courseId: id, requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,96}$/) }).strict(),
]);

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const actor = await requireNativeStudent(request);
  if (actor instanceof Response) return actor;
  const params = new URL(request.url).searchParams;
  const values = Object.fromEntries(params);
  const parsed = query.safeParse(values);
  if (!parsed.success || params.size !== Object.keys(values).length) return reply({ code: "INVALID_ZYRA_QUERY" }, 400);
  const { courseId } = parsed.data;
  try {
    const access = await resolveCourseAccess({ courseId, userId: actor.userId });
    if (!access.hasCourseAccess || !access.capabilities.canAskZyra) return reply({ code: "COURSE_ACCESS_DENIED" }, 403);
    if (parsed.data.view === "receipt") {
      const { requestId } = parsed.data;
      const keys = ["zyra:" + requestId.replace(/^zyra:/, ""), FREE_ALLOWANCE_IDEMPOTENCY_PREFIX + requestId.replace(/^zyra-free:/, "")];
      const ids = keys.map(key => tutorHistoryMessageId(actor.userId, courseId, key, 1));
      const [saved] = await db.select({ sessionId: tutorChatMessages.sessionId }).from(tutorChatMessages).where(and(
        eq(tutorChatMessages.studentId, actor.userId), eq(tutorChatMessages.courseId, courseId),
        eq(tutorChatMessages.role, "ai"), inArray(tutorChatMessages.id, ids),
      )).limit(1);
      if (!saved) return reply({ saved: false });
      const history = await loadTutorHistoryAction(courseId, saved.sessionId);
      return reply({ saved: true, history });
    }
    const sessions = (await listTutorSessionsAction(courseId)).filter(session => session.messageCount > 0);
    const sessionId = parsed.data.sessionId ?? sessions[0]?.id;
    const history = sessionId ? await loadTutorHistoryAction(courseId, sessionId) : null;
    return reply({ sessions, history, tier: access.tier === "free" ? "free" : "standard" });
  } catch (error) {
    const denied = error instanceof Error && ["Unauthorized", "NOT_ENROLLED", "COURSE_SCOPE_REQUIRED", "CHAT_SESSION_ACCESS_DENIED"].includes(error.message);
    return reply({ code: denied ? "COURSE_ACCESS_DENIED" : "ZYRA_HISTORY_UNAVAILABLE" }, denied ? 403 : 500);
  }
}
