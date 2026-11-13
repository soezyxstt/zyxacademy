import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { buildFixture } from "./fixtures/interactive-scene-build";
import { embed, machine } from "./fixtures/interactive-scene-data";

let fixture: Awaited<ReturnType<typeof buildFixture>>;
test.beforeAll(async () => { fixture = await buildFixture(); });

async function capture(page: Page, testInfo: TestInfo, locator: Locator, name: string) {
  await locator.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = testInfo.outputPath(`${name}.png`);
  await locator.screenshot({ path, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
async function expectReadableLabels(scene: Locator) {
  const plain = scene.locator("svg text").first();
  const math = scene.locator("svg foreignObject div").first();
  const plainSize = () => plain.evaluate(element => {
    const text = element as SVGTextElement;
    const ctm = text.getScreenCTM()!;
    return parseFloat(getComputedStyle(text).fontSize) * Math.hypot(ctm.a, ctm.b);
  });
  const mathSize = () => math.evaluate(element => {
    const transform = new DOMMatrix(getComputedStyle(element).transform);
    const svg = element.closest("foreignObject") as SVGForeignObjectElement;
    const ctm = svg.getScreenCTM()!;
    return parseFloat(getComputedStyle(element).fontSize) * transform.a * Math.hypot(ctm.a, ctm.b);
  });
  for (const size of [plainSize, mathSize]) {
    await expect.poll(size).toBeGreaterThanOrEqual(12);
    await expect.poll(size).toBeLessThanOrEqual(14);
  }
  const lastLabel = await scene.locator("svg text").last().boundingBox();
  const mathLabel = await math.boundingBox();
  expect(lastLabel!.x + lastLabel!.width).toBeLessThanOrEqual(mathLabel!.x);
}
async function boot(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(`page: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`http ${response.status()}: ${response.url()}`); });
  await page.clock.install({ time: new Date("2026-06-01T00:00:00Z") });
  await page.route("**/*", async route => {
    const request = route.request();
    if (request.url() === "http://fixture.invalid/" && request.method() === "GET") {
      await route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>' });
    } else if (request.url() === "http://fixture.invalid/api/materials/formative-check/reveal" && request.method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ answer: `A.\n\n${embed(machine("formative_answer", "Diagram jawaban formatif"))}`, explanation: `Perhatikan bentuknya.\n\n${embed(machine("formative_review", "Diagram pembahasan formatif"))}` }) });
    } else {
      failures.push(`unexpected request: ${request.method()} ${request.url()}`);
      await route.abort();
    }
  });
  await page.goto("http://fixture.invalid/");
  await page.addStyleTag({ content: fixture.styles });
  await page.addScriptTag({ content: fixture.script });
  expect(failures, "Fixture boot errors").toEqual([]);
  let rejectBoot: (error: Error) => void = () => {};
  const bootError = new Promise<never>((_, reject) => { rejectBoot = reject; });
  page.on("pageerror", rejectBoot);
  try {
    await Promise.race([page.locator('[data-fixture="invalid"]').waitFor({ state: "attached", timeout: 10_000 }), bootError]);
    expect(failures, "Fixture boot errors").toEqual([]);
  } finally {
    page.off("pageerror", rejectBoot);
  }
  return failures;
}

test("article, structured reference and quiz keep scene controls independent", async ({ page }, info) => {
  test.setTimeout(120_000);
  const failures = await boot(page);
  const article = page.locator('[data-fixture="article"]');
  const articleScene = article.getByRole("figure", { name: "Diagram artikel", exact: true });
  await expect(articleScene.locator("svg rect")).toHaveCount(1);
  await expect(articleScene.locator("svg .katex")).toBeVisible();
  await expectReadableLabels(articleScene);
  await expect(page.locator('[data-fixture="singular"] [data-interactive-scene]')).toHaveCount(0);
  await expect(article.locator(".katex").first()).toBeVisible();
  await capture(page, info, article, "article-initial");
  const select = articleScene.getByRole("combobox", { name: "Langkah" });
  for (const [step, count] of [[2, 4], [3, 9], [4, 16]] as const) {
    await select.click();
    await page.getByRole("option", { name: String(step), exact: true }).click();
    await expect(articleScene.locator("svg rect")).toHaveCount(count);
    await expect(articleScene).toContainText(`Persegi: ${count}`);
  }
  await articleScene.getByRole("button", { name: "Ubah cabang" }).press("Enter");
  await expect(articleScene.getByRole("button", { name: "Cabang", exact: true })).toHaveAttribute("aria-pressed", "true");
  await capture(page, info, article, "article-changed");
  const structured = page.locator('[data-fixture="structured"]');
  await structured.scrollIntoViewIfNeeded();
  await expect(structured.getByRole("figure", { name: "Diagram artikel terstruktur" }).locator("svg rect")).toHaveCount(1);
  await capture(page, info, structured, "structured-reference");
  const quiz = page.locator('[data-fixture="quiz"]');
  const prompt = quiz.getByRole("figure", { name: "Diagram soal", exact: true });
  await prompt.scrollIntoViewIfNeeded();
  await expect(prompt.locator("svg rect")).toHaveCount(1);
  const answer = quiz.locator("[data-question-option]").first().getByRole("radio");
  const option = quiz.getByRole("figure", { name: "Diagram pilihan", exact: true });
  await option.scrollIntoViewIfNeeded();
  await expectReadableLabels(option);
  await expect(answer).toHaveAttribute("aria-checked", "false");
  await capture(page, info, quiz, "quiz-unselected");
  await option.getByRole("combobox", { name: "Langkah" }).click();
  await page.getByRole("option", { name: "4", exact: true }).click();
  await expect(answer).toHaveAttribute("aria-checked", "false");
  await option.getByRole("combobox", { name: "Langkah" }).click();
  const firstStep = page.getByRole("option", { name: "1", exact: true });
  await firstStep.focus(); await firstStep.press("Enter");
  await expect(option.locator("svg rect")).toHaveCount(1);
  await expect(answer).toHaveAttribute("aria-checked", "false");
  await option.getByRole("button", { name: "Ubah cabang" }).click();
  await expect(answer).toHaveAttribute("aria-checked", "false");
  await answer.click();
  await option.getByRole("button", { name: "Cabang", exact: true }).click();
  await expect(answer).toHaveAttribute("aria-checked", "true");
  await capture(page, info, quiz, "quiz-selected");
  await articleScene.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(articleScene.locator("svg rect")).toHaveCount(1);
  await expect(option.getByRole("button", { name: "Cabang", exact: true })).toHaveAttribute("aria-pressed", "false");
  await articleScene.getByRole("button", { name: "Tampilkan alternatif" }).click();
  await capture(page, info, article, "article-fallback");
  expect(failures).toEqual([]);
});

test("motion, manipulation, singular recovery and formative explanation", async ({ page }, info) => {
  test.setTimeout(120_000);
  const failures = await boot(page);
  const motionSection = page.locator('[data-fixture="explanation"]');
  const scene = motionSection.getByRole("figure", { name: "Batang berputar" });
  await scene.scrollIntoViewIfNeeded();
  const arm = scene.locator("svg line").nth(1);
  await expect(arm).toHaveAttribute("x2", "75");
  await expect(scene.getByRole("button", { name: "Putar" })).toBeEnabled();
  await page.clock.runFor(1000);
  await expect(arm).toHaveAttribute("x2", "75");
  await capture(page, info, motionSection, "motion-paused-initial");
  await scene.getByRole("button", { name: "Putar" }).click();
  await page.clock.runFor(1000);
  await scene.getByRole("button", { name: "Jeda" }).click();
  const x = Number(await arm.getAttribute("x2"));
  const y = Number(await arm.getAttribute("y2"));
  expect(x).toBeLessThan(74);
  expect(Math.hypot(x - 50, y - 40)).toBeCloseTo(25, 3);
  await expect(scene).toContainText(`Koordinat x: ${Number((x - 50).toPrecision(6))}`);
  await page.clock.runFor(1000);
  expect(Number(await arm.getAttribute("x2"))).toBe(x);
  await capture(page, info, motionSection, "motion-paused-changed");
  await scene.getByRole("button", { name: "Putar" }).click();
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(scene.getByRole("button", { name: "Putar" })).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); });
  await scene.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(arm).toHaveAttribute("x2", "75");
  const timeSlider = scene.getByRole("slider", { name: /Waktu/ });
  await timeSlider.focus(); await timeSlider.press("ArrowRight");
  expect(Number(await arm.getAttribute("x2"))).toBeCloseTo(50 + 25 * Math.cos(0.1), 5);
  await capture(page, info, motionSection, "motion-scrubbed");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(scene.getByRole("button", { name: "Putar" })).toBeDisabled();
  await capture(page, info, motionSection, "motion-reduced");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const pointSection = page.locator('[data-fixture="drag"]');
  const point = pointSection.locator('[aria-label="Pindahkan titik"]');
  await point.scrollIntoViewIfNeeded();
  await point.focus();
  await point.press("ArrowRight");
  await expect(point).toBeFocused();
  const focusSize = () => point.evaluate(element => {
    const group = element as SVGGElement;
    const scale = Math.hypot(group.getScreenCTM()!.a, group.getScreenCTM()!.b);
    const style = getComputedStyle(group);
    return { width: parseFloat(style.outlineWidth) * scale, offset: parseFloat(style.outlineOffset) * scale, scale };
  });
  await expect(point).toHaveCSS("outline-style", "solid");
  const focus = await focusSize();
  // Chromium quantizes SVG outlines to whole user units, including a one-unit minimum.
  expect(focus.width).toBeGreaterThan(0);
  expect(Math.abs(focus.width - 2)).toBeLessThanOrEqual(focus.scale);
  expect(focus.offset).toBeGreaterThan(0);
  expect(Math.abs(focus.offset - 4)).toBeLessThanOrEqual(focus.scale);
  await expect(point.locator("circle")).toHaveAttribute("cx", "21");
  await capture(page, info, pointSection, "drag-keyboard-focus");
  const svg = pointSection.locator("svg");
  const box = (await svg.boundingBox())!;
  const dot = (await point.boundingBox())!;
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .7, box.y + box.height * .5); await page.mouse.up();
  await expect(point.locator("circle")).toHaveAttribute("cx", "70");
  await pointSection.getByRole("heading", { name: "Manipulasi titik" }).click();
  await expect(point).not.toBeFocused();
  await expect(point).toHaveCSS("outline-style", "none");
  await capture(page, info, pointSection, "drag-pointer");
  await pointSection.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(point.locator("circle")).toHaveAttribute("cx", "20");
  const singular = page.locator('[data-fixture="singular"]');
  await singular.scrollIntoViewIfNeeded();
  const slider = singular.getByRole("slider", { name: /Pembagi/ });
  await slider.focus(); await slider.press("ArrowRight");
  await expect(singular.getByRole("status")).toContainText("tidak dapat ditampilkan");
  await expect(singular.getByRole("status")).toContainText("Nilai tidak terdefinisi pada satu.");
  await capture(page, info, singular, "singular-invalid");
  await slider.press("ArrowRight");
  await expect(singular.locator("svg circle")).toHaveAttribute("cx", "60");
  await capture(page, info, singular, "singular-recovered");
  const invalid = page.locator('[data-fixture="invalid"]');
  await expect(invalid.locator("[data-content-visual-error]")).toHaveCount(2);
  await expect(invalid).toContainText("Teks sebelum visual."); await expect(invalid).toContainText("Teks setelah visual.");
  expect(await page.evaluate(() => (window as unknown as {fixtureExecuted?: boolean}).fixtureExecuted)).toBeUndefined();
  await capture(page, info, invalid, "unsafe-payload");
  const formative = page.locator('[data-fixture="formative"]');
  const formativeScene = formative.getByRole("figure", { name: "Diagram formatif", exact: true });
  await formativeScene.scrollIntoViewIfNeeded();
  const radio = formative.getByRole("radio").first();
  const formativeOption = formative.getByRole("figure", { name: "Diagram pilihan formatif", exact: true });
  await formativeOption.scrollIntoViewIfNeeded();
  await expectReadableLabels(formativeOption);
  await formativeOption.getByRole("button", { name: "Ubah cabang" }).click();
  await expect(radio).toHaveAttribute("aria-checked", "false");
  await formativeScene.getByRole("button", { name: "Ubah cabang" }).click();
  await expect(radio).toHaveAttribute("aria-checked", "false");
  await radio.click();
  await formativeScene.getByRole("button", { name: "Cabang", exact: true }).click();
  await expect(radio).toHaveAttribute("aria-checked", "true");
  await capture(page, info, formative, "formative-selected");
  await formative.getByRole("button", { name: "Buka jawaban dan pembahasan" }).click();
  const revealedAnswer = formative.getByRole("figure", { name: "Diagram jawaban formatif" });
  const revealedExplanation = formative.getByRole("figure", { name: "Diagram pembahasan formatif" });
  await revealedAnswer.scrollIntoViewIfNeeded();
  await expect(revealedAnswer.locator("svg rect")).toHaveCount(1);
  await revealedExplanation.scrollIntoViewIfNeeded();
  await expect(revealedExplanation.locator("svg rect")).toHaveCount(1);
  await capture(page, info, formative, "formative-explanation");
  expect(failures).toEqual([]);
});
