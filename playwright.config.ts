import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const useExternalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: "./tests/visual",
  outputDir: "./artifacts/visual-quality/results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: "artifacts/visual-quality/report",
      },
    ],
  ],
  use: {
    baseURL,
    browserName: "chromium",
    colorScheme: "light",
    locale: "id-ID",
    screenshot: "only-on-failure",
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE || undefined,
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-380",
      use: {
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        viewport: { width: 380, height: 844 },
      },
    },
    {
      name: "laptop-fhd-125",
      use: {
        deviceScaleFactor: 1,
        viewport: { width: 1536, height: 864 },
      },
    },
  ],
  webServer: useExternalServer
    ? undefined
    : {
        command: "bun run dev",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: baseURL,
      },
});
