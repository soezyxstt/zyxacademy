import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Isolated real-component fixture. It does not connect to a deployment. */
export default defineConfig({
  ...base,
  testMatch: "onboarding.spec.ts",
  metadata: { onboardingFixture: true },
  use: { ...base.use, baseURL: "http://127.0.0.1:4319" },
  webServer: {
    command: "node tests/visual/onboarding-harness/compile.cjs && node tests/visual/onboarding-harness/server.cjs",
    url: "http://127.0.0.1:4319",
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
