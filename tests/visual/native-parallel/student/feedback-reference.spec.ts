import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { buildStudentFeedbackFixture, openStudentFeedbackForm } from "../../fixtures/student-feedback-build";

test("Student feedback form states use matched device inputs", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile-380", "Captures both device extents directly.");
  test.setTimeout(120_000);
  const fixture = await buildStudentFeedbackFixture();
  const targets = [
    { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
    { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
  ] as const;
  const maestro = ".maestro/native-parallel/student/feedback-parity.yaml";
  const sourcePaths = [
    maestro,
    "tests/visual/native-parallel/student/feedback-reference.spec.ts",
    "tests/visual/fixtures/student-feedback-build.ts",
    "tests/visual/fixtures/student-feedback.tsx",
    "tests/visual/fixtures/interactive-document-build.ts",
    "tests/visual/fixtures/fonts.ts",
    "tests/visual/fixtures/fonts/inter-latin.woff2",
    "tests/visual/fixtures/fonts/lexend-latin.woff2",
    "app/(student)/feedback/feedback-form.tsx",
    "app/globals.css",
    "messages/id/student.json",
    "apps/mobile-native/features/student/StudentFixtureRoute.tsx",
    "apps/mobile-native/features/student/community/settings.tsx",
    "apps/mobile-native/features/student/community/ui.tsx",
    "packages/native-parity/student/community/fixtures.ts",
    "packages/native-parity/student/fixture-request.ts",
  ];
  const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
  const sourceDigests = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, hash(await readFile(path))] as const)));
  const flow = await readFile(maestro, "utf8");
  const nativeLinks = [...flow.matchAll(/^- openLink: "([^"]+)"$/gm)].map(([, url]) => new URL(url));
  expect(nativeLinks).toHaveLength(1);
  const [nativeUrl] = nativeLinks;
  const native = { scenario: "loaded", theme: "light", locale: "id", path: "/feedback" };
  expect(nativeUrl.protocol + "//" + nativeUrl.hostname).toBe("zyx-native-parity://student-fixture");
  expect(Object.fromEntries(nativeUrl.searchParams)).toEqual(native);

  const payload = { category: "fitur", rating: 4, message: "Tambahkan contoh pada pembahasan limit." };
  expect(flow).toContain(`- inputText: "${payload.message}"`);
  expect(flow).toContain("- tapOn: '^Fitur$'");
  expect(flow).toContain("- tapOn: '^4$'");
  const reply = await createStudentFixtureRequest(native.scenario)("/api/native/student/community/feedback", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  expect(reply.ok).toBe(true);
  expect(await reply.json()).toMatchObject({ success: true });

  const themeMarker = { id: "student-fixture-id-light" };
  const states = {
    idle: { native, nativeMarkers: [themeMarker, { text: "^Masukan$" },
      { text: "^Materi$", selected: true }, { text: "^5$", selected: true }, { id: "student-feedback-message" }],
    form: { category: "materi", rating: 5, message: "", optionalEmail: null } },
    filled: { native, nativeMarkers: [themeMarker, { text: "^Fitur$", selected: true }, { text: "^4$", selected: true },
      { id: "student-feedback-message", text: "^Tambahkan contoh pada pembahasan limit\\.$" }],
    form: { ...payload, optionalEmail: null } },
    sent: { native, nativeMarkers: [themeMarker, { text: "^Masukan terkirim\\.$" }], submission: payload },
  };
  for (const target of targets) {
    const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor,
      hasTouch: true, isMobile: true, colorScheme: "light", locale: "id-ID", timezoneId: "Asia/Jakarta", reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      const failures = await openStudentFeedbackForm(page, fixture, "light", "&comparison=feedback");
      const captures: Record<string, string> = {};
      await mkdir(info.outputPath(target.platform), { recursive: true });
      await page.evaluate(async () => {
        await Promise.all([document.fonts.load("400 14px Inter"), document.fonts.load("700 18px Lexend")]);
        await document.fonts.ready;
      });
      const extent = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, density: devicePixelRatio,
        locale: document.documentElement.lang, light: !document.documentElement.classList.contains("dark"),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
      expect(extent).toEqual({ ...target.viewport, density: target.deviceScaleFactor, locale: "id", light: true, overflow: false });
      async function captureState(state: keyof typeof states) {
        expect(flow).toContain(`- takeScreenshot: student-feedback-${state}`);
        const filename = `feedback-${state}.png`;
        captures[filename] = hash(await page.screenshot({ path: info.outputPath(target.platform, filename), animations: "disabled", scale: "device" }));
      }
      let submitted: unknown;
      let submissions = 0;
      await page.route("**/__fixture/feedback", route => {
        submitted = route.request().postDataJSON();
        submissions++;
        return route.fulfill({ json: { success: true, message: "Saved" } });
      });
      const form = page.locator("form");
      const message = page.getByLabel("Pesan dan saran");
      const optionalEmail = page.getByLabel("Alamat surel (opsional)");
      await expect(form.getByRole("button", { name: "Materi kuliah", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(form.getByRole("button", { name: "Beri nilai 5 dari 5 bintang", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(message).toHaveValue("");
      await expect(optionalEmail).toHaveValue("");
      await captureState("idle");

      await form.getByRole("button", { name: "Fitur platform", exact: true }).click();
      await form.getByRole("button", { name: "Beri nilai 4 dari 5 bintang", exact: true }).click();
      await message.fill(payload.message);
      await message.blur();
      await expect(form.getByRole("button", { name: "Fitur platform", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(form.getByRole("button", { name: "Beri nilai 4 dari 5 bintang", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(message).toHaveValue(payload.message);
      await expect(optionalEmail).toHaveValue("");
      await captureState("filled");

      await form.getByRole("button", { name: "Kirim masukan", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Masukan berhasil terkirim", exact: true })).toBeVisible();
      await expect(message).toHaveCount(0);
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10_000 });
      expect(submissions).toBe(1);
      expect(submitted).toEqual(payload);
      await captureState("sent");
      expect(failures).toEqual([]);
      await writeFile(info.outputPath(target.platform, "feedback-reference.json"), JSON.stringify({
        ...target, route: "/feedback", locale: native.locale, theme: native.theme, timeZone: "Asia/Jakarta",
        motion: "reduced", fonts: "fixture Inter and Lexend", browser: browser.version(),
        scope: "Shared feedback category, rating, message and success confirmation",
        scopeLimit: "Synthetic submission with email absent. Web-only optional email, validation, success decoration and shell remain visible where present.",
        sourceDigests, states, captures,
      }, null, 2) + "\n");
    } finally {
      await context.close();
    }
  }
});
