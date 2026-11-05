import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { canReuseStorageProof, signStorageManifest, verifyStorageManifest, type ObjectVersion, type StorageManifest } from "./storage-manifest";

const TARGET_HOST = "br-cool-water-az2xxbul.storage.c-3.ap-southeast-1.aws.neon.tech";
const TARGET_BUCKET = "zyx-migration";
const STAGING_HOST = "br-holy-snow-azveniaa.storage.c-3.ap-southeast-1.aws.neon.tech";
const CUTOVER_HOST = "br-gentle-scene-azq0gp91.storage.c-3.ap-southeast-1.aws.neon.tech";
const PRODUCTION_HOST = "br-wandering-butterfly-azi11h8r.storage.c-3.ap-southeast-1.aws.neon.tech";

export function validateTarget(endpoint: string, bucket: string) {
  const url = new URL(endpoint);
  const targetMatches = url.hostname === TARGET_HOST && bucket === TARGET_BUCKET || [STAGING_HOST, CUTOVER_HOST].includes(url.hostname) && bucket === "zyx-staging" || url.hostname === PRODUCTION_HOST && bucket === "zyx-production";
  if (url.protocol !== "https:" || !targetMatches || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("INVALID_NEON_STORAGE_TARGET");
  }
}

type Reader = { send(command: any): Promise<any> };
type Fingerprint = { size: number; sha256: string };
export type InventoryItem = { key: string; size: number; etag: string; lastModified: string };

export async function listInventory(source: Reader, bucket: string): Promise<InventoryItem[]> {
  const items: InventoryItem[] = [];
  const keys = new Set<string>();
  const tokens = new Set<string>();
  let token: string | undefined;
  do {
    const page = await source.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    if (!Array.isArray(page.Contents) && page.Contents != null) throw new Error("SOURCE_LIST_INCOMPLETE");
    for (const object of page.Contents ?? []) {
      if (typeof object.Key !== "string" || !object.Key || keys.has(object.Key) || !Number.isSafeInteger(object.Size) || object.Size < 0 || typeof object.ETag !== "string" || !object.ETag || !(object.LastModified instanceof Date) || !Number.isFinite(object.LastModified.getTime())) throw new Error("SOURCE_LIST_INVALID");
      keys.add(object.Key);
      items.push({ key: object.Key, size: object.Size, etag: object.ETag, lastModified: object.LastModified.toISOString() });
    }
    if (typeof page.IsTruncated !== "boolean") throw new Error("SOURCE_LIST_INCOMPLETE");
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && (typeof token !== "string" || !token || tokens.has(token))) throw new Error("SOURCE_LIST_INCOMPLETE");
    if (token) tokens.add(token);
  } while (token);
  return items.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

export function assertInventoryUnchanged(before: InventoryItem[], after: InventoryItem[]) {
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("SOURCE_INVENTORY_CHANGED");
}

export function assertDestinationInventory(source: InventoryItem[], destination: InventoryItem[]) {
  if (source.length !== destination.length || source.some((item, index) => item.key !== destination[index]?.key || item.size !== destination[index]?.size)) throw new Error("DESTINATION_INVENTORY_MISMATCH");
}

