import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { resolveTutorCourseAccess } from "@/lib/auth/tutor-access";
import { resolveActorRoles } from "@/lib/tutor/assessment-policy";
import { computeSnapshotPayload } from "@/lib/cohort-analytics";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { isTutor, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin && !isTutor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });

  const access = await resolveTutorCourseAccess({
    penggunaId: session.user.id,
    courseId,
    allowAdmin: isAdmin,
  });

  if (!access.hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targetCourseId = access.legacyCourseId ?? courseId;
  await computeSnapshotPayload(targetCourseId);
  return NextResponse.json({ updatedAt: new Date().toISOString() });
}
