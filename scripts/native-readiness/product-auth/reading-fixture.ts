import { and, eq } from "drizzle-orm";
import { studentNavigationEndpoint } from "@/components/navigation/student/student-nav-model";
import { EXPO_STAGING_ORIGIN } from "@/lib/native/expo-auth-config";
import { assertFixtureRunner } from "./scope";

export const readingCourseId = "native-preview-reading-course";
const courseId = readingCourseId;
const canonicalCourse = "native-preview-reading-canonical";
const enrollmentId = "native-preview-reading-enrollment";
export const articleId = "native-preview-reading-article";
export const articleSectionId = articleId + "-section";
export const formativeBlockId = articleId + "-check";
export const pdfId = "native-preview-reading-pdf";
const pdfUrl = "https://native-reading-fixture.ufs.sh/lesson.pdf";
export const pkaCourseId = "tutorial-pka";
export const pkaDiktatId = "native-preview-reading-pka-diktat";
const registrationId = "native-preview-reading-pka-registration";
export const imagePath = "/images/native-reading-preview.png";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAjUlEQVR4nO3SsQ2AMAxE0czDDEzE9BSUFCClSUFEHMf2WTrpuqT4T3I5r/tz2368673irBBAAAEEuK+21aUBtNFpAL1oaMBIdPsfAiCNhgBoosMAq6JdARbR5gDraBOAZ/QyQFS0CoAQLQagRQsAmNEqQHjxDCC8ch4Q3vcPGLl15OUHpD8hAggggIDQPZYaL03x06UcAAAAAElFTkSuQmCC", "base64");

