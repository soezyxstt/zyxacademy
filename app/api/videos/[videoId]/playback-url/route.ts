import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courseVideos } from "@/db/schema";
import { auth } from "@/lib/auth";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { storage } from "@/lib/storage";
import {
  resolveCourseVideoPlaybackUrl,
  VIDEO_PLAYBACK_URL_TTL_SECONDS,
} from "@/lib/video/playback";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

/**
 * Mints a fresh short-lived playback URL (presigned GET when available)
 * for an authorized course video. Used to recover expired signed URLs
 * without reloading the page.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await params;
  const cleanVideoId = videoId?.trim();
  if (!cleanVideoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const [video] = await db
    .select({
      id: courseVideos.id,
      courseId: courseVideos.courseId,
      chapterId: courseVideos.chapterId,
      videoUrl: courseVideos.videoUrl,
    })
    .from(courseVideos)
    .where(eq(courseVideos.id, cleanVideoId))
    .limit(1);

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const access = await resolveCourseAccess({
    courseId: video.courseId,
    userId: session.user.id,
    roleHint: (session.user as { role?: string | null }).role,
  });

  const hasChapterAccess =
    access.tier === "staff" ||
    !video.chapterId ||
    access.scopedChapterIds.includes(video.chapterId);

  if (!access.hasFullContentAccess || !hasChapterAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const resolved = await resolveCourseVideoPlaybackUrl(video.videoUrl, storage);

  return NextResponse.json(
    {
      url: resolved.playbackUrl,
      fallbackUrl: resolved.fallbackUrl,
      isPresigned: resolved.isPresigned,
      expiresIn: resolved.isPresigned ? VIDEO_PLAYBACK_URL_TTL_SECONDS : null,
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
