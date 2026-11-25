import { expect, test } from "@playwright/test";
import { waitForVisualReadiness } from "./visual-readiness";

const fixture = "/visual-fixtures/course-polish";
test.use({ colorScheme: "dark", locale: "en-GB", contextOptions: { reducedMotion: "reduce" } });
test.setTimeout(150_000);

for (const [section, text] of [
  ["overview", "Limit fungsi dan kontinuitas"], ["material", "Teorema limit"],
  ["video", "Bentuk tak tentu pada limit fungsi"], ["quiz", "Latihan lanjutan"],
  ["tryout", "Tryout akhir semester"], ["progress", "Fungsi dan grafik"], ["diagnostic", "Best score: 0%"],
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

    const path = section === "overview" ? fixture : `${fixture}/study`;
    const response = await page.goto(section === "overview" ? path : `${path}?section=${section}`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(path);
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

    if (section === "progress") {
      await expect(main.locator('dl[aria-label="Study statistics"] dt')).toHaveCount(4);
      await expect(main.getByRole("heading", { name: "Recent activity" })).toBeVisible();
      await expect(main.getByText("Latihan fungsi multivariabel dan kontinuitas pada domain yang lebih luas")).toBeVisible();
      await expect(main.getByRole("link", { name: "Topic results" })).toHaveAttribute("href", "/courses/fixture-math/mastery");
      if (info.project.name === "mobile-380") {
        const overflow = page.getByRole("button", { name: "More", exact: true });
        await overflow.click();
        await expect(page.getByRole("menu")).toBeVisible();
        await capture("overflow");
        await page.keyboard.press("Escape");
      }
    }
    if (section === "diagnostic") {
      const physics = main.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Physics", exact: true }) });
      await expect(physics.getByText("The Physics simulation is not complete yet.")).toBeVisible();
      await expect(physics.getByText("Not attempted", { exact: true })).toHaveCount(0);
      await expect(main.getByText("May need additional support")).toBeVisible();
      await expect(main.getByText(/Follow Ditsama ITB/)).toBeVisible();
    }
    if (section === "progress" || section === "diagnostic") {
      await page.emulateMedia({ colorScheme: "light" });
      await expect(page.locator("html")).toHaveClass(/\blight\b/);
      await capture(`${section}-light`);
    }

    expect(errors).toEqual([]);
  });
}
