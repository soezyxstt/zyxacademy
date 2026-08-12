import { z } from "zod";

export const ZYRA_IMAGE_INPUT_VERSION = "zyra-image-input-v1";
export const ZYRA_IMAGE_SANITIZER_VERSION = "zyra-image-sanitizer-v1";
export const ZYRA_IMAGE_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const ZYRA_IMAGE_MAX_SANITIZED_BYTES = 8 * 1024 * 1024;
export const ZYRA_IMAGE_MAX_REQUEST_BYTES = 16 * 1024 * 1024;
export const ZYRA_IMAGE_MAX_LONGEST_EDGE = 4096;
export const ZYRA_IMAGE_DISPATCH_LONGEST_EDGE = 2048;
export const ZYRA_IMAGE_MAX_DECODED_PIXELS = 16_000_000;
export const ZYRA_IMAGE_MAX_COUNT = 4;
export const ZYRA_IMAGE_RETENTION_DAYS = 7;

export const ZyraImageMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
export type ZyraImageMime = z.infer<typeof ZyraImageMimeSchema>;

export const ZyraImageExtensionSchema = z.enum(["jpg", "png", "webp"]);
export type ZyraImageExtension = z.infer<typeof ZyraImageExtensionSchema>;

export const ZyraImageFailureCodeSchema = z.enum([
  "UNSUPPORTED_MIME",
  "BAD_MAGIC_BYTES",
  "SOURCE_TOO_LARGE",
  "DECODED_IMAGE_TOO_LARGE",
  "ANIMATED_IMAGE_REJECTED",
  "CORRUPT_IMAGE",
  "SANITIZER_FAILURE",
  "REQUEST_TOO_LARGE",
  "UNAUTHORIZED",
  "EXPIRED",
  "PROVIDER_REJECTED",
]);
export type ZyraImageFailureCode = z.infer<typeof ZyraImageFailureCodeSchema>;

export const ZyraImageUploadInputSchema = z.object({
  courseId: z.string().trim().min(1).max(160),
  sessionId: z.string().trim().min(1).max(160),
}).strict();

export const ZyraImageObservationSchema = z.object({
  observation: z.string().trim().min(1).max(500),
  confidence: z.enum(["high", "medium", "low", "unknown"]),
}).strict();
export type ZyraImageObservation = z.infer<typeof ZyraImageObservationSchema>;

export const ZyraImageResponseFieldsSchema = z.object({
  imageObservations: z.array(ZyraImageObservationSchema).max(8).default([]),
  uncertainties: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  unreadableRegions: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
}).strict();
export type ZyraImageResponseFields = z.infer<typeof ZyraImageResponseFieldsSchema>;

export const ZyraMessageAttachmentSchema = z.object({
  id: z.string().uuid(),
  mimeType: ZyraImageMimeSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict();
export type ZyraMessageAttachment = z.infer<typeof ZyraMessageAttachmentSchema>;

export interface SanitizedZyraImage {
  bytes: Uint8Array;
  mimeType: ZyraImageMime;
  extension: ZyraImageExtension;
  width: number;
  height: number;
  sanitizedSha256: string;
  sanitizerVersion: string;
}

export interface ZyraImageAttachmentRecord {
  id: string;
  studentId: string;
  courseId: string;
  sessionId: string;
  messageId: string | null;
  objectKey: string;
  mimeType: ZyraImageMime;
  byteSize: number;
  width: number;
  height: number;
  status: "uploaded" | "attached" | "dispatched" | "deleted" | "expired" | "failed";
  expiresAt: Date;
}

export interface ZyraAttachmentOwnerContext {
  actorId: string | null | undefined;
  ownerId: string;
  courseId: string;
  authorizedCourseId: string;
  role?: string | null;
}

export function isZyraImageFeatureEnabled(value = process.env.FEATURE_ZYRA_IMAGE_INPUT_V1): boolean {
  return value === "1";
}

export function assertZyraImageCount(count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > ZYRA_IMAGE_MAX_COUNT) {
    throw new Error("ZYRA_IMAGE_COUNT_LIMIT");
  }
}

export function assertZyraImageRequestBytes(totalBytes: number, promptBytes: number): void {
  if (totalBytes < 0 || promptBytes < 0 || totalBytes + promptBytes > ZYRA_IMAGE_MAX_REQUEST_BYTES) {
    throw new Error("REQUEST_TOO_LARGE");
  }
}
