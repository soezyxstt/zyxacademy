import { describe, expect, test } from "bun:test";
import { evaluateZyraOpsAlerts, type ZyraOpsMetrics } from "@/lib/zyra/ops";

const metrics: ZyraOpsMetrics = {
  checkedAt: "2026-08-12T00:00:00.000Z",
  externalUsageUnknown: true,
  projectSlotCount: 4,
  projectSlots: [1, 2, 3, 4].map((slot) => ({ slot, alias: "masked", health: "unknown" })),
  ledger: { committedProviderTurns: 0, activeReservations: 101, refundedReservations: 0, cacheSavedTurns: 0 },
  image: { uploaded: 0, dispatched: 0, expired: 0, failed: 11 },
  traces: { success: 0, failure: 0, validationViolations: 1 },
  events: [],
  configuredModels: [],
  capacity: { modelPools: [] },
  alerts: [],
};

describe("Zyra ops alerts", () => {
  test("detects critical and warning fixtures once", () => {
    const alerts = evaluateZyraOpsAlerts(metrics);
    expect(alerts.map((alert) => alert.code)).toEqual(["ACTIVE_RESERVATION_SPIKE", "IMAGE_SANITIZER_FAILURE_SPIKE", "TEACHING_VALIDATION_VIOLATION"]);
    expect(new Set(alerts.map((alert) => alert.dedupKey)).size).toBe(alerts.length);
    expect(alerts.every((alert) => alert.runbook.startsWith("docs/operations/"))).toBe(true);
    expect(alerts.every((alert) => alert.rollbackFlag.startsWith("FEATURE_"))).toBe(true);
  });

  test("maps privacy, provider, cache, assessment, telemetry, and proposal signals", () => {
    const signaled = evaluateZyraOpsAlerts({
      ...metrics,
      ledger: { ...metrics.ledger, activeReservations: 0 },
      traces: { ...metrics.traces, validationViolations: 0 },
      image: { ...metrics.image, failed: 0 },
      events: [
        { eventType: "provider_attempt", resultCode: "PROVIDER_429", count: 1 },
        { eventType: "provider_attempt", resultCode: "PROVIDER_TIMEOUT", count: 1 },
        { eventType: "cache_result", resultCode: "CACHE_ISOLATION_REJECTED", count: 1 },
        { eventType: "teaching_validation", resultCode: "ASSESSMENT_LEAK", count: 1 },
        { eventType: "learner_outcome", resultCode: "ATTACHMENT_AUTHORIZATION_FAILURE", count: 1 },
        { eventType: "proposal_lifecycle", resultCode: "PROPOSAL_SAFETY_REJECTION", count: 1 },
        { eventType: "system", resultCode: "TELEMETRY_LOSS", count: 1 },
      ],
    });
    expect(signaled.map((alert) => alert.code)).toEqual([
      "PROVIDER_429_SPIKE",
      "PROVIDER_TIMEOUT_SPIKE",
      "CACHE_ISOLATION_REJECTION",
      "ATTACHMENT_AUTHORIZATION_FAILURE",
      "ASSESSMENT_LEAK",
      "TELEMETRY_LOSS",
      "PROPOSAL_SAFETY_REJECTION",
    ]);
  });
});
