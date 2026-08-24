import { describe, it, expect } from "bun:test";
import { executeToolCall } from "@/lib/admin-ops-ai/tools";
import { introspectDbSchema } from "@/lib/admin-ops-ai/schema-introspection";

describe("Zyx Ops AI Tools & Schema Introspection", () => {
  it("introspects known tables in database schema", async () => {
    const allSchema = await introspectDbSchema();
    expect(allSchema.tables.length).toBeGreaterThan(3);

    const userTable = await introspectDbSchema("user");
    expect(userTable.tables.length).toBe(1);
    expect(userTable.tables[0].tableName).toBe("user");
    expect(userTable.tables[0].columns.some((c) => c.name === "role")).toBe(true);
  });

  it("handles navigate_admin tool properly", async () => {
    const res = await executeToolCall("navigate_admin", { destination: "flags" });
    expect(res.data).toBeDefined();
    expect((res.data as any).href).toBe("/admin/ops/flags");
  });

  it("generates a structured proposal for create_token", async () => {
    const res = await executeToolCall("propose_create_token", {
      courseIds: "kalkulus-1,fisika-dasar",
      capacity: "4",
    });

    expect(res.proposal).toBeDefined();
    expect(res.proposal?.type).toBe("create_token");
    expect(res.proposal?.status).toBe("pending");
    expect(res.proposal?.params.capacity).toBe(4);
  });

  it("generates a structured proposal for toggle_flag", async () => {
    const res = await executeToolCall("propose_toggle_flag", {
      flagKey: "FEATURE_PKA",
      enabled: "true",
      reason: "Testing toggle flag",
    });

    expect(res.proposal).toBeDefined();
    expect(res.proposal?.params.flagKey).toBe("FEATURE_PKA");
    expect(res.proposal?.params.enabled).toBe(true);
  });
});

