import { describe, expect, test } from "bun:test";
import { buildPublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { hydrateSourceFiguresForReader, sourceFigureImagePath } from "@/lib/articles/source-figure-resolver";
import { sourceFigureVisualSpecSchema } from "@/lib/materials/visual-contract";

const figure = sourceFigureVisualSpecSchema.parse({ id: "figure", kind: "source_figure", label: "Diagram", description: "Panjang $r=2$.", assetId: "a".repeat(64), materialId: "material", sourceChecksum: "b".repeat(64), staticFallback: { type: "text", summary: "Lingkaran berjari-jari $2$.", content: "Luas $4\\pi$." } });
const article = () => buildPublicArticleReadModel({ id: "article", courseId: "course", slug: "article", title: "Geometri", version: 4, visuals: [figure] }, [{ id: "section", title: "Bangun", slug: "bangun", status: "published" }], [{ id: "block", bagianArtikelId: "section", status: "published", blockType: "explanation", content: "Bangun.", visualIds: [figure.id] }], [], { id: "chapter", title: "Bangun", number: 1 });
const manifest = { sourceChecksum: figure.sourceChecksum, publicationAllowed: true, attribution: "Sumber berizin", variants: [{ name: "preview" as const, width: 640, height: 480 }] };

describe("scoped source figure reader resolution", () => {
 test("pure read model strips source identity and does not accept authored delivery URLs", () => {
  const output = article();
  const visual = output.sections[0].blocks[0].visuals?.[0];
  expect(visual?.kind).toBe("source_figure");
  expect(JSON.stringify(visual)).not.toContain(figure.sourceChecksum);
  expect(JSON.stringify(visual)).not.toContain('"materialId"');
  expect(sourceFigureVisualSpecSchema.safeParse({ ...figure, asset: { imageUrl: "https://example.com/a.png" } }).success).toBe(false);
  expect(sourceFigureVisualSpecSchema.safeParse({ ...figure, captionMarkdown: "![x](https://example.com/a.png)" }).success).toBe(false);
 });
 test("authorizes before resolving any storage and never fetches for anonymous or denied readers", async () => {
  let resolves = 0;
  let authorizations = 0;
  const deps = { authorize: async () => { authorizations++; return false; }, resolve: async () => { resolves++; return manifest; } };
  await hydrateSourceFiguresForReader(article(), [figure], { courseId: "course", legacyCourseId: "legacy" }, deps);
  expect(authorizations).toBe(0);
  await hydrateSourceFiguresForReader(article(), [figure], { courseId: "course", legacyCourseId: "legacy", userId: "reader" }, deps);
  expect(authorizations).toBe(1);
  expect(resolves).toBe(0);
 });
 test("uses only verified scoped manifests, redacts delivery secrets, and hydrates block visuals", async () => {
  const calls: unknown[] = [];
  const result = await hydrateSourceFiguresForReader(article(), [figure], { courseId: "course", legacyCourseId: "legacy", userId: "reader" }, { authorize: async (...args) => { calls.push(args); return true; }, resolve: async (input) => { calls.push(input); return { ...manifest, deliveryUrl: "secret" }; } });
  expect(calls).toEqual([["course", "reader", ["chapter"]], { courseId: "legacy", materialId: "material", assetId: figure.assetId }]);
  const visual = result.sections[0].blocks[0].visuals?.[0];
  if (visual?.kind !== "source_figure") throw Error("figure missing");
  expect(visual.asset?.imageUrl).toBe(sourceFigureImagePath("course", "article", "figure"));
  expect(visual.asset?.attribution).toBe("Sumber berizin");
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(JSON.stringify(result)).not.toContain(figure.sourceChecksum);
 });
 test("stale checksum, unknown rights, missing variant and storage failure keep accessible fallback", async () => {
  for (const resolve of [async () => ({ ...manifest, sourceChecksum: "c".repeat(64) }), async () => ({ ...manifest, publicationAllowed: false }), async () => ({ ...manifest, variants: [] }), async () => { throw Error("missing object"); }]) {
    const result = await hydrateSourceFiguresForReader(article(), [figure], { courseId: "course", legacyCourseId: "legacy", userId: "reader" }, { authorize: async () => true, resolve });
    const visual = result.sections[0].blocks[0].visuals?.[0];
    expect(visual?.kind === "source_figure" && visual.asset).toBeUndefined();
    expect(visual?.kind === "source_figure" && visual.staticFallback.summary).toContain("Lingkaran");
  }
 });
});
