import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { eq, sql } from "drizzle-orm";
import { sourcePdf } from "../../tests/helpers/source-pdf";

const config = JSON.parse(await readFile("artifacts/neon-worker/.env.staging.json", "utf8"));
assert.equal(new URL(config.DATABASE_URL).hostname, "ep-sparkling-lab-azrp3ymj-pooler.c-3.ap-southeast-1.aws.neon.tech");
assert.equal(config.NEON_STORAGE_BUCKET, "zyx-staging");
assert.equal(config.INNGEST_ENV, "staging-40f1da25");
Object.assign(process.env, config);
const [{ db, pool }, schema, { storage }, { joinKey, buildCourseThumbnailKey, buildSourceFigureKey, extractStorageKey }, { inngest }] = await Promise.all([
  import("../../lib/db"), import("../../db/schema"), import("../../lib/storage"), import("../../lib/storage/keys"), import("../../jobs/client"),
]);
const id = `neon-worker-${randomUUID()}`;
const key = joinKey("courses", id, "materials", "synthetic.pdf");
const thumbnailKey = buildCourseThumbnailKey({ courseSlug: id, materialId: id, extension: "png" });
const evidence: Array<{ functionId: string; eventId: string; runId: string; status: string }> = [];
const ownedObjects = [key, thumbnailKey];
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const pdf = sourcePdf(), checksum = digest(pdf);
let sourceImportId: string | undefined;
let pending = false;
async function run(functionId: string, name: string, data: Record<string, unknown>) {
  pending = true;
  const sent = await inngest.send({ id: `${id}-${functionId}`, name, data });
  assert.equal(sent.ids.length, 1);
  await writeFile("artifacts/neon-worker/business-pending.json", JSON.stringify({ fixtureId: id, functionId, eventId: sent.ids[0], key, thumbnailKey }));
  for (let attempt = 0; attempt < 80; attempt++) {
    const response = await fetch(`https://api.inngest.com/v2/events/${encodeURIComponent(sent.ids[0])}/runs?include=output`, {
      headers: { Authorization: `Bearer ${config.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": config.INNGEST_ENV }, signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    const execution = result.data?.find((item: { function?: { id: string } }) => item.function?.id === functionId);
    if (execution && ["COMPLETED", "FAILED", "CANCELLED"].includes(execution.status.toUpperCase())) {
      pending = false;
      evidence.push({ functionId, eventId: sent.ids[0], runId: execution.id, status: execution.status });
      await writeFile("artifacts/neon-worker/business-smoke.json", JSON.stringify(evidence, null, 2));
      assert.equal(execution.status.toUpperCase(), "COMPLETED");
      console.log(JSON.stringify(evidence.at(-1)));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error(`WORKER_SMOKE_PENDING:${functionId}`);
}
try {
  const target = await db.execute(sql`select current_database() as name`);
  assert.equal(target.rows[0].name, new URL(config.DATABASE_URL).pathname.slice(1));
  await db.transaction(async tx => {
    await tx.insert(schema.user).values({ id, name: "Neon worker fixture", email: `${id}@example.invalid` });
    await tx.insert(schema.pengguna).values({ id, status: "active" });
    await tx.insert(schema.courses).values({ id, title: "Neon worker fixture", category: "Test" });
    await tx.insert(schema.chapters).values({ id, courseId: id, title: "Penjumlahan", orderIndex: 1 });
    await tx.insert(schema.masterTeachingDocuments).values({ id, courseId: id, title: "Penjumlahan", markdownContent: "Penjumlahan menggabungkan nilai dua bilangan. Jika a=2 dan b=3, jumlahnya adalah 5.", createdById: id, status: "active" });
    await tx.insert(schema.concepts).values({ id, canonicalSlug: id });
    await tx.insert(schema.knowledgeObjects).values([
      { id: `${id}-definition`, courseId: id, mtdId: id, chapterId: id, conceptId: id, learningOrder: 1, title: "Definisi penjumlahan", conceptName: "Penjumlahan", type: "definition", bloomLevel: "understand", status: "active",
        content: "Penjumlahan adalah operasi yang menggabungkan nilai dua bilangan menjadi sebuah jumlah. Simbol a dan b menyatakan bilangan yang dijumlahkan, sedangkan s menyatakan hasilnya. Operasi ini digunakan untuk menghitung total dua kelompok dengan satuan yang sama." },
      { id: `${id}-formula`, courseId: id, mtdId: id, chapterId: id, conceptId: id, learningOrder: 2, title: "Rumus penjumlahan", conceptName: "Penjumlahan", type: "formula", bloomLevel: "apply", status: "active", content: "$$s=a+b$$\nJumlah s diperoleh dengan menambahkan bilangan a dan b.",
        metadata: { latex: "s=a+b", parameters: [{ symbol: "s", name: "Jumlah", unit: "1" }, { symbol: "a", name: "Bilangan pertama", unit: "1" }, { symbol: "b", name: "Bilangan kedua", unit: "1" }], assumptions: ["Bilangan memiliki satuan yang sama."], whenToUse: ["Menghitung total dua bilangan."] } },
      { id: `${id}-example`, courseId: id, mtdId: id, chapterId: id, conceptId: id, learningOrder: 3, title: "Contoh penjumlahan", conceptName: "Penjumlahan", type: "example", bloomLevel: "apply", status: "active", content: "Diketahui a=2 dan b=3. Gunakan s=a+b, sehingga s=2+3=5. Jadi jumlah kedua bilangan adalah 5. Hasil memiliki satuan yang sama dengan bilangan awal." },
    ]);
    await tx.insert(schema.courseMaterials).values({ id, courseId: id, title: "Synthetic PDF", type: "materi", fileUrl: key, checksum, chapterIds: [] });
    await tx.insert(schema.quizTemplates).values({ id, courseId: id, title: "Neon worker fixture", category: "chapter", selectionRules: {} });
    await tx.insert(schema.studentQuizAttempts).values({ id, studentId: id, templateId: id, status: "completed", score: 100,
      questionsSnapshot: [{ id: "synthetic-question", correct_indices: [0] }], answersSnapshot: { "synthetic-question": [0] }, submittedAt: new Date() });
  });
  await storage.upload(pdf, "synthetic.pdf", "application/pdf", { key });
  await run("pdf-thumbnail-worker", "pdf/thumbnail.requested", { materialId: id, sourceType: "course_material", sourceVersion: key });
  const [material] = await db.select().from(schema.courseMaterials).where(eq(schema.courseMaterials.id, id));
  assert.equal(material.thumbnailUrl, thumbnailKey);
  const png = Buffer.from(await storage.download!(thumbnailKey));
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  assert.equal(png.readUInt32BE(16), 720);
  await run("quiz-feedback-worker", "quiz/feedback.requested", { attemptId: id });
  assert.equal((await db.select().from(schema.attemptFeedback).where(eq(schema.attemptFeedback.attemptId, id))).length, 0);
  const [{ validateSourcePack }, { stageSourcePack }, { sourceFigureManifestSchema }, { SOURCE_FIGURE_RENDERER }] = await Promise.all([
    import("../../lib/authoring/source-pack"), import("../../lib/bundle/source-staging"),
    import("../../lib/authoring/source-figures"), import("../../lib/compute/source-figure"),
  ]);
  const markdown = strToU8("<!-- source-unit: 1 -->\n# Synthetic PDF\nHello PDF\n:::visual-explanation\nid: figure-1\nsource-unit: 1\nThe page contains the words Hello PDF.\n:::\n");
  const counts = { headings: 1, formulas: 0, tables: 0, examples: 0, applications: 0, questions: 0, solutions: 0 };
  const coverage = { documentId: "doc-1", status: "complete", expectedUnits: 1, processedUnits: [1], inventory: { ...counts, visuals: 1 },
    outputCounts: { ...counts, visualExplanations: 1 }, unresolved: [], reviewPasses: ["inventory", "transcription", "visual", "reconciliation"] };
  const manifest = { schemaVersion: "zyx-source-pack.v1", packId: id, name: "Synthetic worker fixture", language: "en", createdAt: new Date().toISOString(),
    generator: { provider: "openai", model: "synthetic-fixture", promptVersion: "neon-worker-smoke.v1" }, documents: [{ id: "doc-1", title: "Synthetic PDF", originalFilename: "synthetic.pdf",
      originalMediaType: "application/pdf", originalSha256: checksum, role: "material", unitKind: "page", expectedUnits: 1,
      markdownPath: "documents/source.md", coveragePath: "coverage/doc-1.json", markdownSha256: digest(markdown) }] };
  const bytes = zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)), "documents/source.md": markdown, "coverage/doc-1.json": strToU8(JSON.stringify(coverage)) });
  const staged = await stageSourcePack({ bytes, sourcePack: validateSourcePack(bytes), requestedBy: id, courseId: id });
  sourceImportId = staged.importId;
  ownedObjects.push(staged.sourceKey);
  const identity = { pageNumber: 1, crop: [0.05, 0.1, 0.95, 0.9], attribution: "Synthetic worker fixture", permission: "owned", sourceVisualId: "figure-1",
    sourcePackChecksum: staged.checksum, sourcePackImportId: staged.importId, sourceDocumentId: "doc-1", actorId: id, sessionId: id,
    courseId: id, materialId: id, storageKey: key, sourceVersion: material.updatedAt.getTime(), sourceChecksum: checksum, renderer: SOURCE_FIGURE_RENDERER };
  const assetId = digest(JSON.stringify(identity));
  for (const leaf of ["request.json", "state.json", "manifest.json", "preview.png", "print.png"] as const) ownedObjects.push(buildSourceFigureKey({ courseId: id, materialId: id, assetId, leaf }));
  await run("source-figure-extraction", "source.figure.requested", { ...identity, assetId });
  const figure = sourceFigureManifestSchema.parse(JSON.parse(Buffer.from(await storage.download!(buildSourceFigureKey({ courseId: id, materialId: id, assetId, leaf: "manifest.json" }))).toString("utf8")));
  assert.equal(figure.sourceChecksum, checksum);
  assert.deepEqual(figure.variants.map(variant => variant.width), [1152, 2304]);
  for (const variant of figure.variants) assert.equal(digest(await storage.download!(variant.key)), variant.checksum);
  const { generateDiktatStructure } = await import("../../lib/diktat-generator");
  const structure = await generateDiktatStructure(id, [id]);
  const diktatId = `${id}-diktat`;
  await db.insert(schema.diktats).values({ id: diktatId, courseId: id, sourceMtdId: id, sourceMtdVersion: 1, generationHash: structure.generationHash,
    title: structure.title, chapterIds: [id], settings: { compiledStructure: structure }, status: "generating" });
  await run("diktat-pdf-worker", "diktat/pdf.generate.requested", { diktatId });
  const [diktat] = await db.select().from(schema.diktats).where(eq(schema.diktats.id, diktatId));
  assert.equal(diktat.status, "ready");
  assert.ok(diktat.fileUrl);
  const pdfKey = extractStorageKey(diktat.fileUrl);
  assert.ok(pdfKey?.startsWith(`courses/${id}/`));
  ownedObjects.push(pdfKey);
  assert.equal(Buffer.from(await storage.download!(pdfKey)).subarray(0, 5).toString(), "%PDF-");
  pending = true;
  for (let attempt = 0; attempt < 60; attempt++) {
    const [current] = await db.select().from(schema.diktats).where(eq(schema.diktats.id, diktatId));
    if (current.thumbnailUrl) {
      assert.equal(current.thumbnailUrl, buildCourseThumbnailKey({ courseSlug: id, materialId: diktatId, extension: "png" }));
      ownedObjects.push(current.thumbnailUrl);
      pending = false;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  assert.equal(pending, false, "Diktat thumbnail follow-up still pending; retain fixtures");
} finally {
  if (!pending) {
    for (const object of ownedObjects) await storage.delete(object);
    await db.transaction(async tx => {
      await tx.delete(schema.auditMutasi).where(eq(schema.auditMutasi.actorId, id));
      if (sourceImportId) {
        await tx.delete(schema.itemImporBundle).where(eq(schema.itemImporBundle.imporBundleId, sourceImportId));
        await tx.delete(schema.imporBundle).where(eq(schema.imporBundle.id, sourceImportId));
      }
      await tx.delete(schema.studentQuizAttempts).where(eq(schema.studentQuizAttempts.id, id));
      await tx.delete(schema.quizTemplates).where(eq(schema.quizTemplates.id, id));
      await tx.delete(schema.courseMaterials).where(eq(schema.courseMaterials.id, id));
      await tx.delete(schema.diktats).where(eq(schema.diktats.courseId, id));
      await tx.delete(schema.knowledgeObjects).where(eq(schema.knowledgeObjects.courseId, id));
      await tx.delete(schema.masterTeachingDocuments).where(eq(schema.masterTeachingDocuments.id, id));
      await tx.delete(schema.chapters).where(eq(schema.chapters.id, id));
      await tx.delete(schema.concepts).where(eq(schema.concepts.id, id));
      await tx.delete(schema.courses).where(eq(schema.courses.id, id));
      await tx.delete(schema.pengguna).where(eq(schema.pengguna.id, id));
      await tx.delete(schema.user).where(eq(schema.user.id, id));
    });
    console.log("Owned fixture cleanup complete");
  }
  await pool.end();
}
