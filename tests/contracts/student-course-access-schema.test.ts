import { describe, expect, it } from "bun:test";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "@/db/schema";

describe("student course access schema", () => {
  it("defines one additive demo-course marker with a singleton partial unique index", () => {
    const config = getTableConfig(schema.mataKuliah);
    const column = config.columns.find((item) => item.name === "is_demo");
    const index = config.indexes.find((item) => item.config.name === "mata_kuliah_single_demo_idx");

    expect(column?.notNull).toBe(true);
    expect(column?.hasDefault).toBe(true);
    expect(index?.config.unique).toBe(true);
    expect(index?.config.where).toBeDefined();
    expect(index?.config.columns.map((item) => "name" in item ? item.name : "")).toEqual(["is_demo"]);
  });

  it("defines a validated free or standard allowance tier and a tier-aware Zyra lookup index", () => {
    const config = getTableConfig(schema.aiAllowanceLeases);
    const column = config.columns.find((item) => item.name === "access_tier");
    const index = config.indexes.find((item) => item.config.name === "ai_allowance_leases_user_tier_feature_day_idx");
    const check = config.checks.find((item) => item.name === "ai_allowance_leases_access_tier_check");

    expect(column?.notNull).toBe(true);
    expect(column?.hasDefault).toBe(true);
    expect(index?.config.columns.map((item) => "name" in item ? item.name : "")).toEqual([
      "user_id",
      "access_tier",
      "feature",
      "app_day",
    ]);
    expect(check).toBeDefined();
  });
});
