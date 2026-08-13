import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import {
  canAccessZyraPersonalizationCourse,
  recordZyraLearningEvent,
  ZyraLearningEventInputSchema,
} from "@/lib/zyra/personalization";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (zyraRuntimeEnv.FEATURE_ZYRA_PERSONALIZATION_V1 !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ZyraLearningEventInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const allowed = await canAccessZyraPersonalizationCourse({
    studentId: session.user.id,
    actorId: session.user.id,
    courseId: parsed.data.courseId,
    role: session.user.role,
  });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await recordZyraLearningEvent(session.user.id, parsed.data);
  return NextResponse.json({ recorded: true });
}
