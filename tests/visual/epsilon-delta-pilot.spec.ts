import { expect, test } from "@playwright/test";

for (const engine of ["jsxgraph", "legacy"]) test(`epsilon delta ${engine} coordinates tolerance, fallback and reset`, async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(`/visual-fixtures/epsilon-delta?engine=${engine}`);
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/visual-fixtures/epsilon-delta");
  const graph = page.getByRole("region", { name: "Limit fungsi kuadrat", exact: true });
  await expect(graph.locator(engine === "jsxgraph" ? '[data-testid="epsilon-delta-board"] svg' : "svg").first()).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => document.fonts.ready);
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`screenshots/${name}.png`), fullPage: true, animations: "disabled", caret: "initial" });
  };
  await capture("default-and-resolution-limited");
  const epsilon = graph.getByRole("slider", { name: "Toleransi epsilon", exact: true });
  await epsilon.fill("2");
  if (engine === "jsxgraph") {
    const probe = graph.getByRole("slider", { name: /Posisi x/ });
    await probe.focus();
    await probe.press("ArrowRight");
    await expect(probe).toHaveAttribute("aria-valuenow", "0.02");
    await expect(graph.getByTestId("epsilon-probe-readout")).toHaveAttribute("data-probe-y", "0.0004");
    expect(await graph.getByTestId("epsilon-probe-readout").locator(".katex").count()).toBeGreaterThanOrEqual(3);
  }
  expect(await graph.innerText()).not.toMatch(/\d(?:\.\d+)?e[-+]\d/i);
  await expect(graph.locator(".katex-error")).toHaveCount(0);
  await capture("changed-tolerance-and-probe");
  await graph.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(epsilon).toHaveValue("1");
  await capture("reset-tolerance");
  await graph.getByRole("button", { name: "Tampilkan tabel nilai" }).click();
  await expect(graph.getByRole("table")).toBeVisible();
  await capture("table-fallback");
  expect(failures).toEqual([]);
});
