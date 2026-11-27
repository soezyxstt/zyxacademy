import "server-only";
import { createHash } from "node:crypto";
import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getS3StorageConfig } from "@/lib/storage/r2";
import { assertSafeObjectKey, joinKey, leafFilename } from "@/lib/storage/keys";
import { STORAGE_PROVIDER_MODE } from "@/lib/storage";
import type { VideoUploadClaims } from "./upload-grant";
import { matchesCourseVideoUploadHeader } from "./upload-policy";

let storage: { client: S3Client; bucket: string } | undefined;
function target() {
  if (storage) return storage;
  const config = getS3StorageConfig(STORAGE_PROVIDER_MODE);
  storage = { client: new S3Client(config.client), bucket: config.bucket };
  return storage;
}

function mime(value?: string) { return value?.split(";", 1)[0].trim().toLowerCase(); }
const safePart = (value: string) => encodeURIComponent(value);

async function readPrefix(stream: ReadableStream<Uint8Array>, size: number) {
  const prefix = new Uint8Array(size);
  const reader = stream.getReader();
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > size - offset) {
        await reader.cancel();
        throw new Error("INVALID_VIDEO");
      }
      prefix.set(value, offset);
      offset += value.byteLength;
    }
    if (offset !== size) throw new Error("INVALID_VIDEO");
    return prefix;
  } finally {
    reader.releaseLock();
  }
}

export async function verifyAndPromoteVideoUpload(claims: VideoUploadClaims) {
  const { client, bucket } = target();
  const source = assertSafeObjectKey(claims.key);
  const request = { Bucket: bucket, Key: source };
  try {
    const head = await client.send(new HeadObjectCommand(request));
    if (!head.ETag || head.ContentLength !== claims.size || mime(head.ContentType) !== claims.mime) throw new Error("INVALID_VIDEO");
    const prefixSize = Math.min(claims.size, 32);
    const content = await client.send(new GetObjectCommand({ ...request, IfMatch: head.ETag,
      Range: `bytes=0-${prefixSize - 1}` }));
    if (content.ContentLength !== prefixSize || content.ContentRange !== `bytes 0-${prefixSize - 1}/${claims.size}` || !content.Body) {
      if (content.Body && "destroy" in content.Body) content.Body.destroy();
      throw new Error("INVALID_VIDEO");
    }
    if (!matchesCourseVideoUploadHeader(await readPrefix(content.Body.transformToWebStream(), prefixSize), claims.mime)) throw new Error("INVALID_VIDEO");

    // The signed PUT targets only the private draft. The attached key is bound to
    // the object version observed during validation and cannot be replaced using the grant.
    const id = createHash("sha256").update(JSON.stringify([source, head.ETag])).digest("hex").slice(0, 24);
    const [, course] = source.split("/");
    const name = `${id}-${leafFilename(source)}`;
    const key = claims.kind === "thumbnail" ? joinKey("courses", course, "videos", "thumbnails", name) : joinKey("courses", course, "videos", name);
    await client.send(new CopyObjectCommand({
      Bucket: bucket, Key: key, CopySource: [bucket, ...source.split("/")].map(safePart).join("/"), CopySourceIfMatch: head.ETag,
    }));
    return key;
  } catch (error) {
    const status = typeof error === "object" && error && "$metadata" in error
      ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode : undefined;
    if (status === 404 || status === 412) throw new Error("INVALID_VIDEO");
    throw error;
  }
}
