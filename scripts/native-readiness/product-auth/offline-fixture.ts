import { and, eq } from "drizzle-orm";
import { EXPO_STAGING_ORIGIN } from "@/lib/native/expo-auth-config";
import { assertFixtureRunner, fixtureOrigin } from "./scope";

const course = "native-preview-offline-course";
const canonicalCourse = "native-preview-offline-canonical";
const enrollment = "native-preview-offline-enrollment";
const chapterOne = "native-preview-offline-free";
const chapterTwo = "native-preview-offline-private";
export const offlineTitle = "Diktat verifikasi offline";

export async function createOfflinePreview() {
  assertFixtureRunner();
  const [{ db }, schema, { recordOfflineChange }, sync, manifest, resource] = await Promise.all([
    import("@/db"), import("@/db/schema"), import("@/lib/offline/server-events"),
    import("@/app/api/offline/sync/route"),
    import("@/app/api/offline/manifest/route"),
    import("@/app/api/offline/resource/route"),
  ]);
  const { courses, mataKuliah, bab, pendaftaranMurid, diktatMateri } = schema;
  let savedResponse = false;
  let withdrawn = false;
  let revocationSeen = false;

  return {
    async seed(accountId: string) {
      await db.transaction(async tx => {
        await tx.insert(courses).values({ id: course, title: "Kelas verifikasi offline", category: "Matematika" });
        await tx.insert(mataKuliah).values({
          id: canonicalCourse, code: "AUTH-OFFLINE-PREVIEW", title: "Kelas verifikasi offline", legacyCourseId: course, status: "active",
        });
        await tx.insert(bab).values([
          { id: chapterOne, mataKuliahId: canonicalCourse, code: "START", title: "Dasar", orderIndex: 1, status: "active" },
          { id: chapterTwo, mataKuliahId: canonicalCourse, code: "DETAIL", title: "Lanjut", orderIndex: 2, status: "active" },
        ]);
        await tx.insert(pendaftaranMurid).values({
          id: enrollment, penggunaId: accountId, mataKuliahId: canonicalCourse, status: "active",
          endAt: new Date(Date.now() + 60 * 60_000),
        });
        await tx.insert(diktatMateri).values({
          id: "native-preview-offline-guide", mataKuliahId: canonicalCourse, babId: chapterTwo,
          title: offlineTitle, contentMarkdown: "Materi sintetis untuk verifikasi penyimpanan lokal.",
          version: 1, status: "published", sourceHash: "native-preview", generationHash: "native-preview-v1", creatorId: accountId,
        });
      });
    },
    async revoke(accountId: string) {
      if (!savedResponse) throw new Error("The authenticated download never reached the resource route");
      await db.transaction(async tx => {
        const removed = await tx.update(pendaftaranMurid).set({ status: "cancelled" }).where(and(
          eq(pendaftaranMurid.id, enrollment), eq(pendaftaranMurid.penggunaId, accountId),
          eq(pendaftaranMurid.mataKuliahId, canonicalCourse), eq(pendaftaranMurid.status, "active"),
        )).returning({ id: pendaftaranMurid.id });
        if (removed.length !== 1) throw new Error("Fixture enrollment was unavailable");
        await recordOfflineChange(tx, { kind: "access", action: "delete", userId: accountId, courseId: canonicalCourse });
      });
      withdrawn = true;
    },
    async handle(route: string, request: Request, identity: { accountId: string; sessionId: string }) {
      const endpoint = route === "POST /api/offline/sync" ? sync.POST
        : route === "GET /api/offline/manifest" ? manifest.GET
        : route === "GET /api/offline/resource" ? resource.GET : null;
      if (!endpoint) return null;
      const response = await endpoint(request);
      if (!response.ok && response.status !== 304) return response;
      const headers = new Headers(response.headers);
      // The real server has authenticated the canonical origin. Only remap the
      // verified response envelope for the APK bound to private loopback TLS.
      if (headers.get("x-offline-environment") !== EXPO_STAGING_ORIGIN ||
        headers.get("x-offline-account-id") !== identity.accountId || headers.get("x-offline-session-id") !== identity.sessionId) {
        return new Response(null, { status: 502 });
      }
      headers.set("x-offline-environment", fixtureOrigin);
      if (response.status === 304) return new Response(null, { status: 304, headers });
      const data = await response.json();
      if (!data || data.environment !== EXPO_STAGING_ORIGIN) return new Response(null, { status: 502 });
      if (endpoint === resource.GET && data.resource?.title === offlineTitle) savedResponse = true;
      if (withdrawn && endpoint === sync.POST && Array.isArray(data.changes) &&
        data.changes.some((entry: { kind?: string; action?: string; courseId?: string }) =>
          entry.kind === "access" && entry.action === "delete" && [course, canonicalCourse].includes(entry.courseId ?? ""))) {
        revocationSeen = true;
      }
      headers.delete("content-length");
      return Response.json({ ...data, environment: fixtureOrigin }, { status: response.status, headers });
    },
    sawRevocation: () => revocationSeen,
  };
}
