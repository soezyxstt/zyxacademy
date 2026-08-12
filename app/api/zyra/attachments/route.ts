import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatSessions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isEnrolled } from "@/lib/course-utils";
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
    const parsed = ZyraImageUploadInputSchema.safeParse({
      courseId: form.get("courseId"),
      sessionId: form.get("sessionId"),
    });
    const file = form.get("file");
    if (!parsed.success || !(file instanceof File)) return errorResponse("INVALID_ATTACHMENT_REQUEST", 400);
    if (user.role !== "admin" && !(await isEnrolled(user.id, parsed.data.courseId))) {
      return errorResponse("NOT_FOUND", 404);
    }

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

    const bytes = new Uint8Array(await file.arrayBuffer());
    const attachment = await createZyraImageAttachment({
      studentId: chatSession.studentId,
      courseId: chatSession.courseId,
      sessionId: chatSession.id,
      bytes,
      declaredMimeType: file.type,
    });
    return NextResponse.json({
      id: attachment.id,
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
