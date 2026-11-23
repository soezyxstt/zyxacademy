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

  test("the registry retains the runtime gates and excludes the retired campaign flag", () => {
    expect(KNOWN_FEATURE_FLAGS.map(({ key }) => key)).toEqual([
      "FEATURE_REFLECTION_EMAIL",
      "FEATURE_LIVE",
      "FEATURE_DIKTAT_AI",
      "FEATURE_ZYRA_IMAGE_INPUT_V1",
      "FEATURE_ZYRA_SEMANTIC_CACHE_V1",
      "FEATURE_DRIVE_EDITOR_SYNC",
      "FEATURE_STRUCTURED_ARTICLE_READER_V1",
    ]);
  });

  test("status uses the runtime activation rules for image input and opt-in flags", () => {
    const keys = [
      "FEATURE_ZYRA_IMAGE_INPUT_V1",
      "FEATURE_ZYRA_SEMANTIC_CACHE_V1",
      "FEATURE_STRUCTURED_ARTICLE_READER_V1",
    ] as const;
    const previous = keys.map(key => process.env[key]);
    const status = (key: typeof keys[number]) => getAllFeatureFlagsStatus().find(flag => flag.key === key)?.enabled;
    try {
      delete process.env.FEATURE_ZYRA_IMAGE_INPUT_V1;
      process.env.FEATURE_ZYRA_SEMANTIC_CACHE_V1 = "true";
      process.env.FEATURE_STRUCTURED_ARTICLE_READER_V1 = "true";
      expect(status("FEATURE_ZYRA_IMAGE_INPUT_V1")).toBe(true);
      expect(status("FEATURE_ZYRA_SEMANTIC_CACHE_V1")).toBe(false);
      expect(status("FEATURE_STRUCTURED_ARTICLE_READER_V1")).toBe(true);
      process.env.FEATURE_ZYRA_IMAGE_INPUT_V1 = "0";
      process.env.FEATURE_ZYRA_SEMANTIC_CACHE_V1 = "1";
      expect(status("FEATURE_ZYRA_IMAGE_INPUT_V1")).toBe(false);
      expect(status("FEATURE_ZYRA_SEMANTIC_CACHE_V1")).toBe(true);
    } finally {
      for (const [index, key] of keys.entries()) {
        const value = previous[index];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
