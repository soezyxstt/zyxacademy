import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { buildSettingsPreferencesFixture } from "../../fixtures/settings-preferences-build";
import { fixtureFontStyles } from "../../fixtures/fonts";

const origin = "http://student-settings-reference.invalid";
const targets = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
const states = [
  { id: "id-light", locale: "id", theme: "light", tab: "Umum", label: "Bahasa", selected: "Bahasa Indonesia", nativeTitle: "Pengaturan" },
  { id: "en-light", locale: "en", theme: "light", tab: "General", label: "Language", selected: "English", nativeTitle: "Settings" },
  { id: "id-dark", locale: "id", theme: "dark", tab: "Umum", label: "Bahasa", selected: "Bahasa Indonesia", nativeTitle: "Pengaturan" },
] as const;
const options = ["Bahasa Indonesia", "English"] as const;
const maestro = ".maestro/native-parallel/student/settings-parity.yaml";
const sources = [
  maestro,
  "app/(student)/settings/settings-client.tsx",
  "apps/mobile-native/features/student/StudentFixtureRoute.tsx",
  "apps/mobile-native/features/student/community/settings.tsx",
  "apps/mobile-native/features/student/community/ui.tsx",
  "packages/design-tokens/native-colors.ts",
  "packages/native-parity/student/community/fixtures.ts",
  "packages/native-parity/student/fixture-request.ts",
  "tests/visual/fixtures/settings-preferences.tsx",
  "tests/visual/fixtures/settings-preferences-build.ts",
  "tests/visual/fixtures/fonts/inter-latin.woff2",
  "tests/visual/fixtures/fonts/lexend-latin.woff2",
  "tests/visual/native-parallel/student/settings-reference.spec.ts",
];
const device = { id: "fixture-current", label: "Chrome on Windows", current: true,
  createdAt: "2026-11-25T08:00:00.000Z", updatedAt: "2026-11-25T08:00:00.000Z", expiresAt: "2026-12-25T08:00:00.000Z" };

