"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  courses,
  chapters,
  mataKuliah,
  courseVideoPlaylists,
  courseVideos,
} from "@/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { storage } from "@/lib/storage";
import {
  extractYouTubeVideoId,
  getCanonicalYouTubeUrl,
  getYouTubeThumbnailUrl,
  fetchYouTubeVideoMetadata,
  type YouTubeMetadataResult,
} from "@/lib/video/youtube";

/**
 * Representation of a video playlist with its contained videos.
 */
export type VideoPlaylistItem = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
  videos: VideoItem[];
};

/**
 * Representation of a video item within a playlist.
 */
export type VideoItem = {
  id: string;
  courseId: string;
  playlistId: string;
  chapterId: string | null;
  chapterTitle?: string | null;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  videoKey?: string | null;
  thumbnailKey?: string | null;
  duration: number | null;
  fileSize: number | null;
  orderIndex: number;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  locked?: boolean;
};

async function assertVideoManagerPermission(courseId: string): Promise<{
  userId: string;
  courseId: string;
  courseSlug: string;
  isAdmin: boolean;
  validCourseIds: string[];
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const identity = await resolveCourseIdentity(courseId);
  const primaryId = identity?.primaryId || courseId;
  const courseSlug = identity?.slug || courseId;
  const validCourseIds = identity ? identity.allIds : [primaryId];

  if (session.user.role === "admin") {
    return {
      userId: session.user.id,
      courseId: primaryId,
      courseSlug,
      isAdmin: true,
      validCourseIds,
    };
  }

  try {
    await requireTutorCourseAccess(session.user.id, primaryId, { allowAdmin: true });
    return {
      userId: session.user.id,
      courseId: primaryId,
      courseSlug,
      isAdmin: false,
      validCourseIds,
    };
  } catch {
    throw new Error("Akses ditolak: Anda bukan pengajar untuk mata kuliah ini");
  }
}

function revalidateVideoPaths(courseId: string, courseSlug?: string) {
  const targets = new Set<string>([
    `/courses/${courseId}/video`,
    `/tutor/${courseId}/videos`,
    `/admin/courses/${courseId}/videos`,
  ]);

  if (courseSlug && courseSlug !== courseId) {
    targets.add(`/courses/${courseSlug}/video`);
    targets.add(`/admin/courses/${courseSlug}/videos`);
    targets.add(`/tutor/${courseSlug}/videos`);
  }

  for (const path of targets) {
    revalidatePath(path);
  }
}

/**
 * Fetches all video playlists and their videos for a course.
 * Requires a valid session and caller entitlement (enrolled student or course manager/staff).
 */
