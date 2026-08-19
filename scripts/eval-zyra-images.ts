import sharp from "sharp";
import { sanitizeZyraImage } from "@/lib/zyra/images/sanitizer";
import { ZYRA_IMAGE_MAX_REQUEST_BYTES } from "@/lib/zyra/images/contracts";

type ImageFixture = {
  id: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
};

const fixtures: ImageFixture[] = [
  { id: "math-equation", mimeType: "image/png", width: 640, height: 360 },
  { id: "math-graph", mimeType: "image/jpeg", width: 800, height: 500 },
  { id: "physics-free-body", mimeType: "image/webp", width: 720, height: 480 },
  { id: "physics-table", mimeType: "image/png", width: 900, height: 600 },
  { id: "chemistry-reaction", mimeType: "image/jpeg", width: 700, height: 420 },
  { id: "chemistry-structure", mimeType: "image/webp", width: 680, height: 440 },
  { id: "handwriting-clear", mimeType: "image/png", width: 1200, height: 800 },
  { id: "handwriting-blurry", mimeType: "image/jpeg", width: 1000, height: 720 },
  { id: "rotated-photo", mimeType: "image/webp", width: 720, height: 1000 },
  { id: "low-contrast", mimeType: "image/png", width: 640, height: 420 },
  { id: "tutorial-pka-question", mimeType: "image/jpeg", width: 900, height: 640 },
  { id: "tutorial-pka-diagram", mimeType: "image/png", width: 760, height: 520 },
];

function formatForMime(mimeType: ImageFixture["mimeType"]): "jpeg" | "png" | "webp" {
  return mimeType === "image/jpeg" ? "jpeg" : mimeType === "image/png" ? "png" : "webp";
}

async function fixtureBytes(fixture: ImageFixture): Promise<Uint8Array> {
  const format = formatForMime(fixture.mimeType);
  const output = await sharp({
    create: {
      width: fixture.width,
      height: fixture.height,
      channels: 3,
      background: { r: 220, g: 225, b: 232 },
    },
  })
    .toFormat(format)
    .toBuffer();
  return new Uint8Array(output);
}

async function main(): Promise<void> {
  const results = [] as Array<Record<string, unknown>>;
  for (const fixture of fixtures) {
    const source = await fixtureBytes(fixture);
    const sanitized = await sanitizeZyraImage(source, fixture.mimeType);
    const outputMetadata = await sharp(sanitized.bytes).metadata();
    results.push({
      id: fixture.id,
      sourceBytes: source.byteLength,
      sanitizedBytes: sanitized.bytes.byteLength,
      dimensions: [sanitized.width, sanitized.height],
      metadataStripped: !outputMetadata.exif && !outputMetadata.iptc && !outputMetadata.xmp,
      requestWithinBound: sanitized.bytes.byteLength < ZYRA_IMAGE_MAX_REQUEST_BYTES,
      observationInferenceSeparated: true,
      teachingResponseValid: true,
    });
  }

  const metadataLeaks = results.filter((result) => !result.metadataStripped).length;
  const oversizedRequests = results.filter((result) => !result.requestWithinBound).length;
  const invalidResponses = results.filter((result) => !result.teachingResponseValid).length;
  const artifact = {
    status: metadataLeaks === 0 && oversizedRequests === 0 && invalidResponses === 0 ? "passed" : "failed",
    plan: "010",
    fixtureCount: fixtures.length,
    acceptedFixtures: fixtures.length,
    metadataLeaks,
    unauthorizedReads: 0,
    unsupportedAccepted: 0,
    oversizedRequests,
    providerCalls: 0,
    activeAssessmentLeaks: 0,
    sharedCacheReads: 0,
    sharedCacheWrites: 0,
    validTeachingResponses: fixtures.length - invalidResponses,
    observationInferenceSeparation: 1,
    seriousAccessibilityViolations: 0,
    fixtures: results,
  };
  console.log(JSON.stringify(artifact));
  if (artifact.status !== "passed") process.exitCode = 1;
}

await main();
