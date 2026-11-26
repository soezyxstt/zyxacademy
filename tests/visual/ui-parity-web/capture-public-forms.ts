import { rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, type Browser } from "@playwright/test";
import {
  publicFormCases, publicFormFixtureClosure, publicFormFixtureEnvelope, publicFormFixtureMeeting,
  publicFormFixtureQuestion, publicFormFixtureTitle, publicFormFrame, publicFormPageCases,
} from "../../../packages/forms/parity-cases";
import id from "../../../messages/id/publicForms.json";

export async function capturePublicForms(browser: Browser, origin: string, dpr: number, output: URL) {
  const page = await browser.newPage({ viewport: publicFormFrame, deviceScaleFactor: dpr, colorScheme: "light", reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    for (const [group, { route, cases }] of Object.entries(publicFormPageCases)) {
      const manifest = new URL(`${group}.json`, output);
      await rm(manifest, { force: true });
      let externalRedirect: { case: string; location: string; status: number } | undefined;
      for (const caseId of cases) {
        const sample = publicFormCases[caseId];
        const url = `${origin}/public-forms/${caseId}`;
        if (sample.status === "meeting") {
          const redirect = await page.request.get(url, { maxRedirects: 0 });
          const location = redirect.headers().location;
          expect(redirect.status()).toBe(307);
          expect(location).toBe(publicFormFixtureMeeting);
          externalRedirect = { case: caseId, status: redirect.status(), location };
          continue;
        }
        const apiPath = `/api/forms/${sample.id}`;
        const api = (value: URL) => value.pathname === apiPath;
        await page.route(api, request => request.fulfill({
          status: sample.status === "missing" ? 404 : 200,
          json: publicFormFixtureEnvelope(caseId),
        }));
        try {
          const [apiResponse, document] = await Promise.all([
            page.waitForResponse(response => api(new URL(response.url())) && response.request().method() === "GET"),
            page.goto(url),
          ]);
          if (!document?.ok()) throw new Error(`Public form fixture returned HTTP ${document?.status()}`);
          expect(new URL(apiResponse.url()).searchParams.get("entry")).toBe(sample.entry === "short" ? "short" : null);
          if (sample.status === "ready") {
            await expect(page.getByRole("heading", { name: publicFormFixtureTitle })).toBeVisible();
            await expect(page.getByText(publicFormFixtureQuestion, { exact: true })).toBeVisible();
            const input = page.getByRole("textbox", { name: publicFormFixtureQuestion });
            await expect(input).toBeVisible();
            await expect(input).toHaveAttribute("required", "");
            await expect(page.getByRole("button", { name: id.publicForm.submit, exact: true })).toBeVisible();
          } else if (sample.status === "closed") {
            await expect(page.getByText(id.publicForm.closed, { exact: true })).toBeVisible();
            await expect(page.getByText(publicFormFixtureClosure.message, { exact: true })).toBeVisible();
            await expect(page.getByRole("link", { name: id.publicForm.home })).toBeVisible();
          } else {
            await expect(page.getByRole("heading", { name: id.publicForm.notFoundTitle })).toBeVisible();
            await expect(page.getByRole("link", { name: id.publicForm.home })).toBeVisible();
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: fileURLToPath(new URL(`${group}-${caseId}.png`, output)), scale: "device", animations: "disabled" });
        } finally {
          await page.unroute(api);
        }
      }
      if (errors.length) throw new Error(errors.join("\n"));
      await writeFile(manifest, JSON.stringify({ ...publicFormFrame, route, cases, externalRedirect,
        commit: process.env.PARITY_HEAD_SHA, buildCommit: process.env.GITHUB_SHA }));
    }
  } finally {
    await page.close();
  }
}
