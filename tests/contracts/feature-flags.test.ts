import { describe, expect, test } from "bun:test";
import {
  isFeatureFlagActive,
  getAllFeatureFlagsStatus,
  KNOWN_FEATURE_FLAGS,
} from "@/lib/feature-flags";

describe("Feature Flags Registry Contract", () => {
  test("isFeatureFlagActive evaluates truthy values correctly", () => {
    expect(isFeatureFlagActive("1")).toBe(true);
    expect(isFeatureFlagActive("true")).toBe(true);
    expect(isFeatureFlagActive("TRUE")).toBe(true);
    expect(isFeatureFlagActive(" 1 ")).toBe(true);

    expect(isFeatureFlagActive("0")).toBe(false);
    expect(isFeatureFlagActive("false")).toBe(false);
    expect(isFeatureFlagActive("")).toBe(false);
    expect(isFeatureFlagActive(undefined)).toBe(false);
  });

  test("getAllFeatureFlagsStatus catalog completeness", () => {
    const statuses = getAllFeatureFlagsStatus();
    expect(statuses).toHaveLength(KNOWN_FEATURE_FLAGS.length);

    const keys = statuses.map((s) => s.key);
    for (const known of KNOWN_FEATURE_FLAGS) {
      expect(keys).toContain(known.key);
    }
  });

  test("Feature flags contain required human-readable metadata", () => {
    for (const flag of KNOWN_FEATURE_FLAGS) {
      expect(flag.key).toMatch(/^FEATURE_/);
      expect(flag.name.length).toBeGreaterThan(0);
      expect(flag.description.length).toBeGreaterThan(0);
      expect(flag.categoryLabel.length).toBeGreaterThan(0);
    }
  });
});