test("Student settings language controls use the same locale and theme as the native fixtures", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile-380", "Captures both device extents directly.");
  test.setTimeout(120_000);
  const fixture = await buildSettingsPreferencesFixture();
  const fonts = fixtureFontStyles();
  const sourceDigests = Object.fromEntries(await Promise.all(sources.map(async path =>
    [path, createHash("sha256").update(await readFile(path)).digest("hex")] as const)));
  const flow = await readFile(maestro, "utf8");
  const nativeUrls = [...flow.matchAll(/^- openLink: "([^"]+)"$/gm)].map(([, url]) => new URL(url));
  expect(nativeUrls).toHaveLength(states.length);

  for (const target of targets) {
    const captures: Record<string, string> = {};
    const verified: Record<string, unknown> = {};
    for (const [index, state] of states.entries()) {
      const { id, locale, theme, tab, label, selected, nativeTitle } = state;
      const nativeUrl = nativeUrls[index];
      expect(nativeUrl.protocol + "//" + nativeUrl.hostname).toBe("zyx-native-parity://student-fixture");
      const native = Object.fromEntries(nativeUrl.searchParams);
      expect(native).toEqual({ scenario: "loaded", path: "/settings", locale, theme });
      expect(flow).toContain(`- takeScreenshot: student-settings-${id}`);
      const choice = await createStudentFixtureRequest(native.scenario)("/api/native/student/community/locale", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale }),
      });
      expect(choice.ok).toBe(true);
      expect(await choice.json()).toMatchObject({ success: true });

      const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor,
        hasTouch: true, isMobile: true, colorScheme: theme, locale: locale === "en" ? "en-GB" : "id-ID", timezoneId: "Asia/Jakarta", reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        const problems: string[] = [];
        page.on("pageerror", error => problems.push(error.message));
        page.on("console", message => { if (message.type() === "error") problems.push(message.text()); });
        const url = `${origin}/settings?locale=${locale}`;
        await page.route("**/*", async route => {
          const requested = new URL(route.request().url());
          if (requested.href === url) return route.fulfill({ contentType: "text/html",
            body: `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><body class="bg-background text-foreground"><div id="root"></div></body></html>` });
          if (requested.origin === origin && route.request().method() === "GET") {
            if (requested.pathname === "/api/account/sessions") return route.fulfill({ json: { sessions: [device] } });
            if (requested.pathname === "/api/notifications/status") return route.fulfill({ json: { transports: { webpush: { registeredCount: 0, configured: true } } } });
            if (requested.pathname === "/api/notifications/quiet-hours") {
              return route.fulfill({ json: { enabled: false, startMinute: 1320, endMinute: 420, timeZone: "Asia/Jakarta" } });
            }
            if (/^\/brand\/zyx-logo-(?:horizontal|symbol)-(?:color|reversed)\.svg$/.test(requested.pathname)) {
              return route.fulfill({ contentType: "image/svg+xml", body: await readFile("public" + requested.pathname) });
            }
          }
          problems.push(`Unexpected fixture request ${route.request().method()} ${requested.pathname}`);
          return route.abort();
        });
        expect((await page.goto(url))?.status()).toBe(200);
        await page.addStyleTag({ content: fixture.styles + fonts });
        await page.addScriptTag({ content: fixture.script });
        const main = page.getByRole("main");
        await expect(main.getByRole("tab", { name: tab, exact: true, selected: true })).toBeVisible();
        await expect(main.getByText(/^Chrome on Windows/)).toBeVisible();
        await expect(main.locator('a[href="/download"]')).toBeVisible();
        const trigger = main.getByRole("button", { name: label, exact: true });
        await expect(trigger).toHaveText(selected);
        await trigger.click();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        for (const option of options) {
          const radio = page.getByRole("menuitemradio", { name: option, exact: true });
          await expect(radio).toBeInViewport();
          await expect(radio).toHaveAttribute("aria-checked", String(option === selected));
        }
        await page.evaluate(async () => {
          await Promise.all([document.fonts.load("400 14px Inter"), document.fonts.load("700 18px Lexend")]);
          await document.fonts.ready;
        });
        const web = await page.evaluate(() => ({
          viewport: { width: innerWidth, height: innerHeight }, deviceScaleFactor: devicePixelRatio,
          locale: document.documentElement.lang, theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          mediaTheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }));
        expect(web).toEqual({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, locale, theme, mediaTheme: theme, overflow: false });
        expect(problems).toEqual([]);
        const filename = `settings-${id}.png`;
        await mkdir(info.outputPath(target.platform), { recursive: true });
        const pixels = await page.screenshot({ path: info.outputPath(target.platform, filename), animations: "disabled", scale: "device" });
        captures[filename] = createHash("sha256").update(pixels).digest("hex");
        const nativeMarkers = [
          { id: `student-fixture-${locale}-${theme}` },
          { text: `^${nativeTitle}$` }, { text: `^${tab}$`, selected: true }, { text: `^${label}$` },
          ...options.map(option => ({ text: `^${option}$`, selected: option === selected })),
        ];
        verified[id] = { native, nativeMarkers, web: { ...web, path: "/settings", tab, label, displayedOptions: options, selected } };
      } finally {
        await context.close();
      }
    }
    await writeFile(info.outputPath(target.platform, "settings-reference.json"), JSON.stringify({
      ...target, locale: "per-state", theme: "per-state", timeZone: "Asia/Jakarta", motion: "reduced", fonts: "fixture Inter and Lexend",
      scope: "Settings language selection control with surrounding frame retained for diagnostic context",
      scopeLimit: "Web dropdown and native inline selection share the language choice. Account sessions, device settings and navigation shell are outside this comparison.",
      sourceDigests, states: verified, captures,
    }, null, 2) + "\n");
  }
});
