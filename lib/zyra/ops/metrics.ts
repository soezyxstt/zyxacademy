import { compatibleSettings } from "@/lib/ai/provider/compatible-text";
import { ControlPlaneClient } from "@/lib/ai/control-plane-client";
import { gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiAllowanceLeases, aiGenerationTraces, zyraMessageAttachments, zyraOperationalEvents } from "@/db/schema";
import { startOfJakartaDayUtc } from "@/lib/date-utils";
import { isTextProfile, TEXT_PROFILES, MODEL_REGISTRY } from "@/lib/ai/provider/model-registry";
import { ZyraOpsMetricsSchema, type ZyraOpsMetrics } from "./contracts";
import { evaluateZyraOpsAlerts } from "./alerts";

export function zyraOpsDayStart(now: Date): Date {
  return startOfJakartaDayUtc(now);
}

export async function getZyraOpsMetrics(now = new Date()): Promise<ZyraOpsMetrics> {
  const dayStart = zyraOpsDayStart(now);
  const [leaseRows, imageRows, traceRows, eventRows, stageRows, quota] = await Promise.all([
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
    db.select({
      stage: aiGenerationTraces.stageId, model: aiGenerationTraces.model,
      total: sql<number>`count(*)`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${aiGenerationTraces.terminalOutcome} <> 'success')`.mapWith(Number),
      p95Ms: sql<number>`percentile_disc(0.95) within group (order by ${aiGenerationTraces.latencyMs})`.mapWith(Number),
    }).from(aiGenerationTraces).where(gte(aiGenerationTraces.createdAt, dayStart))
      .groupBy(aiGenerationTraces.stageId, aiGenerationTraces.model)
      .orderBy(sql`count(*) filter (where ${aiGenerationTraces.terminalOutcome} <> 'success') desc, count(*) desc`, aiGenerationTraces.stageId, aiGenerationTraces.model)
      .limit(20),
    new ControlPlaneClient().diagnostics().catch(() => null),
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
  const visibleModels = Object.values(MODEL_REGISTRY).filter(model => model.family !== "chat-completions" || compatibleSettings(process.env, model.id));
  const configuredModels = visibleModels
    .filter((model) => model.operations.includes("generate") && model.stability !== "quarantined")
    .map((model) => ({ model: model.id, initialUsableRpd: model.limits.initialUsableRpd }));
  const modelPools = (quota?.providerDay ? visibleModels : [])
    .filter((model) => model.operations.includes("generate") && model.stability !== "quarantined")
    .map((model) => {
      const rows = quota!.counters.filter(row => row.modelId === model.id);
      const group = isTextProfile(model.id) ? TEXT_PROFILES[model.id].group : null;
      const usageRows = group ? quota!.counters.filter(row => row.projectAlias === group && isTextProfile(row.modelId)) : rows;
      const used = usageRows.reduce((sum, row) => sum + row.committedCount + row.reservedCount, 0);
      const committed = rows.reduce((sum, row) => sum + row.committedCount, 0);
      const active = rows.reduce((sum, row) => sum + row.reservedCount, 0);
      const groups = model.family === "chat-completions" ? 1 : quota!.projectGroupCount ?? 0;
      const configuredProviderRpd = model.limits.perProjectRpd * groups;
      const configuredUsableRpd = model.family === "chat-completions" ? model.limits.initialUsableRpd
        : Math.min(model.limits.perProjectRpd, Math.floor(model.limits.initialUsableRpd / 4)) * groups;
      return {
        model: model.id,
        configuredPerProjectRpd: model.limits.perProjectRpd,
        configuredUsableRpd,
        safetyReserveRpd: Math.max(0, configuredProviderRpd - configuredUsableRpd),
        zyxCommittedRequests: committed,
        activeReservations: active,
        usableRemainingRpd: Math.max(0, configuredUsableRpd - used),
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
    stageOutcomes: stageRows,
    configuredModels,
    capacity: { modelPools },
  };
  const parsed = ZyraOpsMetricsSchema.parse(metrics);
  return ZyraOpsMetricsSchema.parse({ ...parsed, alerts: evaluateZyraOpsAlerts(parsed) });
}
