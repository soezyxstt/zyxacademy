import { createHash, randomUUID } from "node:crypto";
import { db } from "@/db";
import { zyraOperationalEvents } from "@/db/schema";
import { ZyraOperationalEventSchema, type ZyraOperationalEvent } from "./contracts";

export function zyraOperationalFingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

export function zyraLatencyBucket(milliseconds: number): ZyraOperationalEvent["latencyBucket"] {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "unknown";
  if (milliseconds < 250) return "lt_250ms";
  if (milliseconds < 1_000) return "250ms_1s";
  if (milliseconds < 3_000) return "1s_3s";
  if (milliseconds < 10_000) return "3s_10s";
  return "gt_10s";
}

export function zyraSizeBucket(bytes: number | null | undefined): ZyraOperationalEvent["sizeBucket"] {
  if (bytes === null || bytes === undefined) return "unknown";
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes === 0) return "none";
  if (bytes < 256 * 1024) return "lt_256kb";
  if (bytes < 1024 * 1024) return "256kb_1mb";
  if (bytes < 4 * 1024 * 1024) return "1mb_4mb";
  if (bytes <= 16 * 1024 * 1024) return "4mb_16mb";
  return "gt_16mb";
}

export function toZyraOperationalRow(event: ZyraOperationalEvent) {
  return {
    id: randomUUID(),
    eventVersion: event.version,
    eventType: event.eventType,
    actorRole: event.actorRole,
    routeClass: event.routeClass,
    modelClass: event.modelClass,
    projectFingerprint: event.projectFingerprint,
    courseFingerprint: event.courseFingerprint,
    resultCode: event.resultCode,
    latencyBucket: event.latencyBucket,
    sizeBucket: event.sizeBucket,
    cacheResult: event.cacheResult,
    attachmentCount: event.attachmentCount,
    sanitizerVersion: event.sanitizerVersion,
  };
}

export async function recordZyraOperationalEvent(input: unknown): Promise<boolean> {
  const event = ZyraOperationalEventSchema.parse(input);
  await db.insert(zyraOperationalEvents).values(toZyraOperationalRow(event));
  return true;
}

/** Observability must never turn a valid tutoring response into an error. */
export async function recordZyraOperationalEventSafe(input: unknown): Promise<void> {
  try {
    await recordZyraOperationalEvent(input);
  } catch {
    // Operational telemetry is best effort; quota and learner response state remain authoritative.
  }
}
