import { expect, test } from "bun:test";
import { medianModelLatency, modelDate, sortModelsByDate } from "@/lib/ai/provider/model-observations";
import type { ModelId } from "@/lib/ai/provider/model-registry";

test("orders by real metadata, keeps undated models last and does not infer age from version", () => {
  const older: ModelId = "gateway:openai:gpt-99-fixture", newer: ModelId = "gateway:openai:gpt-2-fixture", unknown: ModelId = "gateway:muse:muse-500-fixture";
  const now = Date.now(), olderDate = modelDate(older, Math.floor(now / 1000) - 100)!, newerDate = modelDate(newer, Math.floor(now / 1000) - 1)!;
  expect(sortModelsByDate([unknown, older, newer], { [older]: olderDate, [newer]: newerDate })).toEqual([newer, older, unknown]);
  expect(newerDate.kind).toBe("created");
  expect(modelDate(unknown, 0)).toBeUndefined();
  expect(modelDate(unknown, Math.floor(now / 1000) + 86400)).toBeUndefined();
  expect(modelDate("gateway:gemini:gemini-4-neon")?.kind).toBe("released");
  expect(modelDate("gateway:openai:gpt-6.2-sol", 1793577600, Date.parse("2026-11-22"))).toMatchObject({ kind: "released", timestamp: Date.parse("2026-11-17") });
});
test("requires all three successful observations before publishing a median", () => {
  const value = { checkedAt: Date.now(), samples: [4000, 100, 900], status: "complete" as const };
  expect(medianModelLatency(value)).toBe(900);
  expect(value.samples).toEqual([4000, 100, 900]);
  expect(medianModelLatency({ ...value, samples: [1, 2], status: "incomplete" })).toBeUndefined();
});
