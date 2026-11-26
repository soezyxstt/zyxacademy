import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { env } from "@/lib/env";
import { mintStudentLiveJoin } from "@/lib/live-student-join";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { requireNativeStudent } from "../../_session";

const joinSchema = z.object({ code: z.string().trim().length(6), courseId: z.string().trim().min(1).max(256) }).strict();
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  if (env.FEATURE_LIVE !== "1" || !env.NEXT_PUBLIC_REALTIME_URL) return json({ error: "Disabled" }, 404);
  const actor = await requireNativeStudent(request);
  if (actor instanceof Response) return actor;
  const input = joinSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return json({ error: "Invalid live join request" }, 400);
  try {
    const access = await resolveCourseAccess({ courseId: input.data.courseId, userId: actor.userId });
    if (!access.hasCourseAccess || !access.isEnrolled || !access.legacyCourseId) return json({ error: "Not enrolled in this course" }, 403);
    const [learner] = await db.select({ name: user.name }).from(user).where(eq(user.id, actor.userId)).limit(1);
    if (!learner) return json({ error: "Unauthorized" }, 401);
    const joined = await mintStudentLiveJoin({ userId: actor.userId, name: learner.name, courseId: access.legacyCourseId, code: input.data.code });
    return json(joined.body, joined.status);
  } catch (error) {
    console.error("Native Student live join failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Could not join live session" }, 500);
  }
}
