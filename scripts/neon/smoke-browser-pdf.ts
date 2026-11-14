import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { sourcePdf, sourceJpeg2000Pdf } from "../../tests/helpers/source-pdf";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { inspectBrowserPdf, runBrowserPdf } from "../../lib/compute/browser-pdf";
import { RetryAfterError } from "inngest";

const config = JSON.parse(await readFile("artifacts/neon-worker/.env.staging.json", "utf8"));
assert.equal(config.NEON_STORAGE_BUCKET, "zyx-staging");
assert.equal(config.AUTHORING_VERIFICATION_BROWSER_PROVIDER, "cloudflare");
Object.assign(process.env, config);
async function retryBrowser<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); } catch (error) {
      if (!(error instanceof RetryAfterError) || attempt >= 5) throw error;
      const seconds = Math.min(60, Math.max(1, Number(error.retryAfter) || 30));
      console.log(`Browser rate limited, retry in ${seconds}s`);
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }
  }
}
const inspection = await retryBrowser(() => inspectBrowserPdf(sourcePdf()));
assert.equal(inspection.pageCount, 1);
assert.match(inspection.text, /Hello PDF/);
console.log("PASS browser PDF inspection");
const figure = await retryBrowser(() => runBrowserPdf(sourcePdf(), { mode: "figure", page: 1, crop: [0.05, 0.1, 0.95, 0.9] })) as {
  rotation: number; pdfPointBbox: number[]; variants: Array<{ name: string; width: number; height: number; image: string }>;
};
assert.equal(figure.rotation, 0);
assert.deepEqual(figure.pdfPointBbox, [10, 10, 190, 90]);
assert.equal(figure.variants.length, 2);
for (const [index, variant] of figure.variants.entries()) {
  const png = Buffer.from(variant.image, "base64");
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  assert.equal(png.readUInt32BE(16), variant.width);
  assert.equal(png.readUInt32BE(20), variant.height);
  assert.equal(variant.width, index ? 2304 : 1152);
  assert.equal(variant.height, index ? 1024 : 512);
  await writeFile(`artifacts/neon-worker/figure-${variant.name}.png`, png);
}
console.log("PASS browser PDF figure geometry and PNG variants");
for (const rotation of [90, 180, 270]) {
  const result = await retryBrowser(() => runBrowserPdf(sourcePdf(200, 100, rotation), { mode: "figure", page: 1, crop: [0, 0, 0.5, 1] })) as typeof figure;
  assert.equal(result.rotation, rotation);
  const expected = rotation === 90 ? [0, 0, 200, 50] : rotation === 180 ? [100, 0, 200, 100] : [0, 50, 200, 100];
  assert.deepEqual(result.pdfPointBbox.map(value => Object.is(value, -0) ? 0 : value), expected);
  assert.deepEqual(result.variants.map(variant => variant.width), [640, 1280]);
  for (const variant of result.variants) await writeFile(`artifacts/neon-worker/figure-${rotation}-${variant.name}.png`, Buffer.from(variant.image, "base64"));
  console.log(`PASS browser source figure rotation ${rotation}`);
}

async function assertRedCenter(image: string) {
  // Decode only the returned PNG locally. PDF rendering must use the production browser helper.
  const decoded = await loadImage(Buffer.from(image, "base64"));
  const context = createCanvas(1, 1).getContext("2d");
  context.drawImage(decoded, Math.floor(decoded.width / 2), Math.floor(decoded.height / 2), 1, 1, 0, 0, 1, 1);
  assert.deepEqual([...context.getImageData(0, 0, 1, 1).data], [255, 0, 0, 255], "JPEG2000 image must remain visible");
}
const jpeg2000Figure = await retryBrowser(() => runBrowserPdf(sourceJpeg2000Pdf(), { mode: "figure", page: 1, crop: [0, 0, 1, 1] })) as typeof figure;
assert.equal(jpeg2000Figure.variants.length, 2);
for (const variant of jpeg2000Figure.variants) await assertRedCenter(variant.image);
const jpeg2000Pages = await retryBrowser(() => runBrowserPdf(sourceJpeg2000Pdf(), { mode: "pages", pages: [1], representation: "image", width: 720 })) as { pages: Array<{ image: string }> };
assert.equal(jpeg2000Pages.pages.length, 1);
await assertRedCenter(jpeg2000Pages.pages[0].image);
console.log("PASS browser JPEG2000 source figure and page pixels");
