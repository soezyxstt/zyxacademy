import { expect, test } from "@playwright/test";

// Exercise remote thumbnails through the existing local fixture.
test("video thumbnails retain their sizing in the playlist and editor", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.route(/https:\/\/(?:img|i)\.youtube\.com\/.*/, (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#167b70"/></svg>',
  }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/visual-fixtures/video-player");
  await expect(page.locator("[data-fixture-ready='true']")).toBeVisible();
  await page.addStyleTag({ content: "*, *::before, *::after { animation-duration: 0s !important; transition: none !important; }" });
  const player = page.locator("[data-slot='dialog-content']").first();
  await player.getByRole("button", { name: /Daftar video/i }).first().click();
  await expect(page.locator("aside[aria-label='Daftar video']")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("playlist-thumbnails.png"), animations: "disabled" });
  await player.getByRole("button", { name: /Tutup pemutar video/i }).evaluate((button) => (button as HTMLButtonElement).click());
  await page.getByTestId("btn-open-admin-add").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('#youtube-url').fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  const preview = dialog.getByAltText("Pratinjau YouTube");
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("editor-thumbnail.png"), animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
