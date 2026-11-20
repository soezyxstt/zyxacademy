import { expect, test } from "@playwright/test";

test("toolbar search expands in place, clears, and restores keyboard focus", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  expect((await page.goto("/visual-fixtures/control-contrast"))?.status()).toBe(200);
  await expect(page).toHaveURL(/\/visual-fixtures\/control-contrast$/);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

  const search = page.getByRole("button", { name: "Cari mata kuliah" });
  const input = page.getByRole("textbox", { name: "Cari mata kuliah" });
  const list = page.getByRole("list", { name: "Daftar mata kuliah" });
  const back = page.getByRole("link", { name: "Kembali ke mata kuliah" });
  const add = page.getByRole("button", { name: "Tambah mata kuliah" });

  const capture = async (state: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    const [navigation, action] = await Promise.all([back.boundingBox(), add.boundingBox()]);
    expect(Math.abs(navigation!.y - action!.y)).toBeLessThan(4);
    await page.screenshot({ path: info.outputPath(`${state}.png`), animations: "disabled" });
  };

  await expect(input).toBeHidden();
  await expect(search).toBeVisible();
  await capture("collapsed");
  await search.focus();
  await expect(input).toBeFocused();
  await input.fill("Fisika");
  await expect(list.getByRole("listitem")).toHaveText(["Fisika dasar"]);
  await capture("expanded");
  await input.press("Escape");
  await expect(search).toBeFocused();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await search.click();
  await input.fill("Matematika");
  await page.getByRole("button", { name: "Tutup pencarian" }).click();
  await expect(search).toBeFocused();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  expect(errors).toEqual([]);
});
