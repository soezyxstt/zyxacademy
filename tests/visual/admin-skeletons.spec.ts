import { expect, test } from "@playwright/test";

for (const state of [
  "docs",
  "docs-loading",
  "article-loading",
  "catalog",
  "voucher",
  "quiz",
  "review",
  "ops",
  "participants",
  "leaderboard",
  "usage",
  "forms",
  "questions",
  "media-grid",
  "media-list",
  "links",
  "document",
  "route-forms",
  "route-form-detail",
  "route-meet",
  "route-meet-detail",
  "route-ops",
  "route-flags",
  "route-analytics",
  "route-keys",
  "route-short-links",
]) {
  test(`admin ${state}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/visual-fixtures/admin-skeletons?state=${state}`);
    await expect(page).toHaveURL(new RegExp(`state=${state}$`));
    if (state !== "docs")
      await expect(page.getByRole("status").first()).toBeVisible();
    else
      await expect(
        page.getByRole("textbox", { name: /dokumentasi|documentation/i }),
      ).toBeVisible();
    await page.addStyleTag({
      content: "nextjs-portal { display: none !important; }",
    });
    await page.evaluate(async () => document.fonts.ready);
    const path = testInfo.outputPath(`screenshots/${state}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await testInfo.attach(state, { path, contentType: "image/png" });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("documentation navigation and search", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/visual-fixtures/admin-skeletons?state=docs");
  const search = page.getByRole("textbox", {
    name: /dokumentasi|documentation/i,
  });
  await search.fill("ma1101");
  await expect(
    page.getByRole("link", { name: /Menamai dan mengunggah dokumen/ }).first(),
  ).toBeVisible();
  await search.fill("tidak-ada-kata-ini");
  await expect(page.getByText("Dokumentasi tidak ditemukan")).toBeVisible();
  await search.clear();
  if (testInfo.project.name === "mobile-380")
    await page.getByRole("button", { name: "Navigasi dokumentasi" }).click();
  const navigation = page.getByRole("navigation", {
    name: "Navigasi dokumentasi",
  });
  await navigation
    .getByRole("button", {
      name: "Bagian dalam Menamai dan mengunggah dokumen",
    })
    .click();
  await expect(
    navigation.getByRole("link", { name: "Unggah massal dan duplikat" }),
  ).toBeVisible();
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
  await page.evaluate(async () => document.fonts.ready);
  const path = testInfo.outputPath("screenshots/docs-navigation-dark.png");
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach("docs-navigation-dark", {
    path,
    contentType: "image/png",
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("documentation navigation at the wide breakpoint", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "laptop-fhd-125");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1279, height: 864 });
  await page.goto("/visual-fixtures/admin-skeletons?state=docs", {
    waitUntil: "domcontentloaded",
  });
  const trigger = page.getByRole("button", { name: "Navigasi dokumentasi" });
  await trigger.click();
  await expect(
    page.getByRole("dialog", { name: "Navigasi dokumentasi" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("screenshots/docs-1279-open.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 864 });
  await expect(
    page.getByRole("navigation", { name: "Navigasi dokumentasi" }),
  ).toBeVisible();
  await expect(trigger).toBeHidden();
  await page.screenshot({
    path: info.outputPath("screenshots/docs-1280.png"),
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
