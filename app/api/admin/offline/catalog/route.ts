import { listStudentCourses } from "@/lib/student/course-catalog";
import { offlineError, offlineHeaders, requireOfflineActor, OfflineHttpError } from "@/lib/offline/server-auth";
import { buildOfflineManifest } from "@/lib/offline/server-resources";
import { offlineLocaleSchema } from "@/lib/offline/sync-contract";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const locale = offlineLocaleSchema.safeParse(params.get("locale") ?? "id");
    if (!locale.success) throw new OfflineHttpError(400, "OFFLINE_INVALID_REQUEST");
    const actor = await requireOfflineActor(request, locale.data, true);
    const courseId = params.get("courseId");
    if (courseId && courseId.length > 256) throw new OfflineHttpError(400, "OFFLINE_INVALID_REQUEST");
    const courses = (await listStudentCourses()).map(({ id, title }) => ({ id, title }));
    const resources = courseId ? (await buildOfflineManifest(actor, courseId)).resources : undefined;
    return Response.json({ courses, resources }, { headers: offlineHeaders(actor) });
  } catch (error) { return offlineError(error); }
}
