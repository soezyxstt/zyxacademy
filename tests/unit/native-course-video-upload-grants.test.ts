import { expect, test } from "bun:test";
import { decodeVideoUploadToken, encodeVideoUploadToken, validVideoUpload } from "@/lib/video/upload-grant";
import { matchesCourseVideoUploadHeader, MAX_THUMBNAIL_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES } from "@/lib/video/upload-policy";
import { signedCourseVideoUploadUrl } from "@/apps/mobile-native/features/course-video/management-client";

const scope = { role: "tutor", courseId: "course-a", accountId: "account-a", sessionId: "session-a" } as const;
const expiresAt = 1_850_000_000_000;
const now = expiresAt - 100;
const uploadId = "eeb5cf68-64c5-49d0-abae-dcd833eaf72e";
const secret = "synthetic-signing-key-for-immutable-test-grant";
const claims = { key: "courses/course-a/videos/native-draft.png", uploadId, kind: "thumbnail",
  mime: "image/png", size: 17, expiresAt } as const;
const decode = (token: string, binding: Parameters<typeof decodeVideoUploadToken>[1] = scope, clock = now) =>
  decodeVideoUploadToken(token, binding, "thumbnail", secret, clock);

test("uploads use opaque authenticated grants for exact role, course, account, session and asset kind", () => {
  const token = encodeVideoUploadToken(scope, claims, secret);
  expect(decode(token)).toMatchObject(claims);
  expect(decode(token, { ...scope, courseId: "course-b" })).toBeNull();
  expect(decode(token, { ...scope, sessionId: "another-session" })).toBeNull();
  expect(decodeVideoUploadToken(token, { ...scope, role: "admin" }, "thumbnail", secret, now)).toBeNull();
  expect(decodeVideoUploadToken(token, scope, "video", secret, now)).toBeNull();
  expect(decode(token, scope, expiresAt)).toBeNull();
  expect(decode("a" + token.slice(1))).toBeNull();
  const publicDraft = encodeVideoUploadToken(scope, { ...claims, key: "courses/course-a/videos/thumbnails/unlinked.png" }, secret);
  expect(decode(publicDraft)).toBeNull();
});

test("the chosen prefix matches the exact allowed video or thumbnail metadata before linking", () => {
  expect(validVideoUpload({ ...claims, name: "Cover.png" })).toBe(true);
  expect(validVideoUpload({ ...claims, name: "Cover.png", size: MAX_THUMBNAIL_SIZE_BYTES + 1 })).toBe(false);
  expect(validVideoUpload({ kind: "video", name: "Lesson.mp4", mime: "video/mp4", size: MAX_VIDEO_SIZE_BYTES, uploadId })).toBe(true);
  expect(validVideoUpload({ kind: "video", name: "Lesson.svg", mime: "image/svg+xml", size: 12, uploadId })).toBe(false);
  expect(matchesCourseVideoUploadHeader(Uint8Array.of(0, 0, 0, 20, 102, 116, 121, 112), "video/mp4")).toBe(true);
  expect(matchesCourseVideoUploadHeader(new TextEncoder().encode("<svg/>"), "image/png")).toBe(false);
});

test("native PUT only uses an HTTPS signed storage URL and rejects embedded credentials and fragments", () => {
  const url = `https://signed-storage.example/course/video?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=${"a".repeat(64)}`;
  expect(signedCourseVideoUploadUrl(url)).toBe(url);
  expect(signedCourseVideoUploadUrl(url.replace("https://", "http://"))).toBeNull();
  expect(signedCourseVideoUploadUrl(url.replace("https://", "https://user:secret@"))).toBeNull();
  expect(signedCourseVideoUploadUrl(url + "#untrusted")).toBeNull();
  expect(signedCourseVideoUploadUrl("https://leak.example/plain-put")).toBeNull();
});
