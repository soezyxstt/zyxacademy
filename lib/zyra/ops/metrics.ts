import { gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiAllowanceLeases, aiGenerationTraces, zyraMessageAttachments, zyraOperationalEvents } from "@/db/schema";
import { startOfJakartaDayUtc } from "@/lib/date-utils";
import { MODEL_REGISTRY } from "@/lib/ai/provider/model-registry";
import { ZyraOpsMetricsSchema, type ZyraOpsMetrics } from "./contracts";
import { evaluateZyraOpsAlerts } from "./alerts";

export function zyraOpsDayStart(now: Date): Date {
  return startOfJakartaDayUtc(now);
}

export async function getZyraOpsMetrics(now = new Date()): Promise<ZyraOpsMetrics> {
  const dayStart = zyraOpsDayStart(now);
  const [leaseRows, imageRows, traceRows, eventRows] = await Promise.all([
    db.select({ model: aiAllowanceLeases.model, status: aiAllowanceLeases.status, requestType: aiAllowanceLeases.requestType, count: sql<number>`count(*)` })
      .from(aiAllowanceLeases)
      .where(gte(aiAllowanceLeases.createdAt, dayStart))
      .groupBy(aiAllowanceLeases.model, aiAllowanceLeases.status, aiAllowanceLeases.requestType),
    db.select({ status: zyraMessageAttachments.status, count: sql<number>`count(*)` })
      .from(zyraMessageAttachments)
      .where(gte(zyraMessageAttachments.createdAt, dayStart))
      .groupBy(zyraMessageAttachments.status),
    db.select({ outcome: aiGenerationTraces.terminalOutcome, violationCodes: aiGenerationTraces.violationCodes, count: sql<number>`count(*)` })
      .from(aiGenerationTraces)
      .where(gte(aiGenerationTraces.createdAt, dayStart))
      .groupBy(aiGenerationTraces.terminalOutcome, aiGenerationTraces.violationCodes),
    db.select({ eventType: zyraOperationalEvents.eventType, resultCode: zyraOperationalEvents.resultCode, count: sql<number>`count(*)` })
      .from(zyraOperationalEvents)
      .where(gte(zyraOperationalEvents.createdAt, dayStart))
      .groupBy(zyraOperationalEvents.eventType, zyraOperationalEvents.resultCode),
  ]);

  const countLease = (status: string, requestType?: string) => leaseRows
    .filter((row) => row.status === status && (!requestType || row.requestType === requestType))
    .reduce((sum, row) => sum + Number(row.count), 0);
  const countImage = (status: string) => imageRows.find((row) => row.status === status)?.count ?? 0;
  const success = traceRows.filter((row) => row.outcome === "success").reduce((sum, row) => sum + Number(row.count), 0);
  const failure = traceRows.filter((row) => row.outcome !== "success").reduce((sum, row) => sum + Number(row.count), 0);
  const validationViolations = traceRows
    .filter((row) => Boolean(row.violationCodes))
    .reduce((sum, row) => sum + Number(row.count), 0);
  const configuredModels = Object.values(MODEL_REGISTRY)
    .filter((model) => model.operations.includes("generate") && model.stability !== "quarantined")
    .map((model) => ({ model: model.id, initialUsableRpd: model.limits.initialUsableRpd }));
  const modelPools = Object.values(MODEL_REGISTRY)
    .filter((model) => model.operations.includes("generate") && model.stability !== "quarantined")
    .map((model) => {
      const committed = leaseRows
        .filter((row) => row.model === model.id && row.status === "committed" && row.requestType !== "cache:hit")
        .reduce((sum, row) => sum + Number(row.count), 0);
      const active = leaseRows
        .filter((row) => row.model === model.id && (row.status === "reserved" || row.status === "dispatched"))
        .reduce((sum, row) => sum + Number(row.count), 0);
      const configuredUsableRpd = model.limits.initialUsableRpd;
      const configuredProviderRpd = model.limits.perProjectRpd * 4;
      return {
        model: model.id,
        configuredPerProjectRpd: model.limits.perProjectRpd,
        configuredUsableRpd,
        safetyReserveRpd: Math.max(0, configuredProviderRpd - configuredUsableRpd),
        zyxCommittedRequests: committed,
        activeReservations: active,
        usableRemainingRpd: Math.max(0, configuredUsableRpd - committed - active),
      };
    });
  const metrics = {
    checkedAt: now.toISOString(),
    externalUsageUnknown: true as const,
    projectSlotCount: 4 as const,
    projectSlots: [1, 2, 3, 4].map((slot) => ({ slot, alias: "masked" as const, health: "unknown" as const })),
    ledger: {
      committedProviderTurns: countLease("committed") - countLease("committed", "cache:hit"),
      activeReservations: countLease("reserved") + countLease("dispatched"),
      refundedReservations: countLease("refunded"),
      cacheSavedTurns: countLease("committed", "cache:hit"),
    },
    image: {
      uploaded: Number(countImage("uploaded")),
      dispatched: Number(countImage("dispatched")),
      expired: Number(countImage("expired")),
      failed: Number(countImage("failed")),
    },
    traces: { success, failure, validationViolations },
    events: eventRows.map((row) => ({ eventType: row.eventType, resultCode: row.resultCode, count: Number(row.count) })),
    configuredModels,
    capacity: { modelPools },
  };
  const parsed = ZyraOpsMetricsSchema.parse(metrics);
  return ZyraOpsMetricsSchema.parse({ ...parsed, alerts: evaluateZyraOpsAlerts(parsed) });
}