function previewPdf() {
  const pageText = (page: number) => `BT /F1 24 Tf 40 150 Td (Zyx private preview, page ${page}) Tj ET`;
  const content = (page: number) => {
    const text = pageText(page);
    return `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  };
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R /Annots [8 0 R] >>",
    content(1), content(2),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Annot /Subtype /Link /Rect [40 145 350 180] /A << /S /URI /URI (https://example.invalid/lesson) >> >>",
  ];
  let text = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = text.length;
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return String(offset).padStart(10, "0") + " 00000 n \n";
  });
  const xref = text.length;
  return Buffer.from(text + `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n` + offsets.join("") +
    `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

type Identity = { accountId: string; sessionId: string; cookie: string };

export async function createReadingPreview(runHandler: (request: Request, handler: (request: Request) => Promise<Response>) => Promise<Response>) {
  assertFixtureRunner();
  const [{ db }, schema, courses, learning, reading, pdf, { auth }, navigation, study] = await Promise.all([
    import("@/db"), import("@/db/schema"), import("@/app/api/native/student/courses/route"),
    import("@/app/api/native/student/learning/route"), import("@/app/api/native/student/reading/route"),
    import("@/app/api/native/student/material-pdf/route"), import("@/lib/auth"), import("@/app/api/student/navigation/route"),
    import("@/app/api/native/student/reading/learning/route"),
  ]);
  let seeded: Promise<void> | undefined;
  let articleRevision: string | undefined;
  let pkaReading = false;
  let privateImage = false;
  let privatePdf = false;
  const expectedPdf = previewPdf();
  let deniedNormal = false;
  let deniedPka = false;
  let revoked = false;
  let withdrawalStage = "not started";
  let owner: Identity | undefined;
  const previousFetch = globalThis.fetch;
  const privatePreviewUrl = EXPO_STAGING_ORIGIN + imagePath;
  const fixtureFetch: typeof fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input) === pdfUrl) {
      if (new Headers(init?.headers).has("cookie") || init?.redirect !== "error") return new Response(null, { status: 403 });
      return new Response(expectedPdf, { headers: { "Content-Type": "application/pdf" } });
    }
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
        { id: chapter + "-free", mataKuliahId: canonicalCourse, code: "PREVIEW", title: "Pengantar gratis", orderIndex: 1 },
        { id: chapter, mataKuliahId: canonicalCourse, code: "INTRO", title: "Pembahasan", orderIndex: 2 },
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
      const id = articleSectionId;
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
      const prompt = "Apa yang diukur dalam satuan persegi?";
      const check = Buffer.from(JSON.stringify({
        parts: [{ id: "area-prompt", kind: "markdown", markdown: prompt }],
        formativeCheckPayload: { checkKind: "multiple_choice", answer: "Luas", explanation: "Luas berdimensi panjang kuadrat.",
          options: [{ id: "area", text: "Luas", isCorrect: true }, { id: "length", text: "Panjang", isCorrect: false }],
          evaluation: { mode: "choice" } },
      })).toString("base64url");
      await tx.insert(schema.blokArtikel).values({
        id: formativeBlockId, artikelId: articleId, bagianArtikelId: id, blockKey: "check", blockType: "retrieval_close", orderIndex: 2,
        content: `${prompt}\n<!--__ZYX_V4_BLOCK_PAYLOAD__:${check}-->`,
        version: 3, generationHash: details.generationHash, status: "published",
      });
      await tx.insert(schema.courseMaterials).values({
        id: pdfId, courseId, title: "PDF verifikasi kelas", type: "materi", fileUrl: pdfUrl, chapterIds: [chapter],
      });
      await tx.insert(schema.diktatMateri).values({
        ...details, id: pkaDiktatId, mataKuliahId: pkaCanonical, babId: pkaChapter, title: "Diktat verifikasi PKA",
        contentMarkdown: "Isi diktat PKA versi tiga.\n\n$$x^2+2x+1$$",
      });
    });
  }

  async function handle(request: Request, identity: Identity) {
    const url = new URL(request.url);
    const studyPath = url.pathname === "/api/native/student/reading/learning";
    const course = url.searchParams.get("courseId");
    const material = url.searchParams.get("materialId");
    const view = url.searchParams.get("view");
    const ordinary = course === courseId && material === articleId;
    const manualPdf = course === courseId && material === pdfId;
    const pdfRead = url.pathname === "/api/native/student/material-pdf" && manualPdf;
    const pka = course === pkaCourseId && material === pkaDiktatId;
    const pkaGate = url.pathname === "/api/native/student/learning" && view === "pka-material";
    const detail = url.pathname === "/api/native/student/courses" && view === "material-detail" && (ordinary || pka || manualPdf);
    const read = url.pathname === "/api/native/student/reading" && (ordinary || pka);
    const courseNavigation = request.method === "GET" && url.pathname === studentNavigationEndpoint && course === courseId;
    if (!read && !detail && !pkaGate && !pdfRead && !courseNavigation && !studyPath) return null;
    owner = identity;
    seeded ??= seed(identity.accountId);
    await seeded;
    if (studyPath) return request.method === "POST" ? study.POST(request) : study.GET(request);
    if (courseNavigation) return navigation.GET(request);
    if (pkaGate) return learning.GET(request);
    if (pdfRead) {
      const response = await (request.method === "HEAD" ? pdf.HEAD(request) : pdf.GET(request));
      if (response.ok && request.method === "GET") privatePdf = Buffer.from(await response.clone().arrayBuffer()).equals(expectedPdf);
      return response;
    }
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
    progress: () => `Article ${articleRevision ? "verified" : "missing"}, image ${privateImage ? "verified" : "missing"}, PKA Diktat ${pkaReading ? "verified" : "missing"}, PDF ${privatePdf ? "verified" : "missing"}, withdrawal ${withdrawalStage}`,
    async revoke() {
      withdrawalStage = "prerequisites";
      if (!owner || !articleRevision || !pkaReading || !privateImage || !privatePdf) throw new Error("The Student device did not receive each authorized reading");
      const accountId = owner.accountId;
      withdrawalStage = "enrollment transaction";
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
        runHandler(request(courseId, articleId), reading.GET),
        runHandler(request(courseId, articleId, { asset: imagePath, revision: articleRevision }), reading.GET),
      ]);
      withdrawalStage = `Article HTTP ${body.status}, image HTTP ${image.status}`;
      if (body.status !== 403 || image.status !== 403) throw new Error("Reading authorization survived withdrawal");
      const manual = new Request(EXPO_STAGING_ORIGIN + "/api/native/student/material-pdf?" + new URLSearchParams({ courseId, materialId: pdfId }), { headers });
      const manualStatus = (await runHandler(manual, pdf.GET)).status;
      withdrawalStage = `PDF HTTP ${manualStatus}`;
      if (manualStatus !== 403) throw new Error("Manual PDF authorization survived withdrawal");
      const pkaStatus = (await runHandler(request(pkaCourseId, pkaDiktatId), reading.GET)).status;
      withdrawalStage = `PKA HTTP ${pkaStatus}`;
      deniedPka = pkaStatus === 403;
    },
    verified: () => Boolean(articleRevision) && pkaReading && privateImage && privatePdf && deniedNormal && deniedPka,
    stop() { if (globalThis.fetch === fixtureFetch) globalThis.fetch = previousFetch; },
  };
}
