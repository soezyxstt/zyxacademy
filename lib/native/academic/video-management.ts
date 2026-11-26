import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chapters, courses, courseVideoPlaylists, courseVideos } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { checkTutorCourseAccess } from "@/lib/auth/tutor-access";
import { recordOfflineChange } from "@/lib/offline/server-events";
import { writeCoursePlaylist, writeCourseVideo } from "@/lib/video/catalog-write";
import { revalidateVideoPaths } from "@/lib/video/catalog-invalidation";
import { videoEntryRevision, videoPlaylistRevision } from "@/lib/video/catalog-revisions";
import { extractYouTubeVideoId, getCanonicalYouTubeUrl, getYouTubeThumbnailUrl } from "@/lib/video/youtube";
import type { ManagedVideoCommand, VideoManagementCatalog, VideoManagerRole } from "@/packages/course-video/management";
import type { CourseCommandViewer } from "./course-command";
import { assertCourseWriteAuthority, courseWrite, type CourseWriteTransaction } from "./course-write";

type Context = { courseId: string; role: VideoManagerRole; viewer: CourseCommandViewer };

async function authorizedCourse(tx: CourseWriteTransaction, context: Context) {
  await assertCourseWriteAuthority(tx, context.viewer, context.role);
  const scope = await resolveCourseIdentity(context.courseId, tx);
  if (!scope || scope.status !== "active") throw new Error("COURSE_NOT_FOUND");
  if (context.role === "tutor" && !(await checkTutorCourseAccess(context.viewer.user.id, scope.primaryId, { allowAdmin: false }, tx)).hasAccess) {
    throw new Error("FORBIDDEN");
  }
  const physical = scope.legacyId ?? scope.primaryId;
  const [catalog] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, physical)).limit(1);
  if (!catalog) throw new Error("COURSE_NOT_FOUND");
  return { ...scope, catalogId: catalog.id };
}

export async function readVideoManagement(context: Context): Promise<VideoManagementCatalog> {
  return db.transaction(async tx => {
    const scope = await authorizedCourse(tx, context);
    const [playlists, videos, courseChapters] = await Promise.all([
      tx.select().from(courseVideoPlaylists).where(inArray(courseVideoPlaylists.courseId, scope.allIds))
        .orderBy(asc(courseVideoPlaylists.orderIndex), asc(courseVideoPlaylists.id)),
      tx.select().from(courseVideos).where(inArray(courseVideos.courseId, scope.allIds))
        .orderBy(asc(courseVideos.orderIndex), asc(courseVideos.id)),
      tx.select({ id: chapters.id, title: chapters.title }).from(chapters).where(inArray(chapters.courseId, scope.allIds))
        .orderBy(asc(chapters.orderIndex), asc(chapters.id)),
    ]);
    const ordered = new Map<string, typeof videos>();
    for (const video of videos) {
      const list = ordered.get(video.playlistId) ?? [];
      list.push(video);
      ordered.set(video.playlistId, list);
    }
    return {
      courseId: context.courseId, title: scope.title, chapters: courseChapters,
      playlists: playlists.map(playlist => {
        const entries = ordered.get(playlist.id) ?? [];
        return { id: playlist.id, title: playlist.title, description: playlist.description,
          revision: videoPlaylistRevision(playlist, entries), videos: entries.map(video => ({
            id: video.id, title: video.title, description: video.description, revision: videoEntryRevision(video),
            chapterId: video.chapterId, youtube: extractYouTubeVideoId(video.videoUrl),
            duration: video.duration, fileSize: video.fileSize,
          })) };
      }),
    };
  });
}

