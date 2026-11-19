import { test, expect } from "@playwright/test";
import { buildFixture } from "./fixtures/interactive-document-build";

let fixture: Awaited<ReturnType<typeof buildFixture>>;
test.beforeAll(async () => { fixture = await buildFixture("tests/visual/fixtures/course-mastery.tsx"); });

for (const lang of ["id", "en"]) {
  test(`course mastery in ${lang}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
    page.on("response", r => { if (r.status() >= 400) errors.push(r.url()); });
    await page.route("http://mastery.test/**", route => route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="${lang}"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>`,
    }));
    async function capture(state: string) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${state}.png`), animations: "disabled" });
    }
    for (const state of ["loading", "empty", "early", "strong", "review"]) {
      const url = `http://mastery.test/courses/math/mastery/${state}`;
      await page.goto(url);
      await page.addStyleTag({ content: fixture.styles });
      await page.addScriptTag({ content: fixture.script });
      await expect(page).toHaveURL(url);
      if (state === "loading") await expect(page.getByTestId("course-mastery-content-skeleton")).toBeVisible();
      else {
        await expect(page.getByRole("link").first()).toHaveAttribute("href", state === "empty" || state === "strong" ? "/courses/math/path" : "/courses/math/concept/roots");
        if (state === "early") await expect(page.getByText(lang === "id" ? "Hasil awal" : "Early result")).toBeVisible();
      }
      await capture(state);
    }
    const chapter = page.getByRole("button").first();
    await chapter.focus();
    await page.keyboard.press("Enter");
    await expect(chapter).toHaveAttribute("aria-expanded", "true");
    await capture("chapter");
    await page.getByRole("button", { name: /Unassessed|Belum dinilai/ }).click();
    await expect(page.getByRole("listitem")).toHaveCount(11);
    await capture("unassessed");
    await page.getByRole("button", { name: /Next|Berikutnya/ }).click();
    await expect(page.getByRole("listitem")).toHaveCount(2);
    await capture("next");
    expect(errors).toEqual([]);
  });
}
