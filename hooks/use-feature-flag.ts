"use client";

import { useFeatureFlagEnabled } from "posthog-js/react";
import { env } from "@/lib/env";
import { isFeatureFlagActive } from "@/lib/feature-flags";

/**
 * Custom hook to safely evaluate feature flags.
 * First checks PostHog (matching uppercase FEATURE_PKA, lowercase feature_pka, or feature-pka),
 * then falls back to local env variable (`FEATURE_*`).
 *
 * @param flagKey The feature flag key (e.g., 'feature_pka', 'feature-pka', or 'FEATURE_PKA')
 * @param fallbackOptional Optional fallback boolean if neither PostHog nor env is set
 */
export function useFeatureFlag(flagKey: string, fallbackOptional?: boolean): boolean {
  const lowercaseSnakeKey = flagKey.toLowerCase().replace(/-/g, "_");
  const lowercaseKebabKey = flagKey.toLowerCase().replace(/_/g, "-");
  const uppercaseEnvKey = flagKey.toUpperCase().replace(/-/g, "_");

  // Try exact key match in PostHog first
  const posthogFlagPrimary = useFeatureFlagEnabled(flagKey);
  // Try lowercase snake_case (e.g. feature_pka)
  const posthogFlagSnake = useFeatureFlagEnabled(lowercaseSnakeKey);
  // Try lowercase kebab-case (e.g. feature-pka)
  const posthogFlagKebab = useFeatureFlagEnabled(lowercaseKebabKey);

  if (typeof posthogFlagPrimary === "boolean") return posthogFlagPrimary;
  if (typeof posthogFlagSnake === "boolean") return posthogFlagSnake;
  if (typeof posthogFlagKebab === "boolean") return posthogFlagKebab;

  // Fallback to local process.env / lib/env FEATURE_* flag
  const normalizedEnvKey = uppercaseEnvKey.startsWith("FEATURE_")
    ? uppercaseEnvKey
    : `FEATURE_${uppercaseEnvKey}`;

  const envObj = env as unknown as Record<string, string | undefined>;
  const rawEnvVal = envObj[normalizedEnvKey];

  if (rawEnvVal !== undefined) {
    return isFeatureFlagActive(rawEnvVal);
  }

  return fallbackOptional ?? false;
}
