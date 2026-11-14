import { describe, expect, test } from "bun:test";
import { figureChecksum, figurePixelCrop, normalizedCropSchema, renderSourceFigure, LEGACY_SOURCE_FIGURE_RENDERER } from "@/lib/compute/source-figure";
import { extractSourceFigure, getSourceFigure, getSourceFigureJob, processSourceFigure } from "@/lib/authoring/source-figures";
import type { ValidatedSourcePack } from "@/lib/authoring/source-pack";

function syntheticPdf(rotation: number) {
  const stream = "1 0 0 rg 20 30 100 300 re f\n0 0 0 rg BT /F1 12 Tf 30 300 Td (Scientific figure) Tj ET\n";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /CropBox [20 30 220 330] /Rotate ${rotation} /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}endstream`];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("source figure geometry", () => {
  test("rejects invalid bounds and rounds outward", () => {
    for (const crop of [[0, 0, 0, 1], [-0.1, 0, 1, 1], [0, 0, Infinity, 1]]) expect(normalizedCropSchema.safeParse(crop).success).toBe(false);
    expect(figurePixelCrop([0.101, 0.201, 0.809, 0.909], 100, 100)).toEqual({ left: 10, top: 20, width: 71, height: 71 });
  });
  for (const rotation of [0, 90, 180, 270]) test(`renders real PDF with offset CropBox and rotation ${rotation}`, async () => {
    const result = await renderSourceFigure(syntheticPdf(rotation), 1, [0, 0, 0.5, 1]);
    expect(result.rotation).toBe(rotation);
    expect(result.cropBox).toEqual([20, 30, 220, 330]);
    expect(result.pdfPointBbox.every(Number.isFinite)).toBe(true);
    expect(result.variants.map(v => v.width)).toEqual([640, 1280]);
    expect(result.variants.every(v => v.png.byteLength > 100 && figureChecksum(v.png) === v.checksum)).toBe(true);
    const expected = rotation === 0 ? [20, 30, 120, 330] : rotation === 90 ? [20, 30, 220, 180] : rotation === 180 ? [120, 30, 220, 330] : [20, 180, 220, 330];
    expect(result.pdfPointBbox).toEqual(expected);
  }, 30000);
});

test("scoped job commits only complete checksum-verified variants", async () => {
  const files = new Map<string, Uint8Array>();
  const bytes = syntheticPdf(0), checksum = figureChecksum(bytes);
  const storageKey = "courses/course/materials/source.pdf";
  files.set(storageKey, bytes);
  let queued: unknown, failUpload = false;
  const deps = {
    store: { exists: async (key: string) => files.has(key), download: async (key: string) => { const value = files.get(key); if (!value) throw new Error("MISSING"); return value; },
      upload: async (value: File | Buffer | Uint8Array, _filename: string, _mime: string, options?: { key: string }) => { if (failUpload && options!.key.endsWith("print.png")) throw new Error("UPLOAD_FAILED"); const buffer = value instanceof File ? new Uint8Array(await value.arrayBuffer()) : new Uint8Array(value); files.set(options!.key, buffer); return { key: options!.key, size: buffer.length, url: "" }; } },
    resolve: async (_fileKey: string) => ({ row: { id: "material", courseId: "course", title: "Source", type: "materi" as const, subcategory: null, year: null, fileUrl: storageKey, checksum, chapterIds: ["chapter"], updatedAt: new Date(1) }, token: { kind: "source_file" as const, issuedAt: 0, expiresAt: 9999999999999, materialId: "material", courseId: "course", chapterId: "chapter", legacyCourseId: "course", storageKey, updatedAtMs: 1, checksum } }),
    enqueue: async (request: unknown) => { queued = request; }, render: renderSourceFigure,
    loadPack: async (_importId: string) => ({ courseId: "course", pack: { archive: { checksum, files: new Map([["documents/source.md", new TextEncoder().encode("<!-- source-unit: 1 -->\n:::visual-explanation\nid: figure-1\nsource-unit: 1\n:::\n")]]) }, manifest: { documents: [{ id: "document", originalSha256: checksum, unitKind: "page", expectedUnits: 1, markdownPath: "documents/source.md" }] } } as unknown as ValidatedSourcePack }),
  };
  const input = { fileKey: "signed-file", pageNumber: 1, crop: [0, 0, 0.5, 1] as [number, number, number, number], attribution: "Source owner", permission: "unknown" as const, sourceVisualId: "figure-1", sourcePackChecksum: checksum, sourcePackImportId: "pack-import", sourceDocumentId: "document" };
  const auth = { actorId: "actor", sessionId: "session" };
  const result = await extractSourceFigure(input, auth, deps);
  const ref = { fileKey: input.fileKey, assetId: result.assetId };
  expect(result.status).toBe("pending");
  const stateKey = [...files.keys()].find(key => key.endsWith("request.json"))!.replace("request.json", "state.json");
  files.set(stateKey, new TextEncoder().encode(JSON.stringify({ status: "failed" })));
  expect((await extractSourceFigure(input, auth, deps)).status).toBe("failed");
  expect((await extractSourceFigure({ ...input, retry: true }, auth, deps)).assetId).toBe(result.assetId);
  expect((queued as { attemptId?: string }).attemptId).toBeDefined();
  await expect(getSourceFigureJob(ref, { ...auth, sessionId: "other" }, deps)).rejects.toThrow("NOT_IN_SCOPE");
  await expect(processSourceFigure({ ...queued as object, storageKey: "https://example.com/source.pdf" }, deps)).rejects.toThrow();
  files.set(storageKey, new Uint8Array([1, 2, 3]));
  await expect(processSourceFigure(queued, deps)).rejects.toThrow("SOURCE_CHANGED");
  files.set(storageKey, bytes);
  failUpload = true;
  await expect(processSourceFigure(queued, deps)).rejects.toThrow("UPLOAD_FAILED");
  expect([...files.keys()].some(key => key.endsWith("manifest.json"))).toBe(false);
  failUpload = false;
  await processSourceFigure(queued, deps);
  expect((await getSourceFigureJob(ref, auth, deps)).status).toBe("complete");
  const figure = await getSourceFigure(ref, deps);
  expect(figure.publicationAllowed).toBe(false);
  const manifestKey = [...files.keys()].find(key => key.endsWith("manifest.json"))!;
  const originalManifest = files.get(manifestKey)!;
  for (const change of [{ permission: "licensed" }, { attribution: "Forged" }, { sourceVisualId: "other" }, { sourcePackChecksum: "a".repeat(64) }, { pageNumber: 2 }, { crop: [0, 0, 1, 1] }]) {
    files.set(manifestKey, new TextEncoder().encode(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(originalManifest)), ...change })));
    await expect(getSourceFigure(ref, deps)).rejects.toThrow("MANIFEST_INVALID");
  }
  files.set(manifestKey, originalManifest);
  const requestKey = [...files.keys()].find(key => key.endsWith("request.json"))!;
  const originalRequest = files.get(requestKey)!;
  const { assetId: _id, attemptId: _attempt, ...legacyIdentity } = JSON.parse(new TextDecoder().decode(originalRequest));
  legacyIdentity.renderer = LEGACY_SOURCE_FIGURE_RENDERER;
  const legacyId = figureChecksum(JSON.stringify(legacyIdentity));
  const legacyRequest = { ...legacyIdentity, assetId: legacyId };
  const legacyManifestKey = manifestKey.replace(result.assetId, legacyId);
  const legacyManifest = { ...JSON.parse(new TextDecoder().decode(originalManifest)), renderer: LEGACY_SOURCE_FIGURE_RENDERER, assetId: legacyId,
    variants: figure.variants.map(variant => ({ ...variant, key: variant.key.replace(result.assetId, legacyId) })) };
  for (const [index, variant] of legacyManifest.variants.entries()) files.set(variant.key, files.get(figure.variants[index].key)!);
  files.set(requestKey.replace(result.assetId, legacyId), new TextEncoder().encode(JSON.stringify(legacyRequest)));
  files.set(legacyManifestKey, new TextEncoder().encode(JSON.stringify(legacyManifest)));
  expect((await getSourceFigure({ fileKey: input.fileKey, assetId: legacyId }, deps)).renderer).toBe(LEGACY_SOURCE_FIGURE_RENDERER);
  expect((await processSourceFigure(legacyRequest, deps)).status).toBe("complete");
  files.delete(legacyManifestKey);
  await expect(processSourceFigure(legacyRequest, deps)).rejects.toThrow("RENDERER_CHANGED");
  files.set(requestKey, new TextEncoder().encode(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(originalRequest)), permission: "licensed" })));
  files.set(manifestKey, new TextEncoder().encode(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(originalManifest)), permission: "licensed" })));
  await expect(getSourceFigure(ref, deps)).rejects.toThrow("REQUEST_INVALID");
  files.set(requestKey, originalRequest);
  files.set(manifestKey, originalManifest);
  await expect(extractSourceFigure({ ...input, sourcePackChecksum: "a".repeat(64) }, auth, deps)).rejects.toThrow("SOURCE_PACK_NOT_IN_SCOPE");
  await expect(extractSourceFigure(input, auth, { ...deps, loadPack: async id => ({ ...await deps.loadPack(id), courseId: "other" }) })).rejects.toThrow("SOURCE_PACK_NOT_IN_SCOPE");
  await expect(extractSourceFigure({ ...input, sourceVisualId: "unrelated" }, auth, deps)).rejects.toThrow("SOURCE_VISUAL_MISMATCH");
  await expect(extractSourceFigure({ ...input, sourceDocumentId: "unrelated" }, auth, deps)).rejects.toThrow("SOURCE_DOCUMENT_MISMATCH");
  files.set(figure.variants[0].key, new Uint8Array([1]));
  await expect(getSourceFigure(ref, deps)).rejects.toThrow("CHECKSUM_MISMATCH");
  const foreign = { ...deps, resolve: async (fileKey: string) => { const source = await deps.resolve(fileKey); return { ...source, row: { ...source.row, courseId: "other" } }; } };
  await expect(getSourceFigure(ref, foreign)).rejects.toThrow();
}, 30000);

