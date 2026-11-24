import { expect, test } from "@playwright/test";
import { waitForVisualReadiness } from "./visual-readiness";

const fixture = "/visual-fixtures/course-polish";
test.use({ colorScheme: "dark", locale: "en-GB", reducedMotion: "reduce" });
test.setTimeout(150_000);

for (const [section, text] of [
  ["overview", "Limit fungsi dan kontinuitas"], ["material", "Teorema limit"],
  ["video", "Bentuk tak tentu pada limit fungsi"], ["quiz", "Latihan lanjutan"],
  ["tryout", "Tryout akhir semester"], ["progress", "Fungsi dan grafik"],
] as const) {
  test(`course workspace ${section} fits the viewport`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));

    async function capture(view: string) {
      await waitForVisualReadiness(page);
      await expect.poll(() => page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        return document.documentElement.scrollWidth <= viewportWidth && document.body.scrollWidth <= viewportWidth;
      })).toBe(true);
      const path = info.outputPath(`${view}.png`);
      await page.screenshot({ path, fullPage: true, animations: "disabled" });
      await info.attach(view, { path, contentType: "image/png" });
    }

    const response = await page.goto(`${fixture}?section=${section}`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(fixture);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    const main = page.getByRole("main");
    await expect(main.getByText(text, { exact: section !== "material" })).toBeVisible();
    if (section === "overview") {
      await expect(main.getByRole("heading", { name: "Matematika I", level: 1 })).toBeAttached();
      for (const [label, href] of [
        [/6 materials/, "/courses/fixture-math/material"],
        [/10 questions/, "/courses/fixture-math/quiz"],
        [/Friday, 15:00 WIB/, "/dashboard/schedule"],
        [/Limit fungsi dan kontinuitas.*40%/, "/courses/fixture-math/material/limit"],
      ] as const) {
        await expect(main.getByRole("link", { name: label })).toHaveAttribute("href", href);
      }
      await expect(main.getByRole("link", { name: /Turunan/ })).toHaveCount(0);
      const quickLinks = main.getByRole("navigation", { name: "Matematika I" });
      if (info.project.name === "mobile-380") {
        await expect(quickLinks.getByRole("link", { name: "Progress" })).toHaveAttribute("href", "/courses/fixture-math/progress");
      } else {
        await expect(quickLinks).toBeHidden();
      }
    }
    if (info.project.name === "mobile-380") {
      await expect(page.locator("[data-mobile-bottom-nav] a[aria-current=page]")).toBeVisible();
    }
    await capture(section);

    if (section === "progress" && info.project.name === "mobile-380") {
      await page.getByRole("button", { name: "More", exact: true }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await capture("overflow");
    }

    expect(errors).toEqual([]);
  });
}
