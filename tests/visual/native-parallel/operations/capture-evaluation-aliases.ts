import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createEvaluationFixtureRequest } from "@/packages/native-parity/operations/evaluation-fixtures";
import { evaluationRead } from "@/packages/native-parity/operations/evaluation-contract";
import type { EvaluationRedirect } from "@/packages/native-parity/operations/evaluation-routes";
import { legacyEvaluationBrowserCases } from "./legacy-evaluation/cases";

async function main() {
  const root = process.env.PARITY_OPERATIONS_WEB_URL ?? "http://localhost:3211";
  const destination = "artifacts/native-parity/operations-web/evaluation-aliases";
  const origin = new URL("/admin/evaluation-alias-origin", root);
  const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE });
  const fixture = createEvaluationFixtureRequest();
  const cases: Record<string, unknown>[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 1, locale: "id-ID" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    const loaded = await page.goto(origin.href, { waitUntil: "domcontentloaded", timeout: 90000 });
    expect(loaded?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Legacy evaluation route origins" })).toBeVisible();

    for (const entry of legacyEvaluationBrowserCases) {
      const href = new URL(entry.href, root).href;
      const final = new URL(entry.expected === 307 ? entry.destination : entry.href, root).href;
      const sourceResponse = page.waitForResponse((response) => response.url() === href && response.request().isNavigationRequest(), { timeout: 60000 });
      const finalResponse = entry.expected === 307
        ? page.waitForResponse((response) => response.url() === final && response.request().isNavigationRequest(), { timeout: 60000 })
        : sourceResponse;
      const [source, reached] = await Promise.all([
        sourceResponse, finalResponse, page.getByRole("link", { name: entry.id, exact: true }).click({ timeout: 60000 }),
      ]);
      await page.waitForURL(final);
      expect(source.status()).toEqual(entry.expected);
      expect(reached.status()).toBe(entry.expected === 307 ? 200 : 404);

      let native: EvaluationRedirect | { status: number };
      if (entry.expected === 307) {
        expect(source.headers().location).toBe(entry.destination);
        await expect(page.getByRole("heading", { name: "Alias destination" })).toBeVisible();
        native = await fixture<EvaluationRedirect>(evaluationRead(entry.href));
        expect(native).toEqual({ kind: "redirect", href: entry.destination });
      } else {
        await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
        try {
          await fixture(evaluationRead(entry.href));
          throw new Error(`Expected native fixture to return 404 for ${entry.href}`);
        } catch (error) {
          expect(error).toMatchObject({ status: 404 });
          native = { status: 404 };
        }
      }

      await page.goBack({ waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForURL(origin.href, { timeout: 5000 }).catch(() => undefined);
      const backUrl = new URL(page.url());
      const backReachedOrigin = backUrl.href === origin.href;
      if (backReachedOrigin) await expect(page.getByRole("heading", { name: "Legacy evaluation route origins" })).toBeVisible();
      cases.push({
        id: entry.id, path: entry.href, status: source.status(),
        location: source.headers().location ?? null,
        reachedPath: new URL(final).pathname + new URL(final).search, reachedStatus: reached.status(),
        browserBack: backUrl.pathname + backUrl.search, backReachedOrigin, native,
      });
      if (!backReachedOrigin) await page.goto(origin.href, { waitUntil: "domcontentloaded" });
    }
    expect(errors).toEqual([]);
    await mkdir(destination, { recursive: true });
    await writeFile(`${destination}/cases.json`, JSON.stringify({
      server: "Actual Next.js evaluation alias page functions with fixture Admin authorization and course/quiz identities",
      screen: "Local fixture destinations", cases,
    }, null, 2) + "\n");
    expect(cases.every(item => item.backReachedOrigin === true)).toBe(true);
  } finally {
    await browser.close();
  }
  console.log(`${cases.length} alias paths recorded with observed browser Back destinations and native fixture comparison`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
