import { expect, test } from "@playwright/test";
test.setTimeout(120_000);
test("weekly streak follows each fictional course history", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [course, name] of [["fictional-berpikir", "one-day"], ["fictional-matematika", "six-days"]]) {
    expect((await page.goto(`/id/demo/overview?course=${course}`, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
    await expect(page.locator("#main-content > div").first()).toHaveCSS("opacity", "1");
    if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
    await expect(page.getByText(name === "one-day" ? "1 hari" : "6 hari").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.screenshot({ path: info.outputPath(`screenshots/${name}.png`), fullPage: true, animations: "disabled" });
  }
  expect(errors).toEqual([]);
});
