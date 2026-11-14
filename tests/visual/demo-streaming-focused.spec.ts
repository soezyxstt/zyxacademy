import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

test.skip(process.env.DEMO_STREAMING_VISUAL !== "1", "Requires the delayed credential-free demo harness");
const course = "fictional-berpikir";
const url = (view = "") => `/id/demo${view ? `/${view}` : ""}?course=${course}`;

async function capture(page: Page, info: TestInfo, name: string, target: Locator) {
  await expect(target).toBeVisible();
  await expect.poll(() => target.evaluate(element => {
    for (let current: Element | null = element; current; current = current.parentElement) {
      if (Number(getComputedStyle(current).opacity) < 0.99) return false;
    }
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  })).toBe(true);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

let failures: string[];
test.beforeEach(async ({ page }) => {
  failures = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
});
test.afterEach(() => { expect(failures).toEqual([]); });

test("dashboard streams its plan and mastery independently", async ({ page }, info) => {
  test.setTimeout(90000);
  await page.goto(url(), { waitUntil: "commit" });
  const plan = page.getByTestId("demo-today-plan-skeleton");
  const mastery = page.getByTestId("demo-mastery-skeleton");
  await expect(plan).toBeVisible({ timeout: 60000 });
  await expect(mastery).toBeAttached();
  const progress = page.locator('#main-content a[href="/id/demo/overview?course=fictional-fisika"]');
  await expect(progress).toBeVisible();
  await capture(page, info, "dashboard-partial", plan);
  const before = await progress.boundingBox();
  const skeletonBounds = await plan.boundingBox();
  await expect(plan).toBeHidden({ timeout: 60000 });
  await expect(mastery).toBeAttached();
  const after = await progress.boundingBox();
  const planBounds = await page.locator("main header:has(h1)").locator("..").boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(skeletonBounds).not.toBeNull();
  expect(planBounds).not.toBeNull();
  if (!before || !after || !skeletonBounds || !planBounds) throw new Error("Dashboard content disappeared during streaming");
  await info.attach("dashboard-geometry.json", { body: JSON.stringify({ before, after, skeletonBounds, planBounds }, null, 2), contentType: "application/json" });
  expect(Math.abs(before.y - after.y)).toBeLessThanOrEqual(16);
  expect(Math.abs(skeletonBounds.height - planBounds.height)).toBeLessThanOrEqual(16);
  await expect(mastery).toBeHidden({ timeout: 60000 });
  for (const id of ["fictional-berpikir", "fictional-fisika", "fictional-kimia", "fictional-matematika"]) {
    await expect(page.locator(`a[href*="mastery"][href*="${id}"]`)).toHaveCount(1);
  }
  await capture(page, info, "dashboard-ready", progress);
});

for (const [view, skeleton] of [
  ["overview", "course-overview-content-skeleton"],
  ["documents", "course-material-list-skeleton"],
  ["flashcards", "course-flashcard-skeleton"],
  ["quiz", "demo-quiz-player-skeleton"],
] as const) {
  test(`${view} shows a tailored fallback`, async ({ page }, info) => {
    test.setTimeout(120000);
    if (view === "overview") {
      await page.goto(url(), { waitUntil: "commit" });
      const courseLink = page.locator(`#main-content a[href="${url("overview")}"]`);
      await expect(courseLink).toBeVisible({ timeout: 60000 });
      await courseLink.click();
      await expect(page).toHaveURL(/\/demo\/overview\?course=fictional-berpikir/);
    } else {
      await page.goto(url(view), { waitUntil: "commit" });
    }
    const loading = page.locator("#main-content").getByTestId(skeleton);
    await expect(loading).toBeVisible({ timeout: 60000 });
    await capture(page, info, `${view}-loading`, loading);
    await expect(loading).toBeHidden({ timeout: 90000 });
    const ready = view === "flashcards"
      ? page.getByText("Pertanyaan kartu 1?", { exact: true })
      : page.locator("#main-content > div");
    await capture(page, info, `${view}-ready`, ready);
  });
}
