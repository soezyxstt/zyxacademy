import { getAuthSession } from "@/lib/auth-session";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { courseCommandReply, validCourseCommandId } from "@/lib/native/academic/course-command";
import { handleNativeTextDocumentWrite } from "@/lib/native/academic/course-text-document-command";
import { readNativeCourseTextDocument, writeNativeCourseTextDocument } from "@/lib/native/academic/course-text-document-service";
import { academicReadServices } from "@/lib/native/academic/read-services";

type Context = { params: Promise<{ slug: string; materialId: string }> };

export async function GET(_request: Request, context: Context) {
  const { slug, materialId } = await context.params;
  if (!validCourseCommandId(slug) || !validCourseCommandId(materialId)) return courseCommandReply(400, { error: "INVALID_PATH" });
  try {
    const viewer = await getAuthSession();
    if (!viewer?.user.id || !viewer.session.id) return courseCommandReply(401, { error: "UNAUTHENTICATED" });
    const document = await readNativeCourseTextDocument(slug, materialId, viewer);
    return courseCommandReply(200, document);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return courseCommandReply(401, { error: code });
    if (code === "FORBIDDEN") return courseCommandReply(403, { error: code });
    if (code === "MATERIAL_NOT_FOUND" || code === "COURSE_NOT_FOUND") return courseCommandReply(404, { error: "NOT_FOUND" });
    return courseCommandReply(500, { error: "READ_FAILED" });
  }
}

export async function PATCH(request: Request, context: Context) {
  const { slug, materialId } = await context.params;
  return handleNativeTextDocumentWrite(request, slug, materialId, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession, hasAdmin: academicReadServices.hasAdmin, write: writeNativeCourseTextDocument,
  });
}
