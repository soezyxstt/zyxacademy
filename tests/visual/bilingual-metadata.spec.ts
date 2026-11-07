import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import idMarketing from "@/messages/id/marketing.json";
import enMarketing from "@/messages/en/marketing.json";
import enAcademic from "@/messages/en/adminAcademic.json";
import enEval from "@/messages/en/adminEval.json";
import enCore from "@/messages/en/core.json";
import idCore from "@/messages/id/core.json";
import { pageTitle } from "@/lib/site";
import { stubVisualTelemetry } from "@/tests/visual/telemetry-stubs";
import { waitForVisualReadiness } from "@/tests/visual/visual-readiness";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const adminStatePath = resolve("artifacts/bilingual/admin-auth.json");
const localBase = ["127.0.0.1", "localhost", "::1"].includes(new URL(baseURL).hostname);
const adminFixtureReady = localBase
  && process.env.BILINGUAL_ACCOUNT_STORAGE_STATES === "1"
  && existsSync(adminStatePath);

test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await stubVisualTelemetry(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
});

async function expectMetadata(page: import("@playwright/test").Page, title: string, description: string) {
  await expect(page).toHaveTitle(pageTitle(title));
  await expect.poll(async () => {
    const contents = await page.locator('meta[name="description"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("content")),
    );
    return contents.length > 0 && contents.every((content) => content === description);
  }).toBe(true);
}

test("sign-out title and description follow the locale cookie", async ({ page, context }) => {
  const localeCases = [
    { locale: "id", messages: idMarketing.signOut },
    { locale: "en", messages: enMarketing.signOut },
  ] as const;

  for (const item of localeCases) {
    await context.clearCookies();
    await context.addCookies([
      { name: "zyx_locale", value: item.locale, url: baseURL, sameSite: "Lax" },
    ]);
    await page.goto("/sign-out", { waitUntil: "domcontentloaded" });
    await waitForVisualReadiness(page);
    await expect(page.locator("html")).toHaveAttribute("lang", item.locale);
    await expectMetadata(page, item.messages.title, item.messages.description);
  }
});

test("web app manifest follows the locale cookie and keeps the installed identity stable", async ({ context }) => {
  const localeCases = [
    { locale: "id", description: idCore.site.description, startUrl: "/" },
    { locale: "en", description: enCore.site.description, startUrl: "/en" },
  ] as const;

  for (const item of localeCases) {
    await context.clearCookies();
    await context.addCookies([
      { name: "zyx_locale", value: item.locale, url: baseURL, sameSite: "Lax" },
    ]);
    const response = await context.request.get("/manifest.webmanifest", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const manifest = await response.json() as {
      lang: string;
      description: string;
      id: string;
      start_url: string;
      scope: string;
      display: string;
      icons: Array<{ src: string }>;
    };
    expect(manifest.lang).toBe(item.locale);
    expect(manifest.description).toBe(item.description);
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe(item.startUrl);
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map(icon => icon.src)).toEqual([
      "/brand/zyx-app-192.png",
      "/brand/zyx-app-512.png",
      "/icons/zyx-maskable-192.png",
      "/icons/zyx-maskable-512.png",
    ]);
  }
});

test.describe("admin metadata follows the account locale over the cookie", () => {
  test.use({ storageState: existsSync(adminStatePath) ? adminStatePath : undefined });
  test.skip(!adminFixtureReady, "Requires the local-only synthetic admin auth state seeded for bilingual browser checks.");

  test("academic route title and description use the English account preference when the cookie is Indonesian", async ({ page, context }) => {
    await context.addCookies([
      { name: "zyx_locale", value: "id", url: baseURL, sameSite: "Lax" },
    ]);
    await page.goto("/admin/courses", { waitUntil: "domcontentloaded" });
    await waitForVisualReadiness(page);
    await expect(page).toHaveURL(/\/admin\/courses$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expectMetadata(
      page,
      enAcademic.metadata.pages.coursesTitle,
      enAcademic.metadata.pages.coursesDescription,
    );
  });

  test("evaluation route title and inherited description use the English account preference", async ({ page, context }) => {
    await context.addCookies([
      { name: "zyx_locale", value: "id", url: baseURL, sameSite: "Lax" },
    ]);
    await page.goto("/admin/questions", { waitUntil: "domcontentloaded" });
    await waitForVisualReadiness(page);
    await expect(page).toHaveURL(/\/admin\/questions$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expectMetadata(
      page,
      enEval.metadata.questionBank,
      enEval.metadata.description,
    );
  });
});
