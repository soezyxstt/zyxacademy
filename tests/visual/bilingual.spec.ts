import { expect, test } from "@playwright/test";
import { stubVisualTelemetry } from "@/tests/visual/telemetry-stubs";
import { waitForVisualReadiness } from "@/tests/visual/visual-readiness";

test.setTimeout(90_000);
test.use({ reducedMotion: "reduce" });

test.beforeEach(async ({ page }) => {
  await stubVisualTelemetry(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
});

test("language switch keeps draft, quiz answer, and reader position", async ({ page }) => {
  const runtimeErrors: string[] = [];
  const networkFailures: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (!request.failure()?.errorText.includes("ERR_ABORTED")) networkFailures.push(`${request.url()}: ${request.failure()?.errorText}`);
  });
  await page.goto("/visual-fixtures/bilingual?locale=id");
  await page.getByTestId("draft-input").fill("draft in progress");
  await page.getByRole("radio", { name: /option b|pilihan b/i }).check();
  const reader = page.getByTestId("reader-scroll");
  await reader.evaluate((element) => { element.scrollTop = 54; });

  await page.getByRole("combobox", { name: /language|bahasa/i }).click();
  await page.getByRole("option", { name: "English" }).click();
  await expect(page.getByTestId("locale-heading")).toHaveText("Bilingual state fixture");
  await expect(page.getByTestId("draft-input")).toHaveValue("draft in progress");
  await expect(page.getByTestId("quiz-answer")).toHaveText("b");
  await expect(reader).toHaveJSProperty("scrollTop", 54);

  await page.getByRole("link", { name: "English route" }).click();

  await expect(page.getByTestId("locale-heading")).toHaveText("Bilingual state fixture");
  await expect(page.getByTestId("draft-input")).toHaveValue("draft in progress");
  await expect(page.getByTestId("quiz-answer")).toHaveText("b");
  await expect(reader).toHaveJSProperty("scrollTop", 54);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await waitForVisualReadiness(page);
  await page.screenshot({ path: test.info().outputPath("bilingual-state.png"), fullPage: true });
  await page.getByRole("link", { name: "Indonesia route" }).click();
  await expect(page.getByTestId("locale-heading")).toHaveText("Uji perpindahan bahasa");
  await expect(page.getByTestId("draft-input")).toHaveValue("draft in progress");
  await expect(page.getByTestId("quiz-answer")).toHaveText("b");
  await expect(reader).toHaveJSProperty("scrollTop", 54);
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  expect(runtimeErrors).toEqual([]);
  expect(networkFailures).toEqual([]);
  const width = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
});

test("explicit locale menu follows the same public URL and keeps its query and hash", async ({ page }) => {
  await page.goto("/en/plans?campaign=fixture#plans");
  const mobileMenu = page.getByRole("button", { name: /open menu|buka menu/i });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page.getByRole("combobox", { name: /language|bahasa/i }).click();
  await page.getByRole("option", { name: "Bahasa Indonesia" }).click();
  await expect(page).toHaveURL(/\/id\/plans\?campaign=fixture#plans$/);
});

test("guest language selection persists in the locale cookie across reload", async ({ page, context }) => {
  await page.goto("/visual-fixtures/bilingual?mode=cookie");
  await page.getByRole("combobox", { name: /language|bahasa/i }).click();
  await page.getByRole("option", { name: "English" }).click();
  await expect(page.getByTestId("locale-heading")).toHaveText("Bilingual state fixture");
  await expect.poll(async () => (await context.cookies()).find((cookie) => cookie.name === "zyx_locale")?.value).toBe("en");

  await page.reload();
  await expect(page.getByTestId("locale-heading")).toHaveText("Bilingual state fixture");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const width = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  await waitForVisualReadiness(page);
  await page.screenshot({ path: test.info().outputPath("bilingual-cookie.png"), fullPage: true });
});
