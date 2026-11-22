import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

let script: string;
let styles: string;

test.beforeAll(async () => {
  const stylesheet = resolve("app/globals.css");
  const css = readFileSync(stylesheet, "utf8")
    .replace('@import "tailwindcss";', '@import "tailwindcss" source(none);');
  styles = (await postcss([tailwind()]).process(
    `${css}
    @source "../components/ui/sonner.tsx";
    @source "../components/ui/alert.tsx";
    @source "../components/ui/button.tsx";
    @source "../tests/visual/fixtures/sonner.tsx";
    :root { --font-inter: system-ui; --font-lexend: system-ui; }
    `,
    { from: stylesheet },
  )).css;
  const bundle = await build({
    entryPoints: ["tests/visual/fixtures/sonner.tsx"],
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  script = bundle.outputFiles[0].text;
});

for (const theme of ["light", "dark"] as const) {
  test(`Zyx toasts in ${theme} mode`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.route("http://sonner.test/**", route => route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>',
    }));
    const url = `http://sonner.test/?theme=${theme}`;
    expect((await page.goto(url))?.status()).toBe(200);
    await expect(page).toHaveURL(url);
    await page.addStyleTag({ content: styles });
    await page.addScriptTag({ content: script });
    await page.getByRole("button", { name: "Show notifications" }).click();
    const toasts = page.locator('[data-sonner-toast][data-mounted="true"]');
    await expect(toasts).toHaveCount(6);
    await page.keyboard.press("Alt+t");
    await expect(page.locator('[data-sonner-toast][data-expanded="true"]')).toHaveCount(6);

    const alert = page.locator('[data-slot="alert"]');
    const error = toasts.filter({ hasText: "Could not complete device registration." });
    await expect(error).toHaveCSS("background-color", await alert.evaluate(el => getComputedStyle(el).backgroundColor));
    await expect(error).toHaveCSS("border-radius", await alert.evaluate(el => getComputedStyle(el).borderRadius));
    await expect(error).toHaveAttribute("data-x-position", "right");
    await expect(error).toHaveAttribute("data-y-position", theme === "dark" ? "bottom" : "top");
    const topToaster = page.locator('[data-sonner-toaster][data-y-position="top"]');
    await expect(topToaster).toHaveCSS("top", page.viewportSize()!.width <= 600 ? "16px" : "24px");
    await expect(error.getByRole("button", { name: "Later", exact: true })).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const dismiss = error.getByRole("button", { name: theme === "dark" ? "Tutup" : "Close", exact: true });
    await error.press("Tab");
    await expect(dismiss).toBeFocused();
    await expect(dismiss).toHaveCSS("outline-style", "solid");

    const layoutIssues = await toasts.evaluateAll(elements => elements.flatMap(element => {
      const card = element.getBoundingClientRect();
      const children = Array.from(element.children)
        .filter(child => getComputedStyle(child).display !== "none")
        .flatMap(child => child.matches("[data-content]") ? Array.from(child.children) : [child])
        .map(child => child.getBoundingClientRect());
      const outside = card.left < 0 || card.right > innerWidth || card.top < 0 || card.bottom > innerHeight || children.some(
        child => child.left < card.left || child.right > card.right || child.top < card.top || child.bottom > card.bottom,
      );
      const overlaps = children.some((a, i) => children.slice(i + 1).some(
        b => Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
          Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top),
      ));
      return outside || overlaps ? [element.textContent] : [];
    }));
    expect(layoutIssues).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`toasts-${theme}.png`), animations: "disabled" });

    await dismiss.press("Enter");
    await expect(error).toHaveCount(0);
    await toasts.filter({ hasText: "Study reminders are paused" }).getByRole("button", { name: "Keep paused" }).click();
    await expect(toasts.filter({ hasText: "Study reminders are paused" })).toHaveCount(0);
    await page.getByRole("button", { name: "Show notifications" }).click();
    const retry = error.getByRole("button", { name: "Retry device registration" }).first();
    await retry.click();
    await expect(toasts.getByText("Registration restarted", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
