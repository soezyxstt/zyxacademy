import { eq } from "drizzle-orm";
import { courseVideoPlaylists, courseVideos } from "@/db/schema";
import { recordOfflineChange, type OfflineTransaction } from "@/lib/offline/server-events";

type PlaylistFields = { title: string; description?: string | null };
type VideoFields = PlaylistFields & {
  playlistId: string; chapterId?: string | null; videoUrl: string; thumbnailUrl?: string | null;
  duration?: number | null; fileSize?: number | null;
};

export async function writeCoursePlaylist(tx: OfflineTransaction, target: {
  id: string; courseId: string; draft: PlaylistFields; create: boolean;
}) {
  const { id, courseId, draft, create } = target;
  const updatedAt = new Date();
  const values = { title: draft.title.trim(), description: draft.description?.trim() || null, updatedAt };
  if (create) {
    const previous = await tx.select({ id: courseVideoPlaylists.id }).from(courseVideoPlaylists)
      .where(eq(courseVideoPlaylists.courseId, courseId));
    await tx.insert(courseVideoPlaylists).values({ ...values, id, courseId, orderIndex: previous.length + 1, createdAt: updatedAt });
  } else {
    await tx.update(courseVideoPlaylists).set(values).where(eq(courseVideoPlaylists.id, id));
  }
  await recordOfflineChange(tx, { kind: "video_catalog", courseId, action: "invalidate" });
}

export async function writeCourseVideo(tx: OfflineTransaction, target: {
  id: string; courseId: string; userId: string; draft: VideoFields; create: boolean; accessChanged?: boolean;
}) {
  const { id, courseId, userId, draft, create, accessChanged } = target;
  const updatedAt = new Date();
  const values = {
    playlistId: draft.playlistId, chapterId: draft.chapterId || null, title: draft.title.trim(),
    description: draft.description?.trim() || null, videoUrl: draft.videoUrl,
    thumbnailUrl: draft.thumbnailUrl || null, duration: draft.duration || null, fileSize: draft.fileSize || null, updatedAt,
  };
  if (create) {
    const previous = await tx.select({ id: courseVideos.id }).from(courseVideos).where(eq(courseVideos.playlistId, draft.playlistId));
    await tx.insert(courseVideos).values({ ...values, id, courseId, orderIndex: previous.length + 1, uploadedBy: userId, createdAt: updatedAt });
  } else {
    await tx.update(courseVideos).set(values).where(eq(courseVideos.id, id));
  }
  await recordOfflineChange(tx, { kind: "video_catalog", courseId, action: accessChanged ? "delete" : "invalidate" });
}