export async function getCourseVideosData(courseSlugOrId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return null;
  }

  const identity = await resolveCourseIdentity(courseSlugOrId);
  if (!identity) {
    return null;
  }

  const access = await resolveCourseAccess({
    courseId: identity.primaryId,
    userId: session.user.id,
    roleHint: (session.user as { role?: string | null }).role,
  });

  const isEnrolled = access.isEnrolled || access.tier === "staff";

  const courseIds = identity.allIds;

  const [courseRows, chapterRows, playlistRows, videoRows] = await Promise.all([
    db
      .select({ id: courses.id, title: courses.title, category: courses.category })
      .from(courses)
      .where(inArray(courses.id, courseIds))
      .limit(1),
    db
      .select({ id: chapters.id, title: chapters.title, orderIndex: chapters.orderIndex })
      .from(chapters)
      .where(inArray(chapters.courseId, courseIds))
      .orderBy(asc(chapters.orderIndex)),
    db
      .select()
      .from(courseVideoPlaylists)
      .where(inArray(courseVideoPlaylists.courseId, courseIds))
      .orderBy(asc(courseVideoPlaylists.orderIndex), asc(courseVideoPlaylists.createdAt)),
    db
      .select()
      .from(courseVideos)
      .where(inArray(courseVideos.courseId, courseIds))
      .orderBy(asc(courseVideos.orderIndex), asc(courseVideos.createdAt)),
  ]);

  const course = courseRows[0] || {
    id: identity.primaryId,
    title: identity.title,
    category: "Umum",
  };

  const chapterMap = new Map(chapterRows.map((ch) => [ch.id, ch.title]));

  const mappedVideos: VideoItem[] = videoRows.map((v) => {
    const isExternalVideo =
      Boolean(v.videoUrl) &&
      (v.videoUrl.startsWith("http://") ||
        v.videoUrl.startsWith("https://") ||
        v.videoUrl.startsWith("youtube/"));

    const resolvedVideoUrl = v.videoUrl
      ? isExternalVideo
        ? v.videoUrl
        : storage.getUrl(v.videoUrl)
      : "";

    const isExternalThumb =
      Boolean(v.thumbnailUrl) &&
      (v.thumbnailUrl?.startsWith("http://") ||
        v.thumbnailUrl?.startsWith("https://") ||
        false);

    const resolvedThumbnailUrl = v.thumbnailUrl
      ? isExternalThumb
        ? v.thumbnailUrl
        : storage.getUrl(v.thumbnailUrl)
      : null;

    return {
      id: v.id,
      courseId: v.courseId,
      playlistId: v.playlistId,
      chapterId: v.chapterId,
      chapterTitle: v.chapterId ? chapterMap.get(v.chapterId) || null : null,
      title: v.title,
      description: v.description,
      videoUrl: isEnrolled ? resolvedVideoUrl : "",
      thumbnailUrl: resolvedThumbnailUrl,
      videoKey: isEnrolled ? (v.videoUrl || null) : null,
      thumbnailKey: v.thumbnailUrl || null,
      duration: v.duration,
      fileSize: v.fileSize,
      orderIndex: v.orderIndex,
      uploadedBy: v.uploadedBy,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      locked: !isEnrolled,
    };
  });

  const videosByPlaylist = new Map<string, VideoItem[]>();
  for (const v of mappedVideos) {
    const list = videosByPlaylist.get(v.playlistId) || [];
    list.push(v);
    videosByPlaylist.set(v.playlistId, list);
  }

  const playlists: VideoPlaylistItem[] = playlistRows.map((p) => ({
    id: p.id,
    courseId: p.courseId,
    title: p.title,
    description: p.description,
    orderIndex: p.orderIndex,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    videos: videosByPlaylist.get(p.id) || [],
  }));

  return {
    course,
    courseSlug: identity.slug,
    chapters: chapterRows,
    playlists,
    videos: mappedVideos,
    isEnrolled,
  };
}

/**
 * Creates a new video playlist for a course.
 */
