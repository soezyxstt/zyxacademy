import { z } from "zod";
import { getAuthSession } from "@/lib/auth-session";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { courseCommandReply, readCourseCommandBody, validCourseCommandId } from "@/lib/native/academic/course-command";
import { suggestCourseDocument } from "@/lib/native/academic/document-suggestion";
import { isMetadataValues, type MetadataValues } from "@/packages/native-parity/academic/courses/document-suggestion";

const input = z.object({
  source: z.enum(["pdf", "canonical-article", "canonical-diktat", "legacy-article"]),
  values: z.custom<MetadataValues>(isMetadataValues).transform(({ title, category, subcategory, year }) => ({ title, category, subcategory, year })),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ slug: string; materialId: string }> }) {
  const { slug, materialId } = await context.params;
  if (!validCourseCommandId(slug) || !validCourseCommandId(materialId)) return courseCommandReply(400, { error: "INVALID_PATH" });
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== new URL(resolveAuthBaseUrl()).origin || (site && site !== "same-origin")) {
    return courseCommandReply(403, { error: "INVALID_ORIGIN" });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return courseCommandReply(415, { error: "INVALID_CONTENT_TYPE" });
  try {
    const viewer = await getAuthSession();
    if (!viewer?.user.id || !viewer.session.id) return courseCommandReply(401, { error: "UNAUTHENTICATED" });
    const body = await readCourseCommandBody(request, input, 8192);
    if (!body?.success) return courseCommandReply(422, { error: "INVALID_MATERIAL" });
    return courseCommandReply(200, await suggestCourseDocument(viewer, slug, materialId, body.data.source, body.data.values));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return courseCommandReply(401, { error: code });
    if (code === "FORBIDDEN") return courseCommandReply(403, { error: code });
    if (code === "NOT_FOUND") return courseCommandReply(404, { error: code });
    return courseCommandReply(503, { error: "SUGGESTION_UNAVAILABLE" });
  }
}
