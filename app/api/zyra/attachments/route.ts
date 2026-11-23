import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatSessions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { createChatSession } from "@/lib/zyra/zyra-context-builder";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import {
  createZyraImageAttachment,
  isZyraImageFeatureEnabled,
  ZyraImageSanitizationError,
  ZyraImageUploadInputSchema,
} from "@/lib/zyra/images";

export const dynamic = "force-dynamic";

function errorResponse(code: string, status: number): NextResponse {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isZyraImageFeatureEnabled(zyraRuntimeEnv.FEATURE_ZYRA_IMAGE_INPUT_V1)) {
    return errorResponse("NOT_FOUND", 404);
  }
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user as { id?: string; role?: string | null } | undefined;
  if (!user?.id) return errorResponse("UNAUTHORIZED", 401);

  try {
    const form = await request.formData();
    const rawCourseId = typeof form.get("courseId") === "string" ? String(form.get("courseId")).trim() : "";
    const rawSessionId = typeof form.get("sessionId") === "string" ? String(form.get("sessionId")).trim() : "";
    const file = form.get("file");
    if (!rawCourseId || !(file instanceof File)) return errorResponse("INVALID_ATTACHMENT_REQUEST", 400);

    const access = await resolveCourseAccess({
      courseId: rawCourseId,
      userId: user.id,
      roleHint: user.role,
    });
    if (!access.hasCourseAccess || (access.tier !== "enrolled" && access.tier !== "staff")) {
      return errorResponse("NOT_FOUND", 404);
    }

    let resolvedSessionId = rawSessionId;
    if (!resolvedSessionId) {
      resolvedSessionId = await createChatSession(user.id, rawCourseId, "General Chat");
    } else {
      const parsed = ZyraImageUploadInputSchema.safeParse({
        courseId: rawCourseId,
        sessionId: resolvedSessionId,
      });
      if (!parsed.success) return errorResponse("INVALID_ATTACHMENT_REQUEST", 400);

      const [chatSession] = await db
        .select({ id: chatSessions.id, studentId: chatSessions.studentId, courseId: chatSessions.courseId })
        .from(chatSessions)
        .where(and(
          eq(chatSessions.id, parsed.data.sessionId),
          eq(chatSessions.courseId, parsed.data.courseId),
          eq(chatSessions.studentId, user.id),
        ))
        .limit(1);
      if (!chatSession) return errorResponse("NOT_FOUND", 404);
      resolvedSessionId = chatSession.id;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const attachment = await createZyraImageAttachment({
      studentId: user.id,
      courseId: rawCourseId,
      sessionId: resolvedSessionId,
      bytes,
      declaredMimeType: file.type,
    });
    return NextResponse.json({
      id: attachment.id,
      sessionId: resolvedSessionId,
      mimeType: attachment.mimeType,
      byteSize: attachment.byteSize,
      width: attachment.width,
      height: attachment.height,
      status: attachment.status,
      expiresAt: attachment.expiresAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ZyraImageSanitizationError) return errorResponse(error.code, 400);
    if (error instanceof Error && error.message === "ZYRA_IMAGE_COUNT_LIMIT") return errorResponse(error.message, 400);
    return errorResponse("ATTACHMENT_UPLOAD_FAILED", 400);
  }
}