export async function createVideoPlaylistAction(
  courseId: string,
  title: string,
  description?: string | null
) {
  try {
    const authInfo = await assertVideoManagerPermission(courseId);
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      return { success: false, error: "Judul playlist wajib diisi" };
    }

    const id = randomUUID();
    const existing = await db
      .select({ count: courseVideoPlaylists.id })
      .from(courseVideoPlaylists)
      .where(eq(courseVideoPlaylists.courseId, authInfo.courseId));

    await db.insert(courseVideoPlaylists).values({
      id,
      courseId: authInfo.courseId,
      title: cleanTitle,
      description: description?.trim() || null,
      orderIndex: existing.length + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    revalidateVideoPaths(authInfo.courseId, authInfo.courseSlug);
    return { success: true, playlistId: id };
  } catch (error: any) {
    return { success: false, error: error?.message || "Gagal membuat playlist" };
  }
}

/**
 * Updates an existing video playlist.
 */
export async function updateVideoPlaylistAction(
  playlistId: string,
  title: string,
  description?: string | null
) {
  try {
    const rows = await db
      .select()
      .from(courseVideoPlaylists)
      .where(eq(courseVideoPlaylists.id, playlistId))
      .limit(1);

    if (rows.length === 0) {
      return { success: false, error: "Playlist tidak ditemukan" };
    }

    const playlist = rows[0];
    const authInfo = await assertVideoManagerPermission(playlist.courseId);

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      return { success: false, error: "Judul playlist wajib diisi" };
    }

    await db
      .update(courseVideoPlaylists)
      .set({
        title: cleanTitle,
        description: description?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(courseVideoPlaylists.id, playlistId));

    revalidateVideoPaths(authInfo.courseId, authInfo.courseSlug);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Gagal memperbarui playlist" };
  }
}

/**
 * Deletes a video playlist.
 */
export async function deleteVideoPlaylistAction(playlistId: string) {
  try {
    const rows = await db
      .select()
      .from(courseVideoPlaylists)
      .where(eq(courseVideoPlaylists.id, playlistId))
      .limit(1);

    if (rows.length === 0) {
      return { success: false, error: "Playlist tidak ditemukan" };
    }

    const playlist = rows[0];
    const authInfo = await assertVideoManagerPermission(playlist.courseId);

    // Delete associated videos first, scoped to this course
    const videos = await db
      .select({ id: courseVideos.id, videoUrl: courseVideos.videoUrl, thumbnailUrl: courseVideos.thumbnailUrl })
      .from(courseVideos)
      .where(
        and(
          eq(courseVideos.playlistId, playlistId),
          inArray(courseVideos.courseId, authInfo.validCourseIds)
        )
      );

    for (const v of videos) {
      const isExtVid = v.videoUrl?.startsWith("http://") || v.videoUrl?.startsWith("https://") || v.videoUrl?.startsWith("youtube/");
      const isExtThumb = v.thumbnailUrl?.startsWith("http://") || v.thumbnailUrl?.startsWith("https://");
      if (v.videoUrl && !isExtVid) await storage.delete(v.videoUrl).catch(() => {});
      if (v.thumbnailUrl && !isExtThumb) await storage.delete(v.thumbnailUrl).catch(() => {});
    }

    await db
      .delete(courseVideos)
      .where(
        and(
          eq(courseVideos.playlistId, playlistId),
          inArray(courseVideos.courseId, authInfo.validCourseIds)
        )
      );
    await db.delete(courseVideoPlaylists).where(eq(courseVideoPlaylists.id, playlistId));

    revalidateVideoPaths(authInfo.courseId, authInfo.courseSlug);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Gagal menghapus playlist" };
  }
}

/**
 * Fetches video metadata (title, author, thumbnail) from YouTube oEmbed.
 */
export async function fetchYouTubeMetadataAction(
  urlOrId: string
): Promise<YouTubeMetadataResult> {
  try {
    return await fetchYouTubeVideoMetadata(urlOrId);
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Gagal mengambil data video dari YouTube",
    };
  }
}

/**
 * Saves (creates or updates) a course video.
 */
