import { expect, mock, test } from "bun:test";

const predicates: any[] = [];
const query = () => ({
  from() { return this; },
  where(value: unknown) { predicates.push(...(Array.isArray(value) ? value : [value])); return this; },
  groupBy() { return this; },
  then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(resolve([])); },
});
mock.module("@/db", () => ({ db: { select: query, selectDistinct: query } }));
mock.module("@/db/schema", () => ({
  chatSessions: {}, flashcardReviews: {}, liveQuizResults: {}, percobaanAsesmen: {},
  studentMaterialProgress: {}, studentQuizAttempts: {}, tutorChatMessages: {},
}));
mock.module("drizzle-orm", () => ({ and: (...values: unknown[]) => values, eq: () => {}, sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }) }));
mock.module("@/lib/date-utils", () => ({
  daysAgo: (days: number, date: Date) => new Date(date.getTime() - days * 86_400_000),
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
  expect(windows).toHaveLength(19);
  const ends = new Set(windows.map(value => value.values[3]));
  expect(ends.size).toBe(1);
  for (const { strings, values } of windows) {
    expect(strings.join("")).toContain("<= to_timestamp");
    expect(values[3]).toBeGreaterThanOrEqual(before);
    expect(values[3]).toBeLessThanOrEqual(Date.now() / 1000);
    expect(values[3] - values[1]).toBeGreaterThanOrEqual(7 * 86400);
    expect(values[3] - values[1]).toBeLessThan(7 * 86400 + 1);
  }
});
