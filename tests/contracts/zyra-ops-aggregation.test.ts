import { describe, expect, test } from "bun:test";
import { ZyraOpsMetricsSchema, zyraOpsDayStart } from "@/lib/zyra/ops";
import { zyraLatencyBucket, zyraOperationalFingerprint, zyraSizeBucket } from "@/lib/zyra/ops/telemetry";

describe("Zyra ops aggregation", () => {
  test("keeps operational buckets bounded and fingerprints opaque", () => {
    expect(zyraOperationalFingerprint("student@example.com")).toMatch(/^[a-f0-9]{16}$/);
    expect(zyraOperationalFingerprint("student@example.com")).toBe(zyraOperationalFingerprint("student@example.com"));
    expect(zyraLatencyBucket(100)).toBe("lt_250ms");
    expect(zyraLatencyBucket(1_500)).toBe("1s_3s");
    expect(zyraLatencyBucket(-1)).toBe("unknown");
    expect(zyraSizeBucket(0)).toBe("none");
    expect(zyraSizeBucket(17 * 1024 * 1024)).toBe("gt_16mb");
    expect(zyraSizeBucket(undefined)).toBe("unknown");
  });

  test("requires four masked project slots and unknown external balance", () => {
    const metrics = ZyraOpsMetricsSchema.parse({
      checkedAt: "2026-08-12T00:00:00.000Z",
      externalUsageUnknown: true,
      projectSlotCount: 4,
      projectSlots: [1, 2, 3, 4].map((slot) => ({ slot, alias: "masked", health: "unknown" })),
      ledger: { committedProviderTurns: 2, activeReservations: 1, refundedReservations: 0, cacheSavedTurns: 3 },
      image: { uploaded: 1, dispatched: 1, expired: 0, failed: 0 },
      traces: { success: 2, failure: 0, validationViolations: 0 },
      events: [],
      configuredModels: [{ model: "gemini-3.1-flash-lite", initialUsableRpd: 1800 }],
    });
    expect(metrics.externalUsageUnknown).toBe(true);
    expect(metrics.alerts).toEqual([]);
    expect(metrics.capacity.modelPools).toEqual([]);
  });

  test("uses the Asia/Jakarta calendar day for aggregation", () => {
    expect(zyraOpsDayStart(new Date("2026-08-11T16:59:59.000Z")).toISOString()).toBe("2026-08-10T17:00:00.000Z");
    expect(zyraOpsDayStart(new Date("2026-08-11T17:00:00.000Z")).toISOString()).toBe("2026-08-11T17:00:00.000Z");
  });
});
