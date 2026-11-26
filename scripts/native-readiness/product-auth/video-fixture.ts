import { join } from "node:path";
import { studentNavigationEndpoint } from "@/components/navigation/student/student-nav-model";
import { assertFixtureRunner } from "./scope";

export const course = "native-preview-video-course";
export const video = "native-preview-private-video";
export const privateVideoPath = "/api/storage/file/course-videos/preview.mp4";
const canonical = "native-preview-video-canonical";
const playlist = "native-preview-video-playlist";

export async function createVideoPreview() {
  assertFixtureRunner();
  const [{ db }, schema, learning, playback, { auth }, navigation] = await Promise.all([
    import("@/db"), import("@/db/schema"), import("@/app/api/native/student/learning/route"),
    import("@/app/api/videos/[videoId]/playback-url/route"), import("@/lib/auth"), import("@/app/api/student/navigation/route"),
  ]);
  let seeded: Promise<void> | undefined;

  async function seed(accountId: string) {
    await db.transaction(async tx => {
      await tx.insert(schema.courses).values({ id: course, title: "Kelas video", category: "Matematika" });
      await tx.insert(schema.mataKuliah).values({ id: canonical, code: "PREVIEW-VIDEO", title: "Kelas video", legacyCourseId: course, status: "active" });
      await tx.insert(schema.pendaftaranMurid).values({ id: "native-preview-video-enrollment", penggunaId: accountId,
        mataKuliahId: canonical, status: "active", endAt: new Date(Date.now() + 60 * 60_000) });
      await tx.insert(schema.courseVideoPlaylists).values({ id: playlist, courseId: course, title: "Video kelas" });
      await tx.insert(schema.courseVideos).values({ id: video, courseId: course, playlistId: playlist,
        title: "Gerak benda", videoUrl: privateVideoPath, duration: 2 });
    });
  }

  return async (request: Request, identity: { accountId: string; sessionId: string }) => {
    const url = new URL(request.url);
    const courseNavigation = url.pathname === studentNavigationEndpoint;
    const videoList = url.pathname === "/api/native/student/learning" && url.searchParams.get("view") === "video";
    if ((courseNavigation || videoList) && url.searchParams.get("courseId") === course) {
      const active = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true, disableRefresh: true } });
      if (active?.user.id !== identity.accountId || active.session.id !== identity.sessionId) return new Response(null, { status: 401 });
      // The same session starts with an unenrolled dashboard, then receives a course to exercise playback.
      seeded ??= seed(identity.accountId);
      await seeded;
      return courseNavigation ? navigation.GET(request) : learning.GET(request);
    }
    const authorize = () => playback.GET(request, { params: Promise.resolve({ videoId: video }) });
    if (url.pathname === `/api/videos/${video}/playback-url`) return authorize();
    if (url.pathname !== privateVideoPath) return null;
    // Only the bytes are synthetic. Recheck the real playback route on every media request.
    const authorized = await authorize();
    if (!authorized.ok) return authorized;
    if ((await authorized.json()).url !== privateVideoPath || !process.env.RUNNER_TEMP) return new Response(null, { status: 404 });
    const clip = Bun.file(join(process.env.RUNNER_TEMP, "native-auth-preview", "preview.mp4"));
    if (!await clip.exists()) return new Response(null, { status: 404 });
    return new Response(clip, { headers: { "Content-Type": "video/mp4", "Cache-Control": "private, no-store" } });
  };
}