export async function writeVideoManagement(context: Context, command: ManagedVideoCommand, requestId: string) {
  const id = "id" in command ? command.id : randomUUID();
  const action = command.action.startsWith("new-") ? "create" : command.action.startsWith("edit-") ? "update" : "delete";
  const result = await courseWrite({
    slug: context.courseId, targetId: JSON.stringify([context.role, "id" in command ? command.id : null]),
    draft: command, requestId, viewer: context.viewer, entityType: "native_course_video", action,
    async authorize(tx) { await authorizedCourse(tx, context); },
    async validateReplay(tx, saved) {
      const scope = await resolveCourseIdentity(context.courseId, tx);
      if (!scope || scope.primaryId !== saved.canonicalCourseId || ("id" in command && id !== saved.id)) throw new Error("COURSE_NOT_FOUND");
    },
    async write(tx) {
      const scope = await resolveCourseIdentity(context.courseId, tx);
      if (!scope) throw new Error("COURSE_NOT_FOUND");
      const courseId = scope.legacyId ?? scope.primaryId;
      const receipt = { id, canonicalCourseId: scope.primaryId, legacyCourseId: scope.legacyId ?? undefined };
      if (command.action === "new-playlist") {
        await writeCoursePlaylist(tx, { id, courseId, draft: command.fields, create: true });
        return receipt;
      }
      const playlistId = command.action === "new-video" ? command.fields.playlistId
        : command.action === "edit-video" || command.action === "delete-video" ? command.playlistId : id;
      const [playlist] = await tx.select().from(courseVideoPlaylists).where(and(
        eq(courseVideoPlaylists.id, playlistId), inArray(courseVideoPlaylists.courseId, scope.allIds),
      )).limit(1).for("update");
      if (!playlist) throw new Error("VIDEO_NOT_FOUND");

      if (command.action === "edit-playlist" || command.action === "delete-playlist") {
        const entries = await tx.select().from(courseVideos).where(eq(courseVideos.playlistId, playlistId)).for("update");
        if (entries.some(entry => !scope.allIds.includes(entry.courseId))) throw new Error("DEPENDENCIES_EXIST");
        if (videoPlaylistRevision(playlist, entries) !== command.expectedRevision) throw new Error("REVISION_CONFLICT");
        if (command.action === "edit-playlist") {
          await writeCoursePlaylist(tx, { id, courseId: playlist.courseId, draft: command.fields, create: false });
        } else {
          await tx.delete(courseVideoPlaylists).where(eq(courseVideoPlaylists.id, id));
          for (const affected of new Set([playlist.courseId, ...entries.map(video => video.courseId)])) {
            await recordOfflineChange(tx, { kind: "video_catalog", courseId: affected, action: "delete" });
          }
        }
        return receipt;
      }

      const [existing] = command.action === "new-video" ? [] : await tx.select().from(courseVideos).where(and(
        eq(courseVideos.id, id), eq(courseVideos.playlistId, playlistId), inArray(courseVideos.courseId, scope.allIds),
      )).limit(1).for("update");
      if (command.action !== "new-video" && !existing) throw new Error("VIDEO_NOT_FOUND");
      if (command.action !== "new-video" && videoEntryRevision(existing!) !== command.expectedRevision) throw new Error("REVISION_CONFLICT");
      if (command.action === "delete-video") {
        await tx.delete(courseVideos).where(eq(courseVideos.id, id));
        await recordOfflineChange(tx, { kind: "video_catalog", courseId: existing!.courseId, action: "delete" });
        return receipt;
      }

      const { fields } = command;
      if (fields.playlistId !== playlistId) {
        const [target] = await tx.select({ id: courseVideoPlaylists.id }).from(courseVideoPlaylists).where(and(
          eq(courseVideoPlaylists.id, fields.playlistId), inArray(courseVideoPlaylists.courseId, scope.allIds),
        )).limit(1).for("share");
        if (!target) throw new Error("VIDEO_NOT_FOUND");
      }
      if (fields.chapterId) {
        const [chapter] = await tx.select({ id: chapters.id }).from(chapters).where(and(
          eq(chapters.id, fields.chapterId), inArray(chapters.courseId, scope.allIds),
        )).limit(1).for("share");
        if (!chapter) throw new Error("CHAPTER_NOT_FOUND");
      }
      let videoUrl = existing?.videoUrl ?? "";
      let thumbnailUrl = existing?.thumbnailUrl ?? null;
      if (fields.source.kind === "youtube") {
        const youtube = extractYouTubeVideoId(fields.source.video);
        if (!youtube) throw new Error("INVALID_VIDEO");
        videoUrl = getCanonicalYouTubeUrl(youtube);
        if (videoUrl !== existing?.videoUrl) thumbnailUrl = getYouTubeThumbnailUrl(youtube, "hq");
      }
      if (!videoUrl) throw new Error("INVALID_VIDEO");
      const sourceChanged = existing?.videoUrl !== videoUrl;
      await writeCourseVideo(tx, {
        id, courseId: existing?.courseId ?? playlist.courseId, userId: context.viewer.user.id, create: !existing,
        accessChanged: Boolean(existing && (sourceChanged || existing.chapterId !== fields.chapterId)),
        draft: { ...fields, videoUrl, thumbnailUrl,
          duration: sourceChanged ? null : existing?.duration, fileSize: sourceChanged ? null : existing?.fileSize },
      });
      return receipt;
    },
  });
  revalidateVideoPaths(result.canonicalCourseId, context.courseId);
  if (result.legacyCourseId) revalidateVideoPaths(result.legacyCourseId);
  return { id: result.id };
}