export async function saveCourseVideoAction(input: {
  id?: string | null;
  courseId: string;
  playlistId: string;
  chapterId?: string | null;
  title: string;
  description?: string | null;
  videoUrl: string;
  thumbnailUrl?: string | null;
  duration?: number | null;
  fileSize?: number | null;
}) {
  try {
    const authInfo = await assertVideoManagerPermission(input.courseId);

    const cleanTitle = input.title.trim();
    if (!cleanTitle) {
      return { success: false, error: "Judul video wajib diisi" };
    }
    if (!input.playlistId) {
      return { success: false, error: "Playlist wajib dipilih" };
    }
    const rawVideoUrl = input.videoUrl.trim();
    if (!rawVideoUrl) {
      return { success: false, error: "Berkas atau tautan video wajib diisi" };
    }

    // Process YouTube link or ID
    const youtubeId = extractYouTubeVideoId(rawVideoUrl);
    const finalVideoUrl = youtubeId ? getCanonicalYouTubeUrl(youtubeId) : rawVideoUrl;

    let finalThumbnailUrl = input.thumbnailUrl?.trim() || null;
    if (!finalThumbnailUrl && youtubeId) {
      finalThumbnailUrl = getYouTubeThumbnailUrl(youtubeId, "hq");
    }

    // Verify playlist belongs to this course
    const playlist = await db
      .select({ id: courseVideoPlaylists.id, courseId: courseVideoPlaylists.courseId })
      .from(courseVideoPlaylists)
      .where(eq(courseVideoPlaylists.id, input.playlistId))
      .limit(1);

    if (playlist.length === 0) {
      return { success: false, error: "Playlist tidak ditemukan" };
    }
    if (!authInfo.validCourseIds.includes(playlist[0].courseId)) {
      return { success: false, error: "Playlist bukan bagian dari mata kuliah ini" };
    }

    if (input.id) {
      // Update existing
      const existing = await db
        .select()
        .from(courseVideos)
        .where(eq(courseVideos.id, input.id))
        .limit(1);

      if (existing.length === 0) {
        return { success: false, error: "Video tidak ditemukan" };
      }

      if (!authInfo.validCourseIds.includes(existing[0].courseId)) {
        return { success: false, error: "Video bukan bagian dari mata kuliah ini" };
      }

      await db
        .update(courseVideos)
        .set({
          playlistId: input.playlistId,
          chapterId: input.chapterId || null,
          title: cleanTitle,
          description: input.description?.trim() || null,
          videoUrl: finalVideoUrl,
          thumbnailUrl: finalThumbnailUrl,
          duration: input.duration || null,
          fileSize: input.fileSize || null,
          updatedAt: new Date(),
        })
        .where(eq(courseVideos.id, input.id));
    } else {
      // Insert new
      const id = randomUUID();
      const existingVideos = await db
        .select({ id: courseVideos.id })
        .from(courseVideos)
        .where(eq(courseVideos.playlistId, input.playlistId));

      await db.insert(courseVideos).values({
        id,
        courseId: authInfo.courseId,
        playlistId: input.playlistId,
        chapterId: input.chapterId || null,
        title: cleanTitle,
        description: input.description?.trim() || null,
        videoUrl: finalVideoUrl,
        thumbnailUrl: finalThumbnailUrl,
        duration: input.duration || null,
        fileSize: input.fileSize || null,
        orderIndex: existingVideos.length + 1,
        uploadedBy: authInfo.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    revalidateVideoPaths(authInfo.courseId, authInfo.courseSlug);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Gagal menyimpan video" };
  }
}

/**
 * Deletes a course video.
 */
export async function deleteCourseVideoAction(videoId: string) {
  try {
    const rows = await db
      .select()
      .from(courseVideos)
      .where(eq(courseVideos.id, videoId))
      .limit(1);

    if (rows.length === 0) {
      return { success: false, error: "Video tidak ditemukan" };
    }

    const video = rows[0];
    const authInfo = await assertVideoManagerPermission(video.courseId);
    if (!authInfo.validCourseIds.includes(video.courseId)) {
      return { success: false, error: "Akses ditolak untuk video ini" };
    }

    const isExtVid = video.videoUrl?.startsWith("http://") || video.videoUrl?.startsWith("https://") || video.videoUrl?.startsWith("youtube/");
    const isExtThumb = video.thumbnailUrl?.startsWith("http://") || video.thumbnailUrl?.startsWith("https://");
    if (video.videoUrl && !isExtVid) await storage.delete(video.videoUrl).catch(() => {});
    if (video.thumbnailUrl && !isExtThumb) await storage.delete(video.thumbnailUrl).catch(() => {});

    await db.delete(courseVideos).where(eq(courseVideos.id, videoId));

    revalidateVideoPaths(authInfo.courseId, authInfo.courseSlug);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Gagal menghapus video" };
  }
}
