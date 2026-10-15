import { expect, test, type Page } from "@playwright/test";

const route = "/visual-fixtures/structured-article?mode=student&section=bilangan-real-dan-representasi";

async function selectText(page: Page, length: number) {
  return page.locator("main p").filter({ hasText: "Bilangan real mencakup" }).first().evaluate((element, count) => {
    const node = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, count);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return selection.toString();
  }, length);
}

for (const breakpoint of [false, true]) {
test(`article selection keeps mobile quote and desktop popover${breakpoint ? " at breakpoint" : ""}`, async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  if (breakpoint) await page.setViewportSize({ width: testInfo.project.name === "mobile-380" ? 767 : 768, height: 864 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route("**/api/student/articles/visual-article/progress", route => route.fulfill({ json: { maxReadPercent: 50, completed: false, timeSpentSeconds: 120 } }));
  await page.route("**/api/zyra/allowance**", route => route.fulfill({ json: { summary: {
    peran: "murid", appDay: "2026-10-15", providerTurnsUsed: 0, providerTurnsRemaining: 1,
    totalInteractionsUsed: 0, totalInteractionsRemaining: 1, premiumTurnsUsed: 0,
    premiumTurnsRemaining: 0, cacheSaves: 0, nextResetAt: "2026-10-15T17:00:00Z", accessTier: "free",
  } } }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/visual-fixtures/structured-article");
  const paragraph = page.locator("main p").filter({ hasText: "Bilangan real mencakup" }).first();
  await expect(paragraph).toBeVisible();
  await page.waitForLoadState("networkidle");
  await paragraph.scrollIntoViewIfNeeded();
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => paragraph.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  })).toBe(true);
  const bar = page.locator('[data-slot="zyra-mobile-selection"]');
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`screenshots/${name}.png`), animations: "disabled", caret: "initial" });
  };
  await expect(bar).toHaveCount(0);
  await capture("unselected");
  await selectText(page, 20);
  if (testInfo.project.name === "mobile-380") {
    await expect(bar).toBeVisible();
    await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
    const quote = await selectText(page, 54);
    await capture("selected");
    await bar.getByRole("button", { name: "Tutup Tanya Zyra" }).click();
    await expect(bar).toHaveCount(0);
    await capture("dismissed");
    await selectText(page, 54);
    await expect(bar).toBeVisible();
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await expect(bar).toHaveCount(0);
    await selectText(page, 54);
    await expect(bar).toBeVisible();
    // Simulate native selection disappearing between touch-down and click.
    await bar.getByRole("button", { name: "Tanya Zyra", exact: true }).dispatchEvent("pointerdown");
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await bar.getByRole("button", { name: "Tanya Zyra", exact: true }).tap();
    await expect(bar).toHaveCount(0);
    await expect(page.getByPlaceholder("Tanyakan materi atau rumus...")).toHaveValue(`Bantu saya memahami bagian ini: "${quote}".`);
    await expect(page.getByRole("button", { name: "Hapus kutipan" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Zyra Learning Assistant" }).locator("footer")).toContainText(quote);
    await capture("drawer-with-quote");
  } else {
    await paragraph.dispatchEvent("mouseup");
    const popover = page.locator('[data-slot="popover-content"]');
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("button", { name: "Tanya Zyra", exact: true })).toBeVisible();
    await expect(bar).toHaveCount(0);
    await capture("desktop-popover");
  }
  expect(errors).toEqual([]);
});
}
