import { z } from "zod";

export const ZYRA_OPS_EVENT_VERSION = "zyra-ops-event-v1";

export const ZyraOperationalEventSchema = z.object({
  version: z.literal(ZYRA_OPS_EVENT_VERSION),
  eventType: z.enum([
    "lease",
    "provider_attempt",
    "route_decision",
    "cache_result",
    "teaching_validation",
    "image_preprocessing",
    "proposal_lifecycle",
    "learner_outcome",
  ]),
  actorRole: z.enum(["admin", "tutor", "murid", "system", "unknown"]),
  routeClass: z.string().regex(/^[a-z0-9_-]{1,64}$/),
  modelClass: z.string().regex(/^[a-z0-9._-]{1,96}$/),
  projectFingerprint: z.string().regex(/^[a-f0-9]{16}$/).nullable().default(null),
  courseFingerprint: z.string().regex(/^[a-f0-9]{16}$/).nullable().default(null),
  resultCode: z.string().regex(/^[A-Z0-9_.:-]{1,96}$/),
  latencyBucket: z.enum(["lt_250ms", "250ms_1s", "1s_3s", "3s_10s", "gt_10s", "unknown"]),
  sizeBucket: z.enum(["none", "lt_256kb", "256kb_1mb", "1mb_4mb", "4mb_16mb", "gt_16mb", "unknown"]),
  cacheResult: z.enum(["none", "hit", "miss", "bypass", "error"]),
  attachmentCount: z.number().int().min(0).max(4).default(0),
  sanitizerVersion: z.string().regex(/^[a-z0-9._-]{1,64}$/).nullable().default(null),
}).strict();
export type ZyraOperationalEvent = z.infer<typeof ZyraOperationalEventSchema>;

export const ZyraOpsAlertSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_:-]{1,96}$/),
  severity: z.enum(["warning", "critical"]),
  dedupKey: z.string().regex(/^[a-z0-9._-]{1,96}$/),
  runbook: z.string().regex(/^docs\/operations\/[A-Za-z0-9._/-]+#[a-z0-9-]+$/),
  rollbackFlag: z.string().regex(/^FEATURE_[A-Z0-9_]+$/).optional(),
}).strict();
export type ZyraOpsAlert = z.infer<typeof ZyraOpsAlertSchema>;

export const ZyraOpsCapacitySchema = z.object({
  modelPools: z.array(z.object({
    model: z.string(),
    configuredPerProjectRpd: z.number().int().nonnegative(),
    configuredUsableRpd: z.number().int().nonnegative(),
    safetyReserveRpd: z.number().int().nonnegative(),
    zyxCommittedRequests: z.number().int().nonnegative(),
    activeReservations: z.number().int().nonnegative(),
    usableRemainingRpd: z.number().int().nonnegative(),
  }).strict()),
}).strict();
export type ZyraOpsCapacity = z.infer<typeof ZyraOpsCapacitySchema>;

export const ZyraOpsMetricsSchema = z.object({
  checkedAt: z.string().datetime(),
  externalUsageUnknown: z.literal(true),
  projectSlotCount: z.literal(4),
  projectSlots: z.array(z.object({
    slot: z.number().int().min(1).max(4),
    alias: z.literal("masked"),
    health: z.enum(["healthy", "degraded", "unknown"]),
  }).strict()).length(4),
  ledger: z.object({
    committedProviderTurns: z.number().int().nonnegative(),
    activeReservations: z.number().int().nonnegative(),
    refundedReservations: z.number().int().nonnegative(),
    cacheSavedTurns: z.number().int().nonnegative(),
  }).strict(),
  image: z.object({
    uploaded: z.number().int().nonnegative(),
    dispatched: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }).strict(),
  traces: z.object({
    success: z.number().int().nonnegative(),
    failure: z.number().int().nonnegative(),
    validationViolations: z.number().int().nonnegative(),
  }).strict(),
  events: z.array(z.object({ eventType: z.string(), resultCode: z.string(), count: z.number().int().nonnegative() }).strict()),
  configuredModels: z.array(z.object({ model: z.string(), initialUsableRpd: z.number().int().nonnegative() }).strict()),
  capacity: ZyraOpsCapacitySchema.default({ modelPools: [] }),
  alerts: z.array(ZyraOpsAlertSchema).default([]),
}).strict();
export type ZyraOpsMetrics = z.infer<typeof ZyraOpsMetricsSchema>;

export function parseZyraOperationalEvent(input: unknown): ZyraOperationalEvent {
  return ZyraOperationalEventSchema.parse(input);
}

export function redactZyraOperationalEvent(input: unknown): ZyraOperationalEvent {
  return parseZyraOperationalEvent(input);
}
