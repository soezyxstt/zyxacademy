import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const ROUTE = "/visual-fixtures/video-player";

const ARTIFACT_DIR = "C:/Users/adiha/.gemini/antigravity/brain/ef42427b-bae1-457f-8b0e-4864a4301094";

function saveScreenshot(name: string, buffer: Buffer, testInfo: any) {
  const artifactPath = path.join(ARTIFACT_DIR, name);
  const outputPath = testInfo.outputPath(name);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, buffer);
  fs.writeFileSync(outputPath, buffer);
  testInfo.attach(name, { path: artifactPath, contentType: "image/png" });
}

test.describe("Video Player and Dual-Mode Admin Visuals", () => {
  test("capture player modal, playlist drawer, and dual-mode admin dialogs", async ({ page }, testInfo) => {
    // Navigate to visual fixture
    await page.goto(ROUTE, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.locator("[data-fixture-ready='true']")).toBeVisible();

    // 1. Capture default player modal appearance
    const dialog = page.locator("[data-slot='dialog-content']");
    await expect(dialog).toBeVisible();
    await expect(page.getByText("Bagian A - Soal 1 s.d. 5")).toBeVisible();
    await page.waitForTimeout(1000);

    const shot1 = await page.screenshot();
    saveScreenshot("video-player-modal.png", shot1, testInfo);

    // 2. Open Playlist Drawer
    const drawerTrigger = dialog.getByRole("button", { name: /Daftar Video/i }).first();
    await expect(drawerTrigger).toBeVisible();
    await drawerTrigger.click();

    const drawer = page.locator("aside[aria-label='Daftar video']");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Putar otomatis berikutnya")).toBeVisible();
    await page.waitForTimeout(600);

    const shot2 = await page.screenshot();
    saveScreenshot("video-player-playlist-drawer.png", shot2, testInfo);

    // Close player modal
    const closeBtn = page.getByRole("button", { name: "Tutup pemutar video" });
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(400);

    // 3. Open Admin Video Dialog (Add new video - YouTube mode default)
    await page.locator("[data-testid='btn-open-admin-add']").click();
    const adminDialog = page.locator("[role='dialog']");
    await expect(adminDialog).toBeVisible();
    await expect(page.getByText("Tambah Video Mata Kuliah")).toBeVisible();
    await page.waitForTimeout(500);

    const shot3 = await page.screenshot();
    saveScreenshot("admin-dialog-youtube-mode.png", shot3, testInfo);

    // 4. Switch to "Unggah Berkas" mode
    const uploadTab = adminDialog.getByRole("tab", { name: /Unggah Berkas/i });
    await expect(uploadTab).toBeVisible();
    await uploadTab.click();
    await expect(page.getByText("Pilih berkas video dari perangkat")).toBeVisible();
    await page.waitForTimeout(500);

    const shot4 = await page.screenshot();
    saveScreenshot("admin-dialog-upload-mode.png", shot4, testInfo);

    // Close admin dialog
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // 5. Open Admin Video Dialog editing existing R2 video
    await page.locator("[data-testid='btn-open-admin-r2']").click();
    await expect(adminDialog).toBeVisible();
    await expect(page.getByText("Edit Video")).toBeVisible();
    await expect(page.getByText("courses/ma1101/videos/sample.mp4")).toBeVisible();
    await page.waitForTimeout(500);

    const shot5 = await page.screenshot();
    saveScreenshot("admin-dialog-r2-editing.png", shot5, testInfo);
  });
});
