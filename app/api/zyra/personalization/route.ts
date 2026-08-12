import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import {
  canAccessZyraPersonalizationCourse,
  getZyraProfileView,
  resetZyraAdaptation,
  updateZyraPreferences,
  ZyraLearnerPreferencesSchema,
} from "@/lib/zyra/personalization";

export const dynamic = "force-dynamic";

const CourseQuerySchema = z.object({ courseId: z.string().trim().min(1).max(160) });
const UpdateSchema = z.object({
  courseId: z.string().trim().min(1).max(160),
  preferences: ZyraLearnerPreferencesSchema,
}).strict();

function disabledResponse() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

async function currentActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

async function assertAccess(actor: { id: string; role?: string | null }, courseId: string) {
  return canAccessZyraPersonalizationCourse({
    studentId: actor.id,
    actorId: actor.id,
    courseId,
    role: actor.role,
  });
}

export async function GET(request: NextRequest) {
  if (zyraRuntimeEnv.FEATURE_ZYRA_PERSONALIZATION_V1 !== "1") return disabledResponse();
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CourseQuerySchema.safeParse({
    courseId: request.nextUrl.searchParams.get("courseId"),
  });
  if (!parsed.success) return NextResponse.json({ error: "courseId required" }, { status: 400 });
  if (!(await assertAccess(actor, parsed.data.courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await getZyraProfileView({
    studentId: actor.id,
    courseId: parsed.data.courseId,
  });
  return NextResponse.json({ profile });
}

export async function PUT(request: NextRequest) {
  if (zyraRuntimeEnv.FEATURE_ZYRA_PERSONALIZATION_V1 !== "1") return disabledResponse();
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!(await assertAccess(actor, parsed.data.courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await updateZyraPreferences({
    studentId: actor.id,
    courseId: parsed.data.courseId,
    preferences: parsed.data.preferences,
  });
  return NextResponse.json({ profile });
}

export async function DELETE(request: NextRequest) {
  if (zyraRuntimeEnv.FEATURE_ZYRA_PERSONALIZATION_V1 !== "1") return disabledResponse();
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CourseQuerySchema.safeParse({
    courseId: request.nextUrl.searchParams.get("courseId"),
  });
  if (!parsed.success) return NextResponse.json({ error: "courseId required" }, { status: 400 });
  if (!(await assertAccess(actor, parsed.data.courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await resetZyraAdaptation({
    studentId: actor.id,
    courseId: parsed.data.courseId,
  });
  return NextResponse.json({ profile, reset: true });
}
