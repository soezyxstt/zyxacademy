import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const ROUTE = "/visual-fixtures/video-player";

test.describe("Video Player Modal Visuals", () => {
  test("capture default player modal and episode drawer", async ({ page }, testInfo) => {
    // Navigate to visual fixture
    await page.goto(ROUTE, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.locator("[data-fixture-ready='true']")).toBeVisible();

    // Verify modal elements are visible
    const dialog = page.locator("[data-slot='dialog-content']");
    await expect(dialog).toBeVisible();
    await expect(page.getByText("Bagian A - Soal 1 s.d. 5")).toBeVisible();

    // Allow fonts and player placeholder to settle
    await page.waitForTimeout(1000);

    // 1. Capture default modal appearance
    const defaultScreenshotPath = testInfo.outputPath("video-player-default.png");
    await page.screenshot({ path: defaultScreenshotPath });
    await testInfo.attach("video-player-default", { path: defaultScreenshotPath, contentType: "image/png" });

    // 2. Click "Daftar Video" to open episode drawer
    const drawerTrigger = dialog.getByRole("button", { name: /Daftar Video/i }).first();
    await expect(drawerTrigger).toBeVisible();
    await drawerTrigger.click();

    // Wait for slide-in drawer
    const drawer = page.locator("aside[aria-label='Daftar video']");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Putar otomatis berikutnya")).toBeVisible();
    await page.waitForTimeout(500);

    // Capture drawer open appearance
    const drawerScreenshotPath = testInfo.outputPath("video-player-drawer-open.png");
    await page.screenshot({ path: drawerScreenshotPath });
    await testInfo.attach("video-player-drawer-open", { path: drawerScreenshotPath, contentType: "image/png" });

    // Verify height boundary
    const boundingBox = await dialog.boundingBox();
    const viewportSize = page.viewportSize();
    if (boundingBox && viewportSize) {
      expect(boundingBox.height).toBeLessThanOrEqual(viewportSize.height * 0.96);
    }
  });
});
