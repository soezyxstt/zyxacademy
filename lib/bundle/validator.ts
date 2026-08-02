import { createHash } from "node:crypto";
import { z } from "zod";

export const BUNDLE_VALIDATION_REASON_CODES = [
  "BUNDLE_MISSING_MANIFEST",
  "BUNDLE_INVALID_JSON",
  "BUNDLE_INVALID_MANIFEST",
  "BUNDLE_UNSUPPORTED_SCHEMA",
  "BUNDLE_CHECKSUM_MISMATCH",
  "BUNDLE_ENTITY_FILE_MISSING",
  "BUNDLE_ENTITY_CHECKSUM_MISMATCH",
  "BUNDLE_ENTITY_INVALID",
  "BUNDLE_STABLE_ID_MISMATCH",
  "BUNDLE_MISSING_SOURCE",
  "BUNDLE_SOURCE_CHECKSUM_MISMATCH",
  "BUNDLE_SOURCE_CHUNK_INVALID",
  "BUNDLE_INVALID_SPAN",
  "BUNDLE_MISSING_IDEA",
  "BUNDLE_DUPLICATE_STABLE_KEY",
  "BUNDLE_INVALID_RELATION",
  "BUNDLE_PREREQUISITE_CYCLE",
  "BUNDLE_UNRESOLVED_CONFLICT",
] as const;

export type BundleValidationReasonCode = (typeof BUNDLE_VALIDATION_REASON_CODES)[number];

export interface BundleValidationIssue {
  code: BundleValidationReasonCode;
  message: string;
  path?: string;
}
export class BundleValidationError extends Error {
  readonly code: BundleValidationReasonCode;
  readonly path?: string;

  constructor(issue: BundleValidationIssue) {
    super(issue.message);
    this.name = "BundleValidationError";
    this.code = issue.code;
    this.path = issue.path;
  }
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Text(value: string): string {
  return sha256Bytes(new TextEncoder().encode(value));
}

export function parseStrictJson<T>(bytes: Uint8Array, path: string): T {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
  } catch {
    throw new BundleValidationError({ code: "BUNDLE_INVALID_JSON", message: `invalid JSON in ${path}`, path });
  }
}

export function parseSchema<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BundleValidationError({
      code: "BUNDLE_ENTITY_INVALID",
      message: `schema validation failed in ${path}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
      path,
    });
  }
  return parsed.data;
}

export function assertCondition(
  condition: boolean,
  code: BundleValidationReasonCode,
  message: string,
  path?: string,
): asserts condition {
  if (!condition) throw new BundleValidationError({ code, message, path });
}
