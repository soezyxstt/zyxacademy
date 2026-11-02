import { createHash } from "node:crypto";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const TARGET_HOST = "br-cool-water-az2xxbul.storage.c-3.ap-southeast-1.aws.neon.tech";
const TARGET_BUCKET = "zyx-migration";
const STAGING_HOST = "br-holy-snow-azveniaa.storage.c-3.ap-southeast-1.aws.neon.tech";

export function validateTarget(endpoint: string, bucket: string) {
  const url = new URL(endpoint);
  const targetMatches = url.hostname === TARGET_HOST && bucket === TARGET_BUCKET || url.hostname === STAGING_HOST && bucket === "zyx-staging";
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

async function fingerprint(body: AsyncIterable<Uint8Array>): Promise<Fingerprint> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    hash.update(chunk);
  }
  return { size, sha256: hash.digest("hex") };
}

async function readObject(client: Reader, bucket: string, key: string) {
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body || !Number.isSafeInteger(object.ContentLength) || object.ContentLength < 0) throw new Error("SOURCE_OBJECT_INVALID");
  return object;
}

export async function copyObject(source: Reader, destination: Reader, sourceBucket: string, item: InventoryItem, apply: boolean, targetBucket = TARGET_BUCKET): Promise<"identical" | "would-copy" | "copied"> {
  if (targetBucket !== TARGET_BUCKET && targetBucket !== "zyx-staging") throw new Error("INVALID_NEON_STORAGE_TARGET");
  const { key } = item;
  const sourceObject = await readObject(source, sourceBucket, key);
  if (sourceObject.ContentLength !== item.size || sourceObject.ETag !== item.etag) throw new Error("SOURCE_CHANGED");
  const expected = await fingerprint(sourceObject.Body);
  if (expected.size !== sourceObject.ContentLength) throw new Error("SOURCE_LENGTH_MISMATCH");
  try {
    const existing = await readObject(destination, targetBucket, key);
    const actual = await fingerprint(existing.Body);
    if (actual.size !== existing.ContentLength || actual.size !== expected.size || actual.sha256 !== expected.sha256) throw new Error("DESTINATION_CONFLICT");
    return "identical";
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
  for await (const chunk of upload.Body) {
    received += chunk.byteLength;
    if (received > item.size) throw new Error("SOURCE_LENGTH_MISMATCH");
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== expected.size || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error("SOURCE_CHANGED");
  await destination.send(new PutObjectCommand({
    Bucket: targetBucket, Key: key, Body: bytes, ContentLength: expected.size,
    IfNoneMatch: "*", ContentType: sourceObject.ContentType, ContentDisposition: sourceObject.ContentDisposition,
    ContentEncoding: sourceObject.ContentEncoding, CacheControl: sourceObject.CacheControl, Metadata: sourceObject.Metadata,
  }));
  const copied = await readObject(destination, targetBucket, key);
  const actual = await fingerprint(copied.Body);
  if (actual.size !== copied.ContentLength || actual.size !== expected.size || actual.sha256 !== expected.sha256) throw new Error("COPY_VERIFICATION_FAILED");
  return "copied";
}

async function main() {
  if (process.argv.slice(2).some((arg) => arg !== "--apply") || process.argv.filter((arg) => arg === "--apply").length > 1) throw new Error("INVALID_ARGUMENTS");
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, NEON_STORAGE_BUCKET } = process.env;
  if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !AWS_ENDPOINT_URL_S3 || !AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !NEON_STORAGE_BUCKET) throw new Error("STORAGE_CONFIG_REQUIRED");
  validateTarget(AWS_ENDPOINT_URL_S3, NEON_STORAGE_BUCKET);
  const sourceUrl = new URL(R2_ENDPOINT);
  if (sourceUrl.protocol !== "https:" || !sourceUrl.hostname.endsWith(".r2.cloudflarestorage.com") || sourceUrl.port || sourceUrl.username || sourceUrl.password || sourceUrl.pathname !== "/" || sourceUrl.search || sourceUrl.hash) throw new Error("INVALID_R2_SOURCE");
  const source = new S3Client({ region: "auto", endpoint: R2_ENDPOINT, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
  const destination = new S3Client({ region: AWS_REGION, endpoint: AWS_ENDPOINT_URL_S3, forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED", credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } });
  const inventory = await listInventory(source, R2_BUCKET);
  const counts = { identical: 0, copied: 0, "would-copy": 0 };
  for (let start = 0; start < inventory.length; start += 2) {
    const results = await Promise.allSettled(inventory.slice(start, start + 2).map(async (item) => {
      const outcome = await copyObject(source, destination, R2_BUCKET, item, process.argv.includes("--apply"), NEON_STORAGE_BUCKET);
      counts[outcome]++;
      console.log(JSON.stringify({ keyHash: createHash("sha256").update(item.key).digest("hex"), outcome }));
    }));
    for (const result of results) if (result.status === "rejected") {
      const error = result.reason;
      console.error(JSON.stringify({ error: "COPY_OBJECT_FAILED", code: error?.name, status: error?.$metadata?.httpStatusCode }));
    }
    if (results.some((result) => result.status === "rejected")) throw new Error("COPY_BATCH_FAILED");
  }
  assertInventoryUnchanged(inventory, await listInventory(source, R2_BUCKET));
  if (process.argv.includes("--apply") && counts.identical + counts.copied !== inventory.length) throw new Error("COPY_INCOMPLETE");
  console.log(JSON.stringify({ total: inventory.length, ...counts, mode: process.argv.includes("--apply") ? "apply" : "dry-run" }));
}

if (import.meta.main) main().catch(() => { console.error("Storage copy failed; inspect configuration and reconcile before retrying."); process.exitCode = 1; });
