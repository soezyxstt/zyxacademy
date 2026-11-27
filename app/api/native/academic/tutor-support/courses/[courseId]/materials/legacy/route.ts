import { revalidatePath } from "next/cache";
import { getAuthSession } from "@/lib/auth-session";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { hasAnyPeran } from "@/lib/auth/request-cache";
import { db } from "@/db";
import { courseCommandReply, handleCourseCommand, validCourseCommandId } from "@/lib/native/academic/course-command";
import { assertNativeAdminTransaction } from "@/lib/native/academic/administration/admin-transaction";
import { runAdminCommand } from "@/lib/native/academic/administration/admin-command-receipt";
import { lockLegacyMaterialCourse, readLegacyMaterialDraft, writeLegacyMaterial } from "@/lib/tutor/legacy-materials";
import { tutorLegacyMaterialBodyBytes, tutorLegacyMaterialCommand } from "@/packages/academic/tutor-legacy-materials";

type Context = { params: Promise<{ courseId: string }> };
const verified = {
  session: getAuthSession,
  async hasAdmin(id: string) {
    return await hasAnyPeran(id, ["tutor"], { allowAdmin: false }) && await hasAnyPeran(id, ["admin"], { allowAdmin: false });
  },
};

export async function GET(request: Request, context: Context) {
  const { courseId } = await context.params;
  const ids = new URL(request.url).searchParams.getAll("materialId");
  if (!validCourseCommandId(courseId) || ids.length !== 1 || !validCourseCommandId(ids[0])) {
    return courseCommandReply(400, { error: "INVALID_MATERIAL" });
  }
  try {
    const viewer = await verified.session();
    if (!viewer?.user.id || !viewer.session?.id) return courseCommandReply(401, { error: "UNAUTHENTICATED" });
    if (!await verified.hasAdmin(viewer.user.id)) return courseCommandReply(403, { error: "FORBIDDEN" });
    const material = await db.transaction(async tx => {
      await assertNativeAdminTransaction(tx, viewer);
      await assertAuthoringActor(tx, viewer.user.id, { roles: ["tutor"], error: "FORBIDDEN", lock: true });
      const legacyId = await lockLegacyMaterialCourse(tx, viewer.user.id, courseId);
      return readLegacyMaterialDraft(tx, legacyId, ids[0]);
    });
    return courseCommandReply(200, material);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "FORBIDDEN") return courseCommandReply(403, { error: code });
    if (code === "UNAUTHENTICATED") return courseCommandReply(401, { error: code });
    if (code === "NOT_FOUND" || code === "COURSE_LEGACY_MAPPING_REQUIRED") return courseCommandReply(404, { error: "NOT_FOUND" });
    return courseCommandReply(500, { error: "READ_FAILED" });
  }
}

export async function POST(request: Request, context: Context) {
  const { courseId } = await context.params;
  if (!validCourseCommandId(courseId)) return courseCommandReply(400, { error: "INVALID_MATERIAL" });
  return handleCourseCommand(request, new URL(resolveAuthBaseUrl()).origin, verified, {
    schema: tutorLegacyMaterialCommand,
    invalidError: "INVALID_MATERIAL",
    maxBodyBytes: tutorLegacyMaterialBodyBytes,
    async write(command, requestId, viewer) {
      let legacyCourseId: string | undefined;
      try {
        await runAdminCommand("legacy_tutor_material", { courseId, ...command }, requestId, viewer, async tx => {
          await assertAuthoringActor(tx, viewer.user.id, { roles: ["tutor"], error: "FORBIDDEN", lock: true });
          legacyCourseId = await lockLegacyMaterialCourse(tx, viewer.user.id, courseId);
          return writeLegacyMaterial(tx, legacyCourseId, command);
        });
      } catch (error) {
        if (error instanceof Error && ["NOT_FOUND", "COURSE_LEGACY_MAPPING_REQUIRED"].includes(error.message)) throw new Error("MATERIAL_NOT_FOUND");
        throw error;
      }
      for (const id of new Set([courseId, legacyCourseId].filter((value): value is string => Boolean(value)))) {
        revalidatePath(`/tutor/${encodeURIComponent(id)}/materials`);
        revalidatePath(`/courses/${encodeURIComponent(id)}/material`);
      }
    },
  });
}
