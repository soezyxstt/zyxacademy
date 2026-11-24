import { expect, test } from "@playwright/test";
import { waitForVisualReadiness } from "./visual-readiness";

const fixture = "/visual-fixtures/course-catalog";

test.use({ colorScheme: "dark", locale: "en-GB", contextOptions: { reducedMotion: "reduce" } });
test.setTimeout(120_000);

test("course list presents access and available content with compact rows", async ({ page }, info) => {
  await page.clock.setFixedTime(new Date("2030-01-02T00:00:00Z"));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));

  async function capture(state: string) {
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await waitForVisualReadiness(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const path = info.outputPath(`${state}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await info.attach(state, { path, contentType: "image/png" });
  }

  expect((await page.goto(fixture))?.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`${fixture}$`));
  const main = page.getByRole("main");
  const all = main.getByRole("tab", { name: "All (5)" });
  await expect(all).toHaveAttribute("aria-selected", "true");
  await expect(main.getByRole("link", { name: "Berpikir Komputasi Coming soon" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Fisika Dasar I 1 material Limited access" })).toHaveAttribute("href", "/courses/fi1101");
  await expect(main.getByRole("link", { name: "Matematika I 6 materials · 2 quizzes" })).toBeVisible();
  await expect(main.getByRole("link", { name: /Tutorial PKA.*Registration required/ })).toHaveAttribute("href", "/courses/tutorial-pka");
  await expect(main.getByText("Premium", { exact: true })).toHaveCount(0);
  await expect(main.getByText(/\b0 (materials|quizzes|tryouts)\b/)).toHaveCount(0);
  const advancedMath = main.getByRole("link", { name: /Matematika Lanjut/ });
  const badge = advancedMath.getByText("ML", { exact: true });
  const offer = advancedMath.getByText(/^Free access · 1-3 Jan 2030 \(07:00 WIB\)$/);
  await expect(badge).toBeVisible();
  await expect(offer).toBeVisible();
  expect(await offer.evaluate((element) => element.clientHeight <= Math.ceil(parseFloat(getComputedStyle(element).lineHeight)))).toBe(true);
  const [badgeBounds, titleBounds] = await Promise.all([badge.boundingBox(), advancedMath.getByRole("heading").boundingBox()]);
  expect(Math.abs(badgeBounds!.y - titleBounds!.y)).toBeLessThanOrEqual(2);
  const activeUnderline = await all.evaluate((element) => getComputedStyle(element, "::after").backgroundColor);
  expect(activeUnderline).toBe(await all.evaluate((element) => getComputedStyle(element).color));
  if (info.project.name === "mobile-380") {
    const currentBottomLink = page.locator('[data-mobile-bottom-nav] a[aria-current="page"]');
    await expect(currentBottomLink).toHaveText("Courses");
    expect(await currentBottomLink.evaluate((element) => getComputedStyle(element).color)).toBe(await main.evaluate((element) => getComputedStyle(element).color));
  }
  await capture("all-courses");

  const pka = main.getByRole("tab", { name: "PKA", exact: true });
  await pka.click();
  await expect(page).toHaveURL(/jurusan=pka$/);
  await expect(pka).toHaveAttribute("aria-selected", "true");
  await expect(main.getByRole("link", { name: /Matematika I/ })).toHaveCount(0);
  await expect(main.getByRole("link", { name: /Tutorial PKA/ })).toBeVisible();
  await capture("pka-tab");

  expect((await page.goto(`${fixture}?state=loading`))?.status()).toBe(200);
  await expect(page.getByRole("status", { name: "Memuat" })).toBeVisible();
  await capture("loading");
  expect(errors).toEqual([]);
});
