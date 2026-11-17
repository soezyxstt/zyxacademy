import { expect, test, type Page, type TestInfo, type Route } from "@playwright/test";
import { buildFixture } from "./fixtures/query-data-layer-build";

// The isolated bundle includes the real article graph renderer and CSS.
test.setTimeout(60_000);

let fixture: Awaited<ReturnType<typeof buildFixture>>;
test.beforeAll(async () => { fixture = await buildFixture(); });
const origin = "http://fixture.invalid";

async function boot(page: Page, search: string, handler?: (route: Route, url: URL) => Promise<boolean>) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { errors.push(`Unexpected origin ${url.origin}`); return route.abort(); }
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>' });
    if (handler && await handler(route, url)) return;
    errors.push(`Unexpected request ${route.request().method()} ${url.pathname}`);
    return route.abort();
  });
  await page.goto(`${origin}/?${search}`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({ content: fixture.styles });
  await page.addScriptTag({ content: fixture.script });
  return errors;
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}
async function confirm(page: Page) {
  await page.getByRole("button", { name: "Kumpulkan kuis", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  return page.getByRole("button", { name: "Ya, kumpulkan", exact: true });
}

test("shared reads deduplicate, switch accounts and reject malformed refreshes", async ({ page }) => {
  const counts: Record<string, number> = {};
  let invalid = false;
  const errors = await boot(page, "surface=cache", async (route, url) => {
    if (url.pathname !== "/api/student/today") return false;
    const owner = route.request().headers()["x-student-id"];
    counts[owner] = (counts[owner] ?? 0) + 1;
    await route.fulfill({ json: invalid ? { broken: true } : { streak: { current: 1, longest: 2 }, items: [{ id: "x", kind: "quiz", title: owner, href: "/quiz", done: false }] } }); return true;
  });
  await expect(page.getByTestId("first")).toHaveText("alice");
  await expect(page.getByTestId("second")).toHaveText("alice");
  expect(counts.alice).toBe(1);
  await page.getByRole("button", { name: "Switch account" }).click();
  await expect(page.getByTestId("first")).toHaveText("bob");
  await expect(page.getByTestId("second")).toHaveText("bob");
  expect(counts.bob).toBe(1);
  invalid = true;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByTestId("first")).toHaveText("invalid");
  expect(counts.bob).toBe(2); expect(errors).toEqual([]);
});

test("quiz keeps typed answers and submits a demo snapshot once without private requests", async ({ page }, info) => {
  const errors = await boot(page, "surface=quiz");
  await page.getByRole("radio").first().click();
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("textbox").first().fill("N");
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.locator("textarea").fill("Gaya sama dengan massa dikali percepatan.");
  await capture(page, info, "quiz-answers");
  const submit = await confirm(page);
  await capture(page, info, "quiz-confirmation");
  await submit.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(async () => JSON.parse(await page.getByTestId("receipts").innerText()).length).toBe(1);
  const saved = JSON.parse(await page.getByTestId("receipts").innerText())[0];
  expect(saved["q-choice"]).toEqual([0]); expect(saved["q-short"]).toBe("N");
  expect(saved["q-essay"].text).toBe("Gaya sama dengan massa dikali percepatan.");
  expect(errors).toEqual([]);
});

test("failed quiz submission retains the draft and allows one manual retry", async ({ page }, info) => {
  let writes = 0;
  const errors = await boot(page, "surface=quiz&live=1", async (route, url) => {
    if (url.pathname !== "/api/quiz/attempts/query-fixture-live") return false;
    writes++; await route.fulfill({ status: writes === 1 ? 503 : 200, json: { ok: writes > 1 } }); return true;
  });
  await page.getByRole("radio").first().click();
  const submit = await confirm(page); await submit.click();
  await expect(page.getByText("Gagal mengumpulkan kuis. Silakan coba kembali.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zyx-quiz-answers-query-fixture-live") ?? "{}")["q-choice"])).toBe(0);
  await capture(page, info, "quiz-save-error");
  await submit.click();
  await expect.poll(() => writes).toBe(2);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zyx-quiz-answers-query-fixture-live"))).toBeNull();
  expect(errors).toEqual([]);
});

test("expiry does not replay a failed quiz submission on later timer ticks", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-17T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-17T12:00:01Z"));
  let writes = 0;
  const errors = await boot(page, "surface=quiz&live=1&seconds=2", async (route, url) => {
    if (url.pathname !== "/api/quiz/attempts/query-fixture-live") return false;
    writes++; await route.fulfill({ status: 503, json: { error: "unavailable" } }); return true;
  });
  await page.getByRole("radio").first().click();
  await page.clock.runFor(3500);
  await expect.poll(() => writes).toBe(1);
  await page.clock.runFor(12_000);
  expect(writes).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("zyx-quiz-answers-query-fixture-live"))).not.toBeNull();
  expect(errors).toEqual([]);
});

test("flashcard grading stays local to the demo adapter and ignores repeated clicks", async ({ page }, info) => {
  const errors = await boot(page, "surface=flashcards");
  await page.getByText("Ketuk untuk membalik kartu", { exact: true }).click();
  await page.getByRole("button", { name: "Mudah", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(async () => JSON.parse(await page.getByTestId("receipts").innerText()).length).toBe(1);
  await expect(page.getByText("Kecepatan", { exact: true })).toBeVisible();
  await capture(page, info, "flashcards-next-card");
  expect(errors).toEqual([]);
});

test("read-only article previews render without Query context and never save student progress", async ({ page }, info) => {
  const errors = await boot(page, "surface=article&preview=1");
  await expect(page.getByRole("heading", { name: "Bilangan real dan representasi desimal", exact: true })).toBeVisible();
  await capture(page, info, "article-preview");
  await page.evaluate(() => window.unmountQueryFixture());
  expect(errors).toEqual([]);
});

test("article progress consumes elapsed time once and ignores hidden document time", async ({ page }, info) => {
  await page.clock.install({ time: new Date("2026-11-17T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-17T12:00:01Z"));
  const writes: { sectionId: string; percent: number; timeSpentSeconds: number; completed?: boolean }[] = [];
  const errors = await boot(page, "surface=article", async (route, url) => {
    if (!url.pathname.endsWith("/progress")) return false;
    expect(route.request().headers()["x-student-id"]).toBe("fixture-student");
    const data = route.request().postDataJSON(); writes.push(data);
    await route.fulfill({ json: { success: true, sectionId: data.sectionId, maxReadPercent: data.percent, completed: Boolean(data.completed), timeSpentSeconds: data.timeSpentSeconds, completedAt: null } }); return true;
  });
  await expect(page.getByRole("heading", { name: "Bilangan real dan representasi desimal", exact: true })).toBeVisible();
  await page.clock.runFor(4500);
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }));
  await page.clock.runFor(5000);
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }));
  await page.clock.runFor(1500);
  await capture(page, info, "article-reading");
  await page.evaluate(() => window.unmountQueryFixture());
  await expect.poll(() => writes.reduce((sum, item) => sum + item.timeSpentSeconds, 0)).toBeGreaterThan(0);
  expect(writes.reduce((sum, item) => sum + item.timeSpentSeconds, 0)).toBeLessThanOrEqual(7);
  expect(writes.every((item) => item.timeSpentSeconds >= 0)).toBe(true);
  expect(errors).toEqual([]);
});
