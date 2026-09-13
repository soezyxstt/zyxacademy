import { expect, test, type Page, type TestInfo } from "@playwright/test";

test.setTimeout(90_000);

async function capture(page: Page, info: TestInfo, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(async () => { await document.fonts.ready; });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  const path = info.outputPath(`screenshots/${name}.png`);
  if (name.startsWith("landing")) {
    // Capture the document region without scrolling the fixed navbar over it.
    await page.evaluate(() => window.scrollTo(0, 0));
    const clip = await page.locator('[aria-labelledby="pricing-preview-heading"]').boundingBox();
    await page.screenshot({ path, fullPage: true, clip: clip!, animations: "disabled" });
  } else {
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
  }
  await info.attach(name, { contentType: "image/png", path });
}

for (const [name, route] of [
  ["plans", "/plans"],
  ["landing", "/"],
  ["dashboard", "/visual-fixtures/plan-pricing"],
  ["onboarding", "/visual-fixtures/plan-pricing?surface=onboarding"],
] as const) {
  test(`${name} introductory and regular prices`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.clock.install({ time: new Date("2026-10-11T23:59:50+07:00") });
    await page.clock.pauseAt(new Date("2026-10-11T23:59:50+07:00"));
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(new URL(route, "http://local").pathname);
    const prices = page.locator("[data-plan-price]");
    await expect(prices).toHaveCount(3, { timeout: 15_000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Let entrance animations settle even while the campaign clock is paused.
    await page.clock.runFor(1000);
    await expect(page.getByText("40% off", { exact: true })).toHaveCount(3);
    await expect(prices.first()).toContainText(
      name === "onboarding"
        ? "Total Rp 1.000.000"
        : name === "plans"
          ? "Total Rp 1.170.000"
          : name === "landing"
            ? "Rp 390.000"
            : "Rp 1.170.000",
    );
    await expect(prices.first().locator("s")).toHaveText(
      name === "onboarding"
        ? "Rp 333.333"
        : name === "plans"
          ? "Rp 650.000"
          : name === "landing"
            ? "Rp 650.000"
            : "Rp 1.950.000",
    );
    await expect(prices.first().locator("s")).toHaveCSS("text-decoration-line", "line-through");
    expect(await page.getByText("40% off", { exact: true }).first().evaluate((element) =>
      parseFloat(getComputedStyle(element).borderTopRightRadius) < element.getBoundingClientRect().height / 2,
    )).toBe(true);
    if (name === "plans") {
      await expect(page.locator("article h3")).toHaveText(["Minimal", "Essential", "Premium", "Free", "Custom"]);
    }
    await capture(page, info, `${name}-intro`);
    await page.clock.fastForward(11000);
    await expect(page.getByText("40% off", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Harga perkenalan sampai/)).toHaveCount(0);
    await expect(prices.locator("s")).toHaveCount(0);
    await expect(prices.first()).toContainText(name === "onboarding" ? "Total Rp 1.666.667" : name === "plans" ? "Total Rp 1.950.000" : "Rp 1.950.000");
    await capture(page, info, `${name}-regular`);

    if (name === "plans") {
      const before = await prices.first().innerText();
      await page.getByRole("button", { name: "Tambah jumlah orang" }).click();
      await page.getByRole("button", { name: "Tambah mata kuliah", exact: true }).click();
      await expect(prices.first()).not.toHaveText(before);
      const paidCard = page.locator("article").filter({ has: page.locator('[data-plan-price="minimal"]') });
      const href = await paidCard.getByRole("link", { name: "Tanya paket via WhatsApp" }).getAttribute("href");
      const message = new URL(href!).searchParams.get("text")!;
      expect(message).toContain("4 orang");
      expect(message).not.toContain("40%");
      await page.getByRole("button", { name: "Daftar matkul (4)", exact: true }).click();
      await capture(page, info, "plans-regular-configured-open");
    }
    expect(errors).toEqual([]);
  });
}

test("plans intermediate breakpoints", async ({ page }, info) => {
  test.skip(info.project.name !== "laptop-fhd-125", "One pass per intermediate width");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.clock.install({ time: new Date("2026-09-15T12:00:00+07:00") });
  const response = await page.goto("/plans", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/plans");
  await expect(page.locator("[data-plan-price]")).toHaveCount(3, { timeout: 15_000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 864 });
    await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });
    await expect(page.getByText("40% off", { exact: true })).toHaveCount(3);
    expect(await page.locator("[data-plan-price] p").evaluateAll((elements) =>
      elements.filter((element) => element.scrollWidth > element.clientWidth).map((element) => element.textContent),
    )).toEqual([]);
    await capture(page, info, `plans-intro-${width}`);
  }
  expect(errors).toEqual([]);
});

test("compact pricing in dark mode", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.clock.install({ time: new Date("2026-09-15T12:00:00+07:00") });
  await page.emulateMedia({ colorScheme: "dark" });
  const response = await page.goto("/plans", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/plans");
  await expect(page.locator("[data-plan-price]")).toHaveCount(3, { timeout: 15_000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await capture(page, info, "plans-intro-dark");
  expect(errors).toEqual([]);
});
