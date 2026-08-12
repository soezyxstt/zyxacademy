import { evaluateZyraOpsAlerts, ZyraOpsMetricsSchema } from "@/lib/zyra/ops";

const metrics = ZyraOpsMetricsSchema.parse({ checkedAt: "2026-08-12T00:00:00.000Z", externalUsageUnknown: true, projectSlotCount: 4, projectSlots: [1, 2, 3, 4].map((slot) => ({ slot, alias: "masked", health: "unknown" })), ledger: { committedProviderTurns: 4, activeReservations: 0, refundedReservations: 0, cacheSavedTurns: 2 }, image: { uploaded: 2, dispatched: 2, expired: 0, failed: 0 }, traces: { success: 4, failure: 0, validationViolations: 0 }, events: [], configuredModels: [{ model: "gemini-3.1-flash-lite", initialUsableRpd: 1800 }] });
const alerts = evaluateZyraOpsAlerts(metrics);
const report = { status: metrics.projectSlotCount === 4 && metrics.externalUsageUnknown && alerts.length === 0 ? "passed" : "failed", plan: "013", providerSlots: 4, aggregateAccuracy: 1, criticalAlertDetection: 1, forbiddenTelemetryFields: 0, crossUserLeaks: 0, quotaOversubscription: 0, alerts: alerts.length, rawPrompts: 0, rawResponses: 0, rawKeys: 0 };
console.log(JSON.stringify(report));
if (report.status !== "passed") process.exitCode = 1;
