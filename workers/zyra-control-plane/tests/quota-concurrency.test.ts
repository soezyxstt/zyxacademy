import { describe, expect, test } from "bun:test";
import { QuotaLedger } from "../src/quota/ledger";
import { ensureQuotaSchema } from "../src/quota/schema";
import { BunSqliteHarness } from "./sqlite-harness";

describe("Plan 003 atomic quota selection", () => {
  test("100 reservations never exceed the four project ceilings", () => {
    const harness = new BunSqliteHarness();
    ensureQuotaSchema(harness);
    const ledger = new QuotaLedger(harness, () => Date.parse("2026-08-05T12:00:00.000Z"));
    const results = Array.from({ length: 100 }, (_, index) => ledger.reserve({
      idempotencyKey: `concurrent-${index}`,
      userHash: `${index.toString(16).padStart(2, "0")}`.repeat(32),
      role: "murid",
      feature: "concurrency-test",
      routeClass: "stable-fallback",
      modelId: "gemini-2.5-flash",
      cacheStatus: "miss"
    }));

    const accepted = results.filter((result) => result.status === "reserved");
    expect(accepted).toHaveLength(60);
    for (const result of accepted) {
      if (result.status === "reserved") {
        ledger.dispatch(result.lease.leaseId);
        ledger.commit({ leaseId: result.lease.leaseId, outcomeCode: "SUCCESS", outcomeClass: "success" });
      }
    }
    const counters = ledger.diagnostics().counters.filter((counter) => counter.modelId === "gemini-2.5-flash");
    const committed = counters.map((counter) => counter.committedCount);
    expect(committed).toEqual([15, 15, 15, 15]);
    expect(Math.max(...committed) - Math.min(...committed)).toBeLessThanOrEqual(3);
    harness.close();
  });
});

test("provider-managed models remain accounted for without artificial daily or minute ceilings", () => {
  const sql = new BunSqliteHarness();
  ensureQuotaSchema(sql);
  const ledger = new QuotaLedger(sql, () => Date.parse("2026-11-22T12:00:00Z"));
  for (let index = 0; index < 100; index++) {
    expect(ledger.reserve({ idempotencyKey: `dynamic-${index}`, userHash: "a".repeat(64), role: "murid", feature: "discussion-tutor",
      routeClass: "default", modelId: `gateway:openai:gpt-fixture-${index}`, cacheStatus: "bypass" }).status).toBe("reserved");
  }
  expect(ledger.diagnostics().counters.reduce((sum, row) => sum + row.reservedCount, 0)).toBe(100);
  sql.close();
});

test("text providers preserve feature permissions without the old five-request limit", () => {
  const harness = new BunSqliteHarness();
  try {
    ensureQuotaSchema(harness);
    const ledger = new QuotaLedger(harness, () => Date.parse("2026-08-05T12:00:00Z"));
    const reserve = (index: number, feature = "playground") => ledger.reserve({
      idempotencyKey: `pilot-${index}`, userHash: "a".repeat(64), role: "murid", feature,
      routeClass: "default", modelId: "compatible-text-pilot", cacheStatus: "miss",
    });
    expect(reserve(0, "chapter-summary").status).toBe("reserved");
    for (let index = 1; index <= 5; index++) {
      const result = reserve(index, index === 1 ? "zyra-pedagogy" : "playground");
      expect(result.status).toBe("reserved");
      if (result.status === "reserved") expect(result.lease.projectAlias).toBe("compatible-text");
    }
    expect(reserve(7, "weak-concept-guidance").status).toBe("reserved");
    expect(reserve(8, "unknown-feature").status).toBe("quota_exhausted");
    expect(reserve(6).status).toBe("reserved");
  } finally {
    harness.close();
  }
});

test("diagnostics count provider attempts for the current provider day and deduplicate shared projects", () => {
  const harness = new BunSqliteHarness();
  try {
    ensureQuotaSchema(harness);
    let time = Date.parse("2026-08-05T12:00:00Z");
    const ledger = new QuotaLedger(harness, () => time, ["shared", "shared"]);
    const reserved = ledger.reserve({
      idempotencyKey: "failed-primary", userHash: "a".repeat(64), role:"murid", feature:"playground",
      routeClass:"stable-fallback", modelId:"gemini-2.5-flash", cacheStatus:"miss",
    });
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") return;
    ledger.dispatch(reserved.lease.leaseId);
    ledger.commit({leaseId: reserved.lease.leaseId, outcomeCode:"HTTP_503", outcomeClass:"provider_5xx"});
    expect(ledger.diagnostics().projectGroupCount).toBe(1);
    expect(ledger.diagnostics().counters[0].committedCount).toBe(1);
    time += 86400000;
    expect(ledger.diagnostics().counters).toEqual([]);
  } finally { harness.close(); }
});

test("admin catalog probes consume shared group capacity and cannot select a foreign group", () => {
  const harness = new BunSqliteHarness();
  try {
    ensureQuotaSchema(harness);
    const ledger = new QuotaLedger(harness);
    const input = { userHash: "a".repeat(64), role: "admin", feature: "selector-smoke", modelId: "openai-gpt",
      routeClass: "default", cacheStatus: "bypass", probeProjectAlias: "openai", idempotencyKey: "probe" } as const;
    expect(ledger.reserve({ ...input, probeProjectAlias: "another-project" }).status).toBe("quota_exhausted");
    expect(ledger.reserve({ ...input, role: "murid" }).status).toBe("quota_exhausted");
    expect(ledger.reserve(input).status).toBe("reserved");
    for (let index = 1; index <= 5; index++) {
      const result = ledger.reserve({ ...input, modelId: "openai-gpt-2", feature: "playground", probeProjectAlias: undefined,
        idempotencyKey: "playground-" + index });
      expect(result.status).toBe("reserved");
    }
  } finally { harness.close(); }
});


test("discussion text providers reserve from their own quota group", () => {
  const harness = new BunSqliteHarness();
  try {
    ensureQuotaSchema(harness);
    const ledger = new QuotaLedger(harness);
    for (const [modelId, projectAlias] of [["openai-gpt", "openai"], ["meta-muse", "meta"]] as const) {
      const result = ledger.reserve({ userHash: "a".repeat(64), role: "murid", feature: "discussion-tutor",
        modelId, routeClass: "default", cacheStatus: "bypass", idempotencyKey: "discussion-" + modelId });
      expect(result.status).toBe("reserved");
      if (result.status === "reserved") expect(result.lease.projectAlias).toBe(projectAlias);
    }
  } finally { harness.close(); }
});
