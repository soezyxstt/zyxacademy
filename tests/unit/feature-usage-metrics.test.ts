import { describe, expect, test } from "bun:test";
import {
  aggregateFeatureUsage,
  FEATURE_USAGE_KEYS,
  type FeatureSourceSnapshot,
  type FeatureUsageKey,
} from "@/lib/feature-usage-engine";

const emptySnap = (): FeatureSourceSnapshot => ({
  events: 0,
  previousEvents: 0,
  userIds: [],
  lastUsedEpochSeconds: 0,
  daily: [],
});

function baseSources(): Record<FeatureUsageKey, FeatureSourceSnapshot[]> {
  return Object.fromEntries(
    FEATURE_USAGE_KEYS.map((key) => [key, [emptySnap()]])
  ) as Record<FeatureUsageKey, FeatureSourceSnapshot[]>;
}

describe("aggregateFeatureUsage", () => {
  test("merges canonical and legacy flashcard/material sources without double-counting users", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const windowStart = new Date("2026-11-17T12:00:00Z");
    const sources = baseSources();

    sources.flashcard = [
      {
        events: 3,
        previousEvents: 2,
        userIds: ["u1"],
        lastUsedEpochSeconds: Math.floor(new Date("2026-11-22T10:00:00Z").getTime() / 1000),
        daily: [{ date: "2026-11-22", count: 3 }],
      },
      {
        events: 7,
        previousEvents: 3,
        userIds: ["u1", "u2"],
        lastUsedEpochSeconds: Math.floor(new Date("2026-11-24T09:00:00Z").getTime() / 1000),
        daily: [
          { date: "2026-11-22", count: 2 },
          { date: "2026-11-24", count: 5 },
        ],
      },
    ];

    sources.materi = [
      {
        events: 4,
        previousEvents: 4,
        userIds: ["u1"],
        lastUsedEpochSeconds: Math.floor(new Date("2026-11-23T08:00:00Z").getTime() / 1000),
        daily: [{ date: "2026-11-23", count: 4 }],
        detailCount: 2,
      },
      {
        events: 6,
        previousEvents: 1,
        userIds: ["u2", "u3"],
        lastUsedEpochSeconds: Math.floor(new Date("2026-11-24T11:00:00Z").getTime() / 1000),
        daily: [{ date: "2026-11-24", count: 6 }],
        detailCount: 5,
      },
    ];

    sources.diskusi = [
      {
        events: 5,
        previousEvents: 2,
        userIds: ["u2", "u4"],
        lastUsedEpochSeconds: Math.floor(new Date("2026-11-24T10:00:00Z").getTime() / 1000),
        daily: [{ date: "2026-11-24", count: 5 }],
        detailCount: 2,
      },
    ];

    const result = aggregateFeatureUsage({
      rangeDays: 7,
      now,
      windowStart,
      sourcesByFeature: sources,
    });

    expect(result.rows.map((r) => r.key)).toHaveLength(FEATURE_USAGE_KEYS.length);
    expect(result.totals.activeUsers).toBe(4);
    expect(result.totals.events).toBe(25);

    const flashcard = result.rows.find((r) => r.key === "flashcard")!;
    expect(flashcard.events).toBe(10);
    expect(flashcard.previousEvents).toBe(5);
    expect(flashcard.trendPercent).toBe(100);
    expect(flashcard.users).toBe(2); // u1 deduplicated across legacy + canonical
    expect(flashcard.adoptionPercent).toBe(50);
    expect(flashcard.eventsPerUser).toBe(5);
    expect(flashcard.lastUsedAt).toBe("2026-11-24T09:00:00.000Z");

    const materi = result.rows.find((r) => r.key === "materi")!;
    expect(materi.events).toBe(10);
    expect(materi.detailCount).toBe(7);
    expect(materi.users).toBe(3);

    const diskusi = result.rows.find((r) => r.key === "diskusi")!;
    expect(diskusi.events).toBe(5);
    expect(diskusi.detailCount).toBe(2);

    const day22 = result.daily.find((d) => d.date === "2026-11-22")!;
    expect(day22.flashcard).toBe(5); // 3 legacy + 2 canonical
    const day24 = result.daily.find((d) => d.date === "2026-11-24")!;
    expect(day24.flashcard).toBe(5);
    expect(day24.materi).toBe(6);
    expect(day24.diskusi).toBe(5);
  });
});