export function assertObjectMetadata(source: any, destination: any) {
  const normalize = (value: any) => JSON.stringify([
    ...["ContentType", "ContentDisposition", "ContentEncoding", "CacheControl", "ContentLanguage"].map(key => value[key] ?? null),
    value.Expires ? new Date(value.Expires).toISOString() : null,
    Object.entries(value.Metadata ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  ]);
  if (normalize(source) !== normalize(destination)) throw new Error("DESTINATION_METADATA_CONFLICT");
}

export async function verifyInventoryMetadata(source: Reader, destination: Reader, sourceBucket: string, targetBucket: string, inventory: InventoryItem[], targetInventory: InventoryItem[]) {
  assertDestinationInventory(inventory, targetInventory);
  let next = 0;
  // HEAD requests carry no response streams; bounded concurrency avoids rereading verified bytes.
  await Promise.all(Array.from({length: 4}, async () => {
    while (next < inventory.length) {
      const index = next++, item = inventory[index], target = targetInventory[index];
      const [a,b] = await Promise.all([
        source.send(new HeadObjectCommand({Bucket:sourceBucket,Key:item.key})),
        destination.send(new HeadObjectCommand({Bucket:targetBucket,Key:item.key})),
      ]);
      for (const [head, expected] of [[a,item],[b,target]] as const) {
        if (head.ContentLength !== expected.size || head.ETag !== expected.etag || !(head.LastModified instanceof Date) || Math.floor(head.LastModified.getTime()/1000) !== Math.floor(Date.parse(expected.lastModified)/1000)) throw new Error("OBJECT_VERSION_CHANGED_DURING_METADATA_CHECK");
      }
      assertObjectMetadata(a,b);
    }
  }));
}

export async function withBodyDeadline<T>(body: AsyncIterable<Uint8Array> & { destroy?: (error: Error) => void }, consume: () => Promise<T>, timeoutMs = 120000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([consume(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error("STORAGE_BODY_TIMEOUT");
        reject(error);
        body.destroy?.(error);
      }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

async function fingerprint(body: AsyncIterable<Uint8Array>): Promise<Fingerprint> {
  return withBodyDeadline(body, async () => {
    const hash = createHash("sha256");
    let size = 0;
    for await (const chunk of body) {
      size += chunk.byteLength;
      hash.update(chunk);
    }
    return { size, sha256: hash.digest("hex") };
  });
}

async function readObject(client: Reader, bucket: string, key: string) {
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body || !Number.isSafeInteger(object.ContentLength) || object.ContentLength < 0) throw new Error("SOURCE_OBJECT_INVALID");
  return object;
}

export async function copyObject(source: Reader, destination: Reader, sourceBucket: string, item: InventoryItem, apply: boolean, targetBucket = TARGET_BUCKET, onVerified?: (proof: { destination: ObjectVersion; sha256: string }) => void): Promise<"identical" | "would-copy" | "copied"> {
  if (![TARGET_BUCKET, "zyx-staging", "zyx-production"].includes(targetBucket)) throw new Error("INVALID_NEON_STORAGE_TARGET");
  const { key } = item;
  const sourceObject = await readObject(source, sourceBucket, key);
  if (sourceObject.ContentLength !== item.size || sourceObject.ETag !== item.etag) throw new Error("SOURCE_CHANGED");
  const expected = await fingerprint(sourceObject.Body);
  if (expected.size !== sourceObject.ContentLength) throw new Error("SOURCE_LENGTH_MISMATCH");
  async function verifyDestination() {
    const existing = await readObject(destination, targetBucket, key);
    const actual = await fingerprint(existing.Body);
    if (actual.size !== existing.ContentLength || actual.size !== expected.size || actual.sha256 !== expected.sha256) throw new Error("DESTINATION_CONFLICT");
    assertObjectMetadata(sourceObject, existing);
    if (onVerified) {
      if (typeof existing.ETag !== "string" || !(existing.LastModified instanceof Date)) throw new Error("DESTINATION_VERSION_REQUIRED");
      onVerified({ sha256: expected.sha256, destination: { size: actual.size, etag: existing.ETag, lastModified: existing.LastModified.toISOString() } });
    }
    return "identical" as const;
  }
  try {
    return await verifyDestination();
  } catch (error: any) {
    if (error?.name !== "NoSuchKey" && error?.$metadata?.httpStatusCode !== 404) throw error;
  }
  if (!apply) return "would-copy";
  // shortcut: buffer signed uploads up to 128 MiB; use multipart uploads for larger objects.
  if (item.size > 128 * 1024 * 1024) throw new Error("OBJECT_REQUIRES_MULTIPART_PLAN");
  const upload = await readObject(source, sourceBucket, key);
  if (upload.ContentLength !== item.size || upload.ETag !== item.etag) throw new Error("SOURCE_CHANGED");
  const chunks: Buffer[] = [];
  let received = 0;
  await withBodyDeadline(upload.Body, async () => { for await (const chunk of upload.Body) {
    received += chunk.byteLength;
    if (received > item.size) throw new Error("SOURCE_LENGTH_MISMATCH");
    chunks.push(Buffer.from(chunk));
  } });
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== expected.size || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error("SOURCE_CHANGED");
  try { await destination.send(new PutObjectCommand({
    Bucket: targetBucket, Key: key, Body: bytes, ContentLength: expected.size,
    IfNoneMatch: "*", ContentType: sourceObject.ContentType, ContentDisposition: sourceObject.ContentDisposition,
    ContentEncoding: sourceObject.ContentEncoding, CacheControl: sourceObject.CacheControl, ContentLanguage: sourceObject.ContentLanguage, Expires: sourceObject.Expires, Metadata: sourceObject.Metadata,
  })); } catch (error: any) {
    // A committed upload can lose its response and return 412 on the SDK's retry.
    if (error?.$metadata?.httpStatusCode === 412) return verifyDestination();
    throw error;
  }
  try { await verifyDestination(); }
  catch (error: any) { if (error?.message === "DESTINATION_CONFLICT") throw new Error("COPY_VERIFICATION_FAILED"); throw error; }
  return "copied";
}

export async function copyObjectWithRetry(...args: Parameters<typeof copyObject>) {
  try { return await copyObject(...args); }
  catch (error: any) {
    const transient = error?.message === "STORAGE_BODY_TIMEOUT" || error?.message === "fetch failed" || ["TimeoutError", "RequestTimeout"].includes(error?.name) || ["ECONNRESET", "ETIMEDOUT", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(error?.code || error?.cause?.code);
    if (!transient) throw error;
    console.error(JSON.stringify({ event: "retry_storage_object", keyHash: createHash("sha256").update(args[3].key).digest("hex") }));
    return copyObject(...args);
  }
}

async function main() {
  if (process.argv.slice(2).some((arg) => arg !== "--apply") || process.argv.filter((arg) => arg === "--apply").length > 1) throw new Error("INVALID_ARGUMENTS");
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, NEON_STORAGE_BUCKET } = process.env;
  if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !AWS_ENDPOINT_URL_S3 || !AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !NEON_STORAGE_BUCKET) throw new Error("STORAGE_CONFIG_REQUIRED");
  validateTarget(AWS_ENDPOINT_URL_S3, NEON_STORAGE_BUCKET);
  const sourceUrl = new URL(R2_ENDPOINT);
  if (sourceUrl.protocol !== "https:" || !sourceUrl.hostname.endsWith(".r2.cloudflarestorage.com") || sourceUrl.port || sourceUrl.username || sourceUrl.password || sourceUrl.pathname !== "/" || sourceUrl.search || sourceUrl.hash) throw new Error("INVALID_R2_SOURCE");
  // Mandatory full-object SHA-256 replaces optional SDK checksum streams that stalled during bulk reads.
  const requestHandler = { connectionTimeout: 15000, requestTimeout: 120000, socketTimeout: 120000 };
  const source = new S3Client({ requestHandler, responseChecksumValidation: "WHEN_REQUIRED", region: "auto", endpoint: R2_ENDPOINT, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
  const destination = new S3Client({ requestHandler, responseChecksumValidation: "WHEN_REQUIRED", region: AWS_REGION, endpoint: AWS_ENDPOINT_URL_S3, forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED", credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } });
  const inventory = await listInventory(source, R2_BUCKET);
  const destinationInventory = new Map((await listInventory(destination, NEON_STORAGE_BUCKET)).map(item => [item.key, item]));
  const counts = { identical: 0, copied: 0, reused: 0, "would-copy": 0 };
  const context = { sourceEndpoint: new URL(R2_ENDPOINT).href, sourceBucket: R2_BUCKET, targetEndpoint: new URL(AWS_ENDPOINT_URL_S3).href, targetBucket: NEON_STORAGE_BUCKET };
  const manifestKey = process.env.NEON_MANIFEST_KEY;
  let manifest: StorageManifest = { version: 1, context, objects: {} };
  let manifestPath: string | undefined;
  let lock: number | undefined;
  if (manifestKey) {
    mkdirSync(".tmp", { recursive: true, mode: 0o700 });
    if (realpathSync(".tmp").toLowerCase() !== resolve(".tmp").toLowerCase()) throw new Error("UNSAFE_STORAGE_MANIFEST_PATH");
    manifestPath = resolve(".tmp", `neon-storage-${new URL(AWS_ENDPOINT_URL_S3).hostname.split(".")[0]}.json`);
    if (existsSync(manifestPath)) {
      if (lstatSync(manifestPath).isSymbolicLink()) throw new Error("UNSAFE_STORAGE_MANIFEST_PATH");
      manifest = verifyStorageManifest(JSON.parse(readFileSync(manifestPath, "utf8")), context, manifestKey);
    }
    lock = openSync(`${manifestPath}.lock`, "wx", 0o600);
    writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  }
  try {
  // Concurrent large-object response streams stalled during the production rehearsal.
  for (const item of inventory) {
    try {
      const keyHash = createHash("sha256").update(item.key).digest("hex");
      if (manifestKey && canReuseStorageProof(manifest.objects[keyHash], item, destinationInventory.get(item.key))) {
        counts.reused++;
        console.log(JSON.stringify({ keyHash, outcome: "reused-verified-version" }));
        continue;
      }
      const outcome = await copyObjectWithRetry(source, destination, R2_BUCKET, item, process.argv.includes("--apply"), NEON_STORAGE_BUCKET, manifestKey ? (proof) => {
        manifest.objects[keyHash] = { ...proof, source: { size: item.size, etag: item.etag, lastModified: item.lastModified } };
        writeFileSync(`${manifestPath}.next`, JSON.stringify(signStorageManifest(manifest, manifestKey)), { mode: 0o600, flag: "wx" });
        renameSync(`${manifestPath}.next`, manifestPath!);
      } : undefined);
      counts[outcome]++;
      console.log(JSON.stringify({ keyHash: createHash("sha256").update(item.key).digest("hex"), outcome }));
    } catch (error: any) {
      console.error(JSON.stringify({ error: "COPY_OBJECT_FAILED", type: error?.name, code: /^[A-Z0-9_]+$/.test(error?.code || "") ? error.code : undefined, causeCode: /^[A-Z0-9_]+$/.test(error?.cause?.code || "") ? error.cause.code : undefined, status: error?.$metadata?.httpStatusCode, reason: /^[A-Z_]+$/.test(error?.message || "") ? error.message : undefined }));
      throw new Error("COPY_BATCH_FAILED");
    }
  }
  assertInventoryUnchanged(inventory, await listInventory(source, R2_BUCKET));
  if (process.argv.includes("--apply") && counts.identical + counts.copied + counts.reused !== inventory.length) throw new Error("COPY_INCOMPLETE");
  if (process.argv.includes("--apply")) {
    const targetInventory = await listInventory(destination, NEON_STORAGE_BUCKET);
    assertDestinationInventory(inventory, targetInventory);
    const after = new Map(targetInventory.map(item => [item.key, item]));
    if (manifestKey && inventory.some(item => !canReuseStorageProof(manifest.objects[createHash("sha256").update(item.key).digest("hex")], item, after.get(item.key)))) throw new Error("DESTINATION_VERSION_RECONCILIATION_FAILED");
    await verifyInventoryMetadata(source, destination, R2_BUCKET, NEON_STORAGE_BUCKET, inventory, targetInventory);
    assertInventoryUnchanged(inventory, await listInventory(source, R2_BUCKET));
    assertInventoryUnchanged(targetInventory, await listInventory(destination, NEON_STORAGE_BUCKET));
  }
  console.log(JSON.stringify({ total: inventory.length, ...counts, metadataVerified: process.argv.includes("--apply"), mode: process.argv.includes("--apply") ? "apply" : "dry-run" }));
  } finally {
    if (lock !== undefined) { closeSync(lock); unlinkSync(`${manifestPath}.lock`); }
    source.destroy(); destination.destroy();
  }
}

if (import.meta.main) await main().catch((error: unknown) => { console.error(JSON.stringify({error:"STORAGE_COPY_FAILED",reason:error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : undefined})); process.exitCode = 1; });
