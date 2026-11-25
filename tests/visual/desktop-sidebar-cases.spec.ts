import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ARTIFACT_DIR =
  process.env.SIDEBAR_SCREENSHOT_DIR ||
  "artifacts/visual-quality/desktop-sidebar-cases";

async function captureCase(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(200);
  const path = `${ARTIFACT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: false, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

test.describe("Desktop sidebar Option 2 visual verification", () => {
  test("captures all desktop sidebar cases without layout errors", async ({ page }, info) => {
    test.skip(info.project.name === "mobile-380", "Desktop cases run on desktop project");
    await page.setViewportSize({ width: 1280, height: 820 });

    const cases: Array<{
      id: string;
      assertText: string;
    }> = [
      { id: "student-global", assertText: "Komunitas" },
      { id: "student-global-collapsed", assertText: "Dashboard Siswa" },
      { id: "student-course", assertText: "Kembali ke Dashboard" },
      { id: "student-course-collapsed", assertText: "Dokumen Matematika I (MA1101)" },
      { id: "student-course-pka", assertText: "Program PKA" },
      { id: "tutor-global", assertText: "Pengajaran" },
      { id: "tutor-course", assertText: "Kembali ke Pengajaran" },
      { id: "admin-course", assertText: "Kembali ke Mata kuliah" },
    ];

    for (const c of cases) {
      await page.addInitScript(() => {
        window.localStorage.clear();
      });
      const response = await page.goto(`/visual-fixtures/desktop-sidebar-cases?case=${c.id}`, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      const sidebar = page.locator("aside[data-desktop-sidebar]").first();
      await expect(sidebar).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(c.assertText).first()).toBeVisible({ timeout: 10_000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      ).toBe(true);
      await captureCase(page, info, c.id);
    }
  });

  test("preserves mobile navigation chrome at 380px without rendering desktop sidebar", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile-380", "Mobile check runs on mobile-380 project");
    await page.setViewportSize({ width: 380, height: 780 });
    const response = await page.goto("/visual-fixtures/desktop-sidebar-cases?case=student-mobile", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await expect(page.locator("aside[data-desktop-sidebar]")).toHaveCount(0);
    await expect(page.locator("[data-mobile-navbar]")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-mobile-bottom-nav]")).toBeVisible({ timeout: 20_000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    ).toBe(true);
    await captureCase(page, info, "student-mobile-380");
  });
});
