import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isCourseVideoKey } from "@/lib/storage/keys";
import type { VideoManagerRole, VideoUploadInput, VideoUploadKind } from "@/packages/course-video/management";
import {
  ALLOWED_IMAGE_EXTENSIONS, ALLOWED_IMAGE_MIME_TYPES, ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_VIDEO_MIME_TYPES, MAX_THUMBNAIL_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES,
} from "./upload-policy";

export const videoUploadLeaseSeconds = 20 * 60;
type Scope = { role: VideoManagerRole; courseId: string; accountId: string; sessionId: string };
const bindings = (value: Scope) => createHash("sha256").update(JSON.stringify([
  value.role, value.courseId, value.accountId, value.sessionId,
])).digest("hex");

const schema = z.strictObject({
  key: z.string().min(1).max(512), bound: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.string(), size: z.number().int().positive(), kind: z.enum(["video", "thumbnail"]),
  uploadId: z.uuidv4(), expiresAt: z.number().int().positive(),
});

export type VideoUploadClaims = z.infer<typeof schema>;

const sign = (body: string, secret: string) => createHmac("sha256", secret).update("course-video-upload-v1:").update(body).digest();

export function validVideoUpload(input: VideoUploadInput) {
  const mimeTypes: readonly string[] = input.kind === "video" ? ALLOWED_VIDEO_MIME_TYPES : ALLOWED_IMAGE_MIME_TYPES;
  const extensions: readonly string[] = input.kind === "video" ? ALLOWED_VIDEO_EXTENSIONS : ALLOWED_IMAGE_EXTENSIONS;
  const limit = input.kind === "video" ? MAX_VIDEO_SIZE_BYTES : MAX_THUMBNAIL_SIZE_BYTES;
  return Number.isSafeInteger(input.size) && input.size > 0 && input.size <= limit &&
    mimeTypes.includes(input.mime) && extensions.some(extension => input.name.toLowerCase().endsWith(extension));
}

export function encodeVideoUploadToken(scope: Scope, claims: Omit<VideoUploadClaims, "bound">, secret: string) {
  const body = Buffer.from(JSON.stringify({ ...claims, bound: bindings(scope) })).toString("base64url");
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

export function decodeVideoUploadToken(token: string, scope: Scope, kind: VideoUploadKind, secret: string, now = Date.now()) {
  if (token.length > 2048 || !/^[\w-]+\.[\w-]+$/.test(token)) return null;
  const [body, signature] = token.split(".");
  const received = Buffer.from(signature, "base64url");
  const expected = sign(body, secret);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const decoded = schema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (!decoded.success) return null;
    const claims = decoded.data;
    const name = claims.key.split("/").pop() ?? "";
    return claims.kind === kind && claims.bound === bindings(scope) && claims.expiresAt > now &&
      isCourseVideoKey(claims.key) && validVideoUpload({ ...claims, name }) ? claims : null;
  } catch { return null; }
}
