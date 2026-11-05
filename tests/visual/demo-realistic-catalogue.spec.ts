import { expect, test, type Page, type TestInfo } from "@playwright/test";

test.setTimeout(180_000);

async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator("#main-content")).toBeVisible();
  await expect.poll(async () => (await page.locator("#main-content").innerText()).trim().length).toBeGreaterThan(20);
  await expect(page.locator("#main-content > div").first()).toHaveCSS("opacity", "1");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: info.outputPath(`screenshots/${name}.png`), fullPage: true, animations: "disabled" });
}
test("realistic chapter catalogue and locked later materials", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [route, name] of [["overview?course=fictional-matematika", "matematika-overview"], ["overview?course=fictional-berpikir", "berpikir-overview"], ["documents?course=fictional-matematika", "documents-first"]]) {
    expect((await page.goto(`/id/demo/${route}`, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
    await capture(page, info, name);
  }
  await page.getByText("Bab 2: Penerapan Matematika I", { exact: true }).first().click();
  await expect(page.getByText("Materi Bab 2: Penerapan Matematika I")).toBeVisible();
  await expect(page.getByText(/terkunci/i).first()).toBeVisible();
  await capture(page, info, "documents-later-locked");
  await page.getByText("Materi Bab 2: Penerapan Matematika I").click();
  await expect(page).toHaveURL(/\/demo\/documents\?course=fictional-matematika/);
  expect(await page.locator('a[href*="/storage/"]').count()).toBe(0);
  expect(errors).toEqual([]);
});
