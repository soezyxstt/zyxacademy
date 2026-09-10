import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { previewPlanTierKeys, previewPlanTiers } from "@/lib/plan-tiers";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("pricing preview parity", () => {
  test("preview package order is centralized", () => {
    expect(previewPlanTierKeys).toEqual(["minimal", "essential", "premium"]);
    expect(previewPlanTiers.map((tier) => tier.key)).toEqual(["minimal", "essential", "premium"]);
  });

  test("student dashboard and landing use the same plan preview component", () => {
    const dashboard = source("components/dashboard/plan-preview.tsx");
    const landing = source("components/landing/landing-pricing-preview.tsx");

    expect(dashboard).toContain("PlanPreviewGrid");
    expect(landing).toContain("PlanPreviewGrid");
    expect(dashboard).not.toContain("planTiers.filter");
    expect(landing).not.toContain("planTiers.filter");
  });
});
