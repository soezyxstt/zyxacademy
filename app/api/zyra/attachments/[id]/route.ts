import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { zyraMessageAttachments } from "@/db/schema";
import { auth } from "@/lib/auth";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { storage } from "@/lib/storage";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import {
  canAccessZyraAttachment,
  deleteZyraAttachment,
  isZyraImageFeatureEnabled,
  sameZyraAttachmentScope,
} from "@/lib/zyra/images";

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

function requestedScope(request: Request): { courseId: string; sessionId: string } | null {
  const url = new URL(request.url);
  const courseId = url.searchParams.get("courseId")?.trim();
  const sessionId = url.searchParams.get("sessionId")?.trim();
  if (!courseId || !sessionId) return null;
  return { courseId, sessionId };
}

async function authorizedRow(
  id: string,
  scope: { courseId: string; sessionId: string } | null,
) {
  if (!scope) return null;
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user as { id?: string; role?: string | null } | undefined;
  if (!user?.id) return null;
  const [row] = await db
    .select()
    .from(zyraMessageAttachments)
    .where(and(
      eq(zyraMessageAttachments.id, id),
      eq(zyraMessageAttachments.courseId, scope.courseId),
      eq(zyraMessageAttachments.sessionId, scope.sessionId),
    ))
    .limit(1);
  if (!row || row.status === "deleted" || row.status === "expired") return null;
  if (row.expiresAt <= new Date()) {
    await db.update(zyraMessageAttachments).set({ status: "expired" }).where(eq(zyraMessageAttachments.id, id));
    return null;
  }
  if (!sameZyraAttachmentScope({
    requestedCourseId: scope.courseId,
    storedCourseId: row.courseId,
    requestedSessionId: scope.sessionId,
    storedSessionId: row.sessionId,
  })) return null;
  const access = await resolveCourseAccess({
    courseId: scope.courseId,
    userId: user.id,
    roleHint: user.role,
  });
  if (!access.hasCourseAccess || (access.tier !== "enrolled" && access.tier !== "staff")) return null;
  if (!canAccessZyraAttachment({
    actorId: user.id,
    ownerId: row.studentId,
    courseId: row.courseId,
    authorizedCourseId: scope.courseId,
    role: access.roles.includes("admin") ? "admin" : null,
  })) return null;
  return { row, user };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isZyraImageFeatureEnabled(zyraRuntimeEnv.FEATURE_ZYRA_IMAGE_INPUT_V1)) return notFound();
  const { id } = await params;
  const authorized = await authorizedRow(id, requestedScope(request));
  if (!authorized || !storage.download) return notFound();
  try {
    const bytes = await storage.download(authorized.row.objectKey);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": authorized.row.mimeType,
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isZyraImageFeatureEnabled(zyraRuntimeEnv.FEATURE_ZYRA_IMAGE_INPUT_V1)) return notFound();
  const { id } = await params;
  const authorized = await authorizedRow(id, requestedScope(request));
  if (!authorized) return notFound();
  await deleteZyraAttachment(id, authorized.row.studentId);
  return new Response(null, { status: 204 });
}
