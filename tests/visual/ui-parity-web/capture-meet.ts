import { rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, type Browser, type Page } from "@playwright/test";
import id from "../../../messages/id/marketing.json";
import { meetingCaseIds, meetingFixtureUrl, meetingFrame, meetingPageRoute } from "../../../packages/meet/parity-cases";

async function verifyUnavailable(page: Page) {
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: id.public.meetNotFound, level: 1 })).toBeVisible();
  await expect(main.getByText(id.public.meetUnavailable, { exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: id.public.home })).toHaveAttribute("href", "/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
}

export async function captureMeet(browser: Browser, origin: string, dpr: number, output: URL) {
  const manifest = new URL("meet.json", output);
  await rm(manifest, { force: true });
  const page = await browser.newPage({ viewport: meetingFrame, deviceScaleFactor: dpr, colorScheme: "light", reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    const [unavailable, ready, failed] = meetingCaseIds;
    const missing = await page.goto(`${origin}/meet/${unavailable}`);
    expect(missing?.status()).toBe(200);
    await verifyUnavailable(page);
    await page.screenshot({ path: fileURLToPath(new URL(`meet-${unavailable}.png`, output)), scale: "device", animations: "disabled" });

    const redirect = await page.request.get(`${origin}/meet/${ready}`, { maxRedirects: 0 });
    const location = redirect.headers().location;
    expect(redirect.status()).toBe(307);
    expect(location).toBe(meetingFixtureUrl);

    const recoveryUrl = `${origin}/meet/${failed}`;
    await page.route(recoveryUrl, route => route.fulfill({ status: 503, contentType: "text/plain", body: "Service unavailable" }), { times: 1 });
    const before = await page.goto(recoveryUrl);
    expect(before?.status()).toBe(503);
    const after = await page.reload();
    expect(after?.status()).toBe(200);
    await verifyUnavailable(page);
    await page.screenshot({ path: fileURLToPath(new URL(`meet-${failed}-recovered.png`, output)), scale: "device", animations: "disabled" });

    if (errors.length) throw new Error(errors.join("\n"));
    await writeFile(manifest, JSON.stringify({ ...meetingFrame, route: meetingPageRoute, cases: meetingCaseIds,
      externalRedirect: { case: ready, status: redirect.status(), location },
      recovery: { case: failed, beforeStatus: before?.status(), afterStatus: after?.status() },
      commit: process.env.PARITY_HEAD_SHA, buildCommit: process.env.GITHUB_SHA }));
  } finally {
    await page.close();
  }
}
