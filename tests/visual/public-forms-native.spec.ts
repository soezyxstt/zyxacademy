import { expect, test } from "@playwright/test";
import {
  isPublicFormCaseId, publicFormCases, publicFormFixtureClosure, publicFormFixtureEnvelope,
  publicFormFixtureMeeting, publicFormFixtureQuestion, publicFormFixtureTitle,
} from "../../packages/forms/parity-cases";
import { buildFixture } from "./fixtures/interactive-document-build";

const origin = "http://public-native-forms.invalid";
let fixture: Awaited<ReturnType<typeof buildFixture>>;
test.beforeAll(async () => { fixture = await buildFixture("tests/visual/fixtures/public-forms-native.tsx"); });

for (const [caseId, sample] of Object.entries(publicFormCases)) {
  test(`public form web reference ${caseId}`, async ({ page }, info) => {
    if (!isPublicFormCaseId(caseId)) throw new Error("Unknown public form fixture.");
    const path = `/${sample.entry === "short" ? "f" : "forms"}/${sample.id}`;
    await page.setViewportSize({ width: 380, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route(publicFormFixtureMeeting, route => route.fulfill({ contentType: "text/html", body: "<h1>Google Meet</h1>" }));
    await page.route(`${origin}/**`, route => {
      const url = new URL(route.request().url());
      if (url.pathname === path) {
        // The real SSR precedence is exercised with the route handler and DB double in the contract suite.
        if (sample.status === "meeting") return route.fulfill({ status: 307, headers: { Location: publicFormFixtureMeeting } });
        return route.fulfill({ contentType: "text/html", body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>' });
      }
      if (url.pathname === `/api/forms/id-${sample.id}` && url.searchParams.get("target") === "id" && route.request().method() === "POST") {
        return route.fulfill({ json: { success: true, submission: { id: "fixture-response" } } });
      }
      if (url.pathname === `/api/forms/${sample.id}` && route.request().method() === "GET") {
        expect(url.searchParams.get("entry")).toBe(sample.entry === "short" ? "short" : null);
        return route.fulfill({ status: sample.status === "missing" ? 404 : 200, json: publicFormFixtureEnvelope(caseId) });
      }
      return route.fulfill({ status: 204 });
    });
    await page.goto(origin + path);
    if (sample.status === "meeting") {
      await expect(page).toHaveURL(publicFormFixtureMeeting);
      return;
    }
    await page.addStyleTag({ content: fixture.styles });
    await page.addScriptTag({ content: fixture.script });
    if (sample.status === "ready") {
      await expect(page.getByText(publicFormFixtureTitle, { exact: true })).toBeVisible();
      await expect(page.getByText(publicFormFixtureQuestion, { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`${caseId}-ready.png`), animations: "disabled", fullPage: true });
      const field = page.getByRole("textbox");
      await field.fill("Peserta pengujian");
      await page.getByRole("button", { name: "Kirim tanggapan", exact: true }).click();
      const confirmation = page.getByRole("dialog");
      await expect(confirmation).toBeVisible();
      await confirmation.getByRole("button", { name: "Kirim tanggapan", exact: true }).click();
      await expect(page.getByText("Tanggapan berhasil disimpan.", { exact: true })).toBeVisible();
    } else if (sample.status === "closed") {
      await expect(page.getByText(publicFormFixtureClosure.message, { exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "Formulir tidak ditemukan" })).toBeVisible();
    }
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${caseId}.png`), animations: "disabled", fullPage: true });
  });
}

for (const width of [380, 1536]) {
  test(`authored linear scale stays selectable at ${width}px`, async ({ page }, info) => {
    const sample = publicFormFixtureEnvelope("forms-ready");
    if (!("form" in sample) || !sample.form) throw new Error("Missing public form fixture.");
    const form = { ...sample.form, questions: [{ type: "SCALE", title: "Nilai tutorial", scaleLow: 0, scaleHigh: 10 }] };

    await page.setViewportSize({ width, height: width === 380 ? 844 : 864 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route(`${origin}/**`, route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/forms/authored-scale") {
        return route.fulfill({ contentType: "text/html", body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>' });
      }
      if (url.pathname === "/api/forms/authored-scale") return route.fulfill({ json: { success: true, form } });
      return route.fulfill({ status: 204 });
    });
    await page.goto(origin + "/forms/authored-scale");
    await page.addStyleTag({ content: fixture.styles });
    await page.addScriptTag({ content: fixture.script });
    const first = page.getByRole("button", { name: "0", exact: true });
    const last = page.getByRole("button", { name: "10", exact: true });
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await last.click();
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`authored-scale-${width}.png`), animations: "disabled", fullPage: true });
  });
}
