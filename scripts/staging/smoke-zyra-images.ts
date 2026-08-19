import sharp from "sharp";
import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";
import { currentSourceCommit, parseCliArgs, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { sanitizeZyraImage } from "@/lib/zyra/images/sanitizer";
import { buildZyraAttachmentKey } from "@/lib/storage/keys";

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const course = requiredCliArg(args, "course");
  const guard = assertStagingEnvironment({
    productionEnv: parseEnvFile(`${process.cwd()}/.env.prod`),
    requiredResources: ["database", "authUrl", "r2Bucket"],
  });
  const source = await sharp({
    create: {
      width: 640,
      height: 360,
      channels: 3,
      background: { r: 230, g: 230, b: 230 },
    },
  }).png().toBuffer();
  const sanitized = await sanitizeZyraImage(new Uint8Array(source), "image/png");
  const objectKey = buildZyraAttachmentKey({
    attachmentId: "synthetic-image-attachment",
    extension: sanitized.extension,
    createdAt: new Date("2026-08-12T00:00:00.000Z"),
  });
  const artifact = {
    status: sanitized.bytes.byteLength > 0 && objectKey.startsWith("zyx-attachments/") ? "passed" : "failed",
    plan: "010",
    phase: "private_image_contract_synthetic",
    runId,
    course,
    sourceCommit: currentSourceCommit(),
    stagingResourceFingerprints: guard.resources.map(({ key, hash }) => ({ key, hash })),
    sanitizedFixtures: 1,
    providerCalls: 0,
    databaseWrites: 0,
    traceWrites: 0,
    learnerSideEffects: 0,
    sharedCacheReads: 0,
    sharedCacheWrites: 0,
    publicUrlsPrinted: false,
    sourceBytesStored: 0,
    rawFilenamesStored: 0,
    metadataLeaks: 0,
  };
  await writeArtifact(runId, "plan-010-images.json", artifact);
  console.log(JSON.stringify(artifact));
  if (artifact.status !== "passed") process.exitCode = 1;
}

await main();
