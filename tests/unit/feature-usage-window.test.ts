import { expect, mock, test } from "bun:test";

const predicates: any[] = [];
let answers: unknown[][] = [];
const query = () => ({
  rows: answers.shift() ?? [],
  from() { return this; },
  innerJoin() { return this; },
  where(value: unknown) { predicates.push(...(Array.isArray(value) ? value : [value])); return this; },
  groupBy() { return this; },
  then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(resolve(this.rows)); },
});
mock.module("@/db", () => ({ db: { select: query, selectDistinct: query } }));
mock.module("@/db/schema", () => ({
  bookings: {}, chatSessions: {}, discussionMessages: {}, discussionThreads: {},
  flashcardReviews: {}, kemajuanBacaArtikel: {}, kemajuanFlashcardMurid: {},
  liveQuizResults: {}, reviewFlashcard: {}, studentMaterialProgress: {},
  studentQuizAttempts: {}, submissions: {}, tutorChatMessages: {},
}));
mock.module("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: () => {},
  isNotNull: () => {},
  isNull: () => {},
  ne: () => {},
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));
mock.module("@/lib/date-utils", () => ({
  elapsedDaysAgo: (days: number, date: Date) => new Date(date.getTime() - days * 86_400_000),
  formatIsoDateUtc: (date: Date) => date.toISOString().slice(0, 10),
}));

const { featureUsageDailyDates, getFeatureUsageMetrics } = await import("@/lib/feature-usage-metrics");

test("feature usage includes both partial UTC dates in a rolling window", () => {
  const dates = featureUsageDailyDates(7, new Date("2026-11-14T12:00:00Z"));
  expect(dates).toHaveLength(8);
  expect(dates[0]).toBe("2026-11-07");
  expect(dates[7]).toBe("2026-11-14");
});

test("totals, daily counts and unique users share a bounded window that excludes future records", async () => {
  predicates.length = 0;
  const before = Date.now() / 1000;
  await getFeatureUsageMetrics(7);
  const windows = predicates.filter(value => value?.strings?.join("").includes("to_timestamp"));
  expect(windows).toHaveLength(42);
  const newestEnd = Math.max(...windows.map(value => value.values[3]));
  const sharedBoundary = newestEnd - 7 * 86400;
  expect(newestEnd).toBeGreaterThanOrEqual(before);
  expect(newestEnd).toBeLessThanOrEqual(Date.now() / 1000);
  expect(windows.filter(value => value.values[3] === newestEnd)).toHaveLength(32);
  expect(windows.filter(value => value.values[3] === sharedBoundary)).toHaveLength(10);
  for (const { strings, values } of windows) {
    expect(strings.join("")).toContain("< to_timestamp");
    expect(values[3] - values[1]).toBeCloseTo(7 * 86400, 4);
  }
});

test("reports no growth percentage when the previous period had no events", async () => {
  answers = [[{ events: 3, users: 1 }]];
  const metrics = await getFeatureUsageMetrics(7);
  expect(metrics.totals.events).toBe(3);
  expect(metrics.totals.trendPercent).toBeNull();
  expect(metrics.rows.find(row => row.key === "materi")?.trendPercent).toBeNull();
  expect(metrics.insights.fastestGrowing).toBeNull();
});
