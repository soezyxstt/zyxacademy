import { and, eq } from "drizzle-orm";
import { EXPO_STAGING_ORIGIN } from "@/lib/native/expo-auth-config";
import { assertFixtureRunner } from "./scope";

const courseId = "native-preview-reading-course";
const canonicalCourse = "native-preview-reading-canonical";
const enrollmentId = "native-preview-reading-enrollment";
const articleId = "native-preview-reading-article";
const pkaCourseId = "tutorial-pka";
const pkaDiktatId = "native-preview-reading-pka-diktat";
const registrationId = "native-preview-reading-pka-registration";
const imagePath = "/images/native-reading-preview.png";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAjUlEQVR4nO3SsQ2AMAxE0czDDEzE9BSUFCClSUFEHMf2WTrpuqT4T3I5r/tz2368673irBBAAAEEuK+21aUBtNFpAL1oaMBIdPsfAiCNhgBoosMAq6JdARbR5gDraBOAZ/QyQFS0CoAQLQagRQsAmNEqQHjxDCC8ch4Q3vcPGLl15OUHpD8hAggggIDQPZYaL03x06UcAAAAAElFTkSuQmCC", "base64");

type Identity = { accountId: string; sessionId: string; cookie: string };

export async function createReadingPreview() {
  assertFixtureRunner();
  const [{ db }, schema, courses, learning, reading, { auth }] = await Promise.all([
    import("@/db"), import("@/db/schema"), import("@/app/api/native/student/courses/route"),
    import("@/app/api/native/student/learning/route"), import("@/app/api/native/student/reading/route"), import("@/lib/auth"),
  ]);
  let seeded: Promise<void> | undefined;
  let articleRevision: string | undefined;
  let pkaReading = false;
  let privateImage = false;
  let deniedNormal = false;
  let deniedPka = false;
  let revoked = false;
  let owner: Identity | undefined;
  const previousFetch = globalThis.fetch;
  const privatePreviewUrl = EXPO_STAGING_ORIGIN + imagePath;
  const fixtureFetch: typeof fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input) !== privatePreviewUrl) return previousFetch(input, init);
    const browserSession = await auth.api.getSession({
      headers: new Headers(init?.headers), query: { disableCookieCache: true, disableRefresh: true },
    });
    if (!owner || !browserSession || browserSession.user.id !== owner.accountId || browserSession.session.id !== owner.sessionId) {
      return new Response(null, { status: 403 });
    }
    return new Response(png, { headers: { "Content-Type": "image/png" } });
  }, { preconnect: previousFetch.preconnect });
  globalThis.fetch = fixtureFetch;

  async function seed(accountId: string) {
    await db.transaction(async tx => {
      const expiration = new Date(Date.now() + 60 * 60_000);
      await tx.insert(schema.courses).values([
        { id: courseId, title: "Kelas bacaan terverifikasi", category: "Matematika" },
        { id: pkaCourseId, title: "Tutorial PKA", category: "Matematika" },
      ]).onConflictDoNothing();
      const [existingPka] = await tx.select({ id: schema.mataKuliah.id }).from(schema.mataKuliah)
        .where(eq(schema.mataKuliah.legacyCourseId, pkaCourseId)).limit(1);
      const pkaCanonical = existingPka?.id ?? "native-preview-reading-pka-canonical";
      await tx.insert(schema.mataKuliah).values({ id: canonicalCourse, code: "PREVIEW-READING", title: "Kelas bacaan terverifikasi", legacyCourseId: courseId });
      if (!existingPka) {
        await tx.insert(schema.mataKuliah).values({
          id: pkaCanonical, code: "PREVIEW-READING-PKA", title: "Tutorial PKA", legacyCourseId: pkaCourseId,
        });
      }
      const chapter = "native-preview-reading-chapter";
      const pkaChapter = "native-preview-reading-pka-chapter";
      await tx.insert(schema.bab).values([
        { id: chapter, mataKuliahId: canonicalCourse, code: "INTRO", title: "Pembahasan", orderIndex: 1 },
        { id: pkaChapter, mataKuliahId: pkaCanonical, code: "READER-PKA", title: "Pembahasan PKA", orderIndex: 20 },
      ]);
      await tx.insert(schema.pendaftaranMurid).values([
        { id: enrollmentId, penggunaId: accountId, mataKuliahId: canonicalCourse, status: "active", endAt: expiration },
        { id: enrollmentId + "-pka", penggunaId: accountId, mataKuliahId: pkaCanonical, status: "active", endAt: expiration },
      ]);
      await tx.insert(schema.enrollments).values({ id: registrationId, userId: accountId, courseId: pkaCourseId, expiresAt: expiration });
      const details = { status: "published" as const, creatorId: accountId, sourceHash: "preview-source", generationHash: "preview-v3", version: 3 };
      await tx.insert(schema.artikel).values({
        ...details, id: articleId, slug: articleId, mataKuliahId: canonicalCourse, babId: chapter, title: "Artikel verifikasi kanonis",
        contentMarkdown: "Isi terstruktur berada di bagian bacaan.", structureStatus: "structured",
      });
      const id = articleId + "-section";
      await tx.insert(schema.bagianArtikel).values({
        id, artikelId: articleId, sectionKey: "intro", sectionKind: "topic", slug: "pembahasan", title: "Pembahasan utama",
        learningObjective: "Memahami hubungan luas dan panjang.", orderIndex: 1, estimatedReadingMinutes: 1, version: 3,
      });
      const markdown = `Isi artikel kanonis versi tiga.\n\nRumus luas $x^2$.\n\n![Diagram bacaan terverifikasi](${imagePath})`;
      const authored = Buffer.from(JSON.stringify({ parts: [{ id: "intro", kind: "markdown", markdown }] })).toString("base64url");
      await tx.insert(schema.blokArtikel).values({
        id: articleId + "-body", artikelId: articleId, bagianArtikelId: id, blockKey: "body", blockType: "explanation", orderIndex: 1,
        content: `${markdown}\n<!--__ZYX_V4_BLOCK_PAYLOAD__:${authored}-->`, version: 3, generationHash: details.generationHash, status: "published",
      });
      await tx.insert(schema.diktatMateri).values({
        ...details, id: pkaDiktatId, mataKuliahId: pkaCanonical, babId: pkaChapter, title: "Diktat verifikasi PKA",
        contentMarkdown: "Isi diktat PKA versi tiga.\n\n$$x^2+2x+1$$",
      });
    });
  }

  async function handle(request: Request, identity: Identity) {
    const url = new URL(request.url);
    const course = url.searchParams.get("courseId");
    const material = url.searchParams.get("materialId");
    const view = url.searchParams.get("view");
    const ordinary = course === courseId && material === articleId;
    const pka = course === pkaCourseId && material === pkaDiktatId;
    const pkaGate = url.pathname === "/api/native/student/learning" && view === "pka-material";
    const detail = url.pathname === "/api/native/student/courses" && view === "material-detail" && (ordinary || pka);
    const read = url.pathname === "/api/native/student/reading" && (ordinary || pka);
    if (!read && !detail && !pkaGate) return null;
    owner = identity;
    seeded ??= seed(identity.accountId);
    await seeded;
    if (pkaGate) return learning.GET(request);
    if (detail) {
      const response = await courses.GET(request);
      if (revoked && ordinary && (response.status === 403 ||
        response.ok && (await response.clone().json()).material?.locked === true)) deniedNormal = true;
      return response;
    }
    const response = await reading.GET(request);
    if (response.ok && url.searchParams.has("asset")) {
      const current = new Uint8Array(await response.clone().arrayBuffer());
      privateImage = privateImage || current.length === png.byteLength && Buffer.from(current).equals(png);
    } else if (response.ok) {
      const snapshot = await response.clone().json();
      if (ordinary && snapshot.kind === "article" && snapshot.data?.version === 3 && snapshot.assets.includes(imagePath)) {
        articleRevision = snapshot.revision;
      }
      if (pka) pkaReading = snapshot.kind === "diktat" && snapshot.data?.contentVersion === 3;
    }
    return response;
  }

  return {
    handle,
    async revoke() {
      if (!owner || !articleRevision || !pkaReading || !privateImage) throw new Error("The Student device did not receive both published readings and the image");
      const accountId = owner.accountId;
      await db.transaction(async tx => {
        const [withdrawn] = await tx.update(schema.pendaftaranMurid).set({ status: "cancelled" }).where(and(
          eq(schema.pendaftaranMurid.id, enrollmentId), eq(schema.pendaftaranMurid.penggunaId, accountId),
        )).returning({ id: schema.pendaftaranMurid.id });
        const [registration] = await tx.delete(schema.enrollments).where(and(
          eq(schema.enrollments.id, registrationId), eq(schema.enrollments.userId, accountId),
        )).returning({ id: schema.enrollments.id });
        if (!withdrawn || !registration) throw new Error("Missing runner-only reading grants");
      });
      revoked = true;
      const headers = { Cookie: owner.cookie.split(";", 1)[0], "x-student-id": owner.accountId };
      const request = (courseId: string, materialId: string, asset?: { asset: string; revision: string }) =>
        new Request(EXPO_STAGING_ORIGIN + "/api/native/student/reading?" + new URLSearchParams({ courseId, materialId, ...asset }), { headers });
      const [body, image] = await Promise.all([
        reading.GET(request(courseId, articleId)),
        reading.GET(request(courseId, articleId, { asset: imagePath, revision: articleRevision })),
      ]);
      if (body.status !== 403 || image.status !== 403) throw new Error("Reading authorization survived withdrawal");
      deniedPka = (await reading.GET(request(pkaCourseId, pkaDiktatId))).status === 403;
    },
    verified: () => Boolean(articleRevision) && pkaReading && privateImage && deniedNormal && deniedPka,
    stop() { if (globalThis.fetch === fixtureFetch) globalThis.fetch = previousFetch; },
  };
}
