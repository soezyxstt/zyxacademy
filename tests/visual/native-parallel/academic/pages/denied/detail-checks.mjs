import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { fixtureCookie } from "../../../../../../packages/native-parity/academic/local/cookie.mjs";
import { sanitizeAclPath } from "./acl-record.mjs";

const origin = "http://127.0.0.1:3314";
const cases = [
  ["admin-quiz-edit", "admin", "/admin/courses/biologi-dasar/quizzes/academic-web-quiz-1/edit", "Kuis Struktur Sel"],
  ["admin-idea-detail", "admin", "/admin/courses/fisika-dasar/review/idea/academic-web-idea-1", "Kecepatan adalah perubahan posisi terhadap waktu"],
  ["admin-product-detail", "admin", "/admin/courses/biologi-dasar/review/product/academic-web-product-1", "Struktur dan Fungsi Membran Sel"],
  ["tutor-quiz-edit", "tutor", "/tutor/academic-course-1/quizzes/academic-web-quiz-1/edit", "Kuis Struktur Sel"],
];
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const revision = git("rev-parse", "HEAD");
const checkedPaths = ["app", "components", "lib", "proxy.ts"];
const selected = new Set(process.argv.slice(2));
assert.ok([...selected].every((value) => cases.some(([id]) => id === value)), "Unknown control ID");
const output = new URL("api-detail-controls.json", import.meta.url);
const previous = selected.size ? JSON.parse(await readFile(output, "utf8")) : null;
if (previous) assert.equal(previous.revision, revision);
assert.equal(git("diff", "--name-only", revision, "--", ...checkedPaths), "");

const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium" });
const results = (previous?.results ?? []).filter(({ id }) => !selected.has(id));
try {
  for (const role of ["admin", "tutor", "student"]) {
    const context = await browser.newContext({ viewport: { width: 380, height: 852 }, deviceScaleFactor: 1, colorScheme: "light",
      locale: "id-ID", timezoneId: "Asia/Jakarta", serviceWorkers: "block", reducedMotion: "reduce" });
    const [name, value] = fixtureCookie(role).split("=");
    await context.addCookies([{ name, value, url: origin }]);
    await context.route("**/*", (route) => new URL(route.request().url()).origin === origin && ["GET", "HEAD", "OPTIONS"].includes(route.request().method())
      ? route.continue() : route.abort());
    try {
      const response = await context.request.get(`${origin}/api/native/context`);
      assert.equal(response.status(), 200);
      const { accountId, roles } = await response.json();
      assert.equal(accountId, `academic-${role}`);
      assert.deepEqual(roles, [role === "student" ? "murid" : role]);
      for (const [id, owner, path, marker] of cases) {
        if (selected.size && !selected.has(id)) continue;
        if (role !== "student" && role !== owner) continue;
        const page = await context.newPage();
        const record = { id, accountId, roles, path, observedAt: new Date().toISOString(), navigation: [] };
        const product = role === "admin" && id === "admin-product-detail";
        const productReads = product ? ["/api/admin/bundles/product/academic-web-product-1", "/api/admin/bundles/product/academic-web-product-1/review"] : [];
        const responses = Promise.all(productReads.map(async (path) => ({ path, status: await page.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.origin === origin && url.pathname === path && response.request().method() === "GET";
        }, { timeout: 90_000 }).then((response) => response.status(), () => null) })));
        page.on("response", (response) => {
          const url = new URL(response.url());
          if (url.origin === origin && response.request().isNavigationRequest() && response.request().resourceType() === "document") {
            record.navigation.push({ path: sanitizeAclPath(url.href, origin, [path]), status: response.status() });
          }
        });
        try {
          const landing = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 90_000 });
          const landedPath = new URL(page.url()).pathname;
          if (role !== "student" && landing?.status() === 200 && landedPath === path) {
            if (product) record.requiredReads = await responses;
            await page.waitForFunction((expected) => document.body.innerText.includes(expected) ||
              Array.from(document.querySelectorAll("input, textarea")).some((input) => input.value.includes(expected)), marker,
            { timeout: product ? 60_000 : 25_000 }).catch(() => {});
          }
          if (landedPath === "/") await page.getByRole("button", { name: "Akun (Nadia Lestari)", exact: true }).first().waitFor({ timeout: 30_000 });
          record.landedPath = sanitizeAclPath(page.url(), origin, [path]);
          record.finalStatus = landing?.status() ?? null;
          record.fixtureMarkerInDocument = (await page.content()).includes(marker);
          record.fixtureMarkerRendered = await page.evaluate((expected) => document.body.innerText.includes(expected) ||
            Array.from(document.querySelectorAll("input, textarea")).some((input) => input.value.includes(expected)), marker);
          record.verdict = role === "student" ? (landedPath === "/" && record.navigation[0]?.status === 307 && record.finalStatus === 200 ? "redirected" : "unverified")
            : (landedPath === path && record.finalStatus === 200 && record.fixtureMarkerRendered
              && (!product || record.requiredReads?.every(({ status }) => status >= 200 && status < 300)) ? "authorized-content" : "unverified");
        } catch {
          record.verdict = "unverified";
        } finally { await page.close(); }
        results.push(record);
        console.log(`${id} ${role} ${record.finalStatus ?? "-"} ${record.verdict}`);
      }
    } finally { await context.close(); }
  }
  assert.equal(git("diff", "--name-only", revision, "--", ...checkedPaths), "");
  await writeFile(output, JSON.stringify({ revision, origin, fixtureStoragePort: 3318,
    observedAt: new Date().toISOString(), results }, null, 2) + "\n");
} finally { await browser.close(); }
