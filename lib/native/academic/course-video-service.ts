import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { courseVideoPlaylists, courseVideos } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { recordOfflineChange } from "@/lib/offline/server-events";
import { revalidateVideoPaths } from "@/lib/video/catalog-invalidation";
import { videoEntryRevision, videoPlaylistRevision } from "@/lib/video/catalog-revisions";
import type { AdminEntityDeleteDraft } from "@/packages/native-parity/academic/courses/edit-contract";
import type { CourseCommandViewer } from "./course-command";
import { courseWrite } from "./course-write";

export async function deleteAdminCourseVideoEntry(slug: string, playlistId: string, videoId: string | undefined, draft: AdminEntityDeleteDraft, requestId: string, viewer: CourseCommandViewer) {
  const id = videoId ?? playlistId;
  const result = await courseWrite({
    slug, targetId: JSON.stringify([playlistId, videoId]), draft, requestId, viewer,
    entityType: "native_course_video", action: "delete",
    async write(tx) {
      const scope = await resolveCourseIdentity(slug, tx);
      if (!scope || scope.status !== "active") throw new Error("COURSE_NOT_FOUND");
      const [playlist] = await tx.select().from(courseVideoPlaylists)
        .where(and(eq(courseVideoPlaylists.id, playlistId), inArray(courseVideoPlaylists.courseId, scope.allIds)))
        .limit(1).for("update");
      if (!playlist) throw new Error("VIDEO_NOT_FOUND");
      const selection = videoId
        ? and(eq(courseVideos.playlistId, playlistId), eq(courseVideos.id, videoId), inArray(courseVideos.courseId, scope.allIds))
        : eq(courseVideos.playlistId, playlistId);
      const videos = await tx.select().from(courseVideos).where(selection).for("update");
      if (videos.some(video => !scope.allIds.includes(video.courseId))) throw new Error("DEPENDENCIES_EXIST");
      if (videoId && !videos[0]) throw new Error("VIDEO_NOT_FOUND");
      const revision = videoId ? videoEntryRevision(videos[0]) : videoPlaylistRevision(playlist, videos);
      if (revision !== draft.expectedRevision) throw new Error("REVISION_CONFLICT");

      if (videoId) await tx.delete(courseVideos).where(selection);
      else await tx.delete(courseVideoPlaylists).where(and(eq(courseVideoPlaylists.id, playlistId), eq(courseVideoPlaylists.courseId, playlist.courseId)));

      // Storage objects may be shared by other entries and versions.
      const affectedCourses = new Set([playlist.courseId, ...videos.map(video => video.courseId)]);
      for (const courseId of affectedCourses) {
        await recordOfflineChange(tx, { kind: "video_catalog", courseId, action: "delete" });
      }
      return { id, canonicalCourseId: scope.primaryId, legacyCourseId: scope.legacyId ?? undefined };
    },
    async validateReplay(tx, saved) {
      const scope = await resolveCourseIdentity(slug, tx);
      if (!scope || scope.status !== "active" || scope.primaryId !== saved.canonicalCourseId || saved.id !== id) {
        throw new Error("COURSE_NOT_FOUND");
      }
    },
  });
  revalidateVideoPaths(result.canonicalCourseId, slug);
  if (result.legacyCourseId) revalidateVideoPaths(result.legacyCourseId);
}
