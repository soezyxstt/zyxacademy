// Real RSC pages on the disposable local database seeded by academic/local/seed.sql.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fixtureCookie } from "../../../../packages/native-parity/academic/local/cookie.mjs";

const origin = "http://127.0.0.1:3314";
const output = "artifacts/native-parity/academic/routes";
const cases = [
  ["tutor", "/tutor", "Biologi Dasar", "tutor-dashboard"],
  ["tutor", "/tutor/academic-course-1/participants", "Nadia Lestari", "tutor-participants"],
  ["tutor", "/tutor/academic-course-2/participants", "Fisika Dasar", "tutor-empty"],
  ["tutor", "/tutor/academic-course-3/participants", "Biologi Dasar", "tutor-denied"],
  ["admin", "/admin/courses", "Biologi Dasar", "admin-courses"],
  ["admin", "/admin/courses/biologi-dasar", "Biologi Dasar", "admin-detail"],
];
const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE });
await mkdir(output, { recursive: true });
const results = [];
try {
  for (const [role, path, text, key] of cases) {
    const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 1,
      locale: "id-ID", timezoneId: "Asia/Jakarta", colorScheme: "light", reducedMotion: "reduce" });
    const [name, value] = fixtureCookie(role).split("=");
    await ctx.addCookies([{ name, value, url: origin }]);
    const page = await ctx.newPage();
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    try {
      const res = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 180000 });
      assert.ok(res?.ok(), key + " returns HTTP success");
      await page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 30000 });
      const landed = new URL(page.url()).pathname;
      assert.equal(landed, key === "tutor-denied" ? "/tutor" : path);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: output + "/" + key + ".png", animations: "disabled" });
      results.push({ role, path, landed, key, status: res.status() });
      console.log(key, landed, res.status());
    } finally { await ctx.close(); }
  }
  await writeFile(output + "/manifest.json", JSON.stringify(results, null, 2) + "\n");
} finally { await browser.close(); }
