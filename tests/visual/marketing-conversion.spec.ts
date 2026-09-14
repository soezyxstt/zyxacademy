import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

test.setTimeout(120_000);

async function stabilize(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      nextjs-portal { display: none !important; }
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(async () => document.fonts.ready);
}

async function capture(page: Page, testInfo: TestInfo, target: Locator, name: string) {
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const offset = window.innerWidth < 768 ? 72 : 80;
    window.scrollBy(0, -offset);
  });
  await stabilize(page);
  const path = testInfo.outputPath(`screenshots/${name}.png`);
  await target.screenshot({ path, animations: "disabled", caret: "hide" });
  await testInfo.attach(name, { path, contentType: "image/png" });

  const bounds = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(bounds.scroll, `Horizontal overflow: ${bounds.scroll}px in ${bounds.client}px`).toBeLessThanOrEqual(
    bounds.client,
  );
}

function observeFailures(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("favicon")) {
      errors.push(`http: ${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

test.describe("Marketing conversion homepage", () => {
  test("funnel copy and interactive learning demos", async ({ page }, testInfo) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.getByRole("heading", { name: "Pahami materi kuliah ITB, dengan arah yang jelas." })).toBeVisible();
    // The shared marketing navbar has a pre-existing auth hydration transition
    // on the initial render. Start the feature observer after that settles so
    // this spec reports errors introduced by the interactions it exercises.
    await page.waitForTimeout(500);
    const errors = observeFailures(page);
    const hero = page.locator('[aria-labelledby="landing-hero-heading"]');
    await expect(page.getByRole("link", { name: "Mulai gratis", exact: true }).first()).toHaveAttribute("href", "/sign-up");
    await expect(hero.getByRole("link", { name: "Coba demo", exact: true })).toHaveAttribute("href", "/demo");
    await expect(page.getByRole("heading", { name: "Ruang belajar yang membuatmu berani bertanya." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cerita dari proses belajar yang nyata." })).toHaveCount(0);
    await expect(page.getByText("Gemini", { exact: true })).toHaveCount(0);

    await page.getByRole("slider", { name: "Ubah koefisien a pada grafik kuadratik" }).fill("-0.16");
    await capture(page, testInfo, hero, `${testInfo.project.name}-home-hero-graph`);

    const quiz = page.locator('[aria-labelledby="landing-quiz-heading"]');
    const quizButtons = quiz.locator("button");
    await expect(quizButtons).toHaveCount(4);
    await capture(page, testInfo, quiz, `${testInfo.project.name}-home-quiz-idle`);
    await quizButtons.nth(1).click();
    await expect(quiz.getByText("Benar!", { exact: true })).toBeVisible();
    await capture(page, testInfo, quiz, `${testInfo.project.name}-home-quiz-correct`);
    await quiz.getByRole("button", { name: "Coba lagi" }).click();
    await capture(page, testInfo, quiz, `${testInfo.project.name}-home-quiz-reset`);
    await quizButtons.nth(0).click();
    await expect(quiz.getByText("Kenapa salah?", { exact: true })).toBeVisible();
    await capture(page, testInfo, quiz, `${testInfo.project.name}-home-quiz-wrong`);

    const flashcards = page.locator('[aria-labelledby="landing-flashcards-heading"]');
    const flashcard = flashcards.getByRole("button", { name: "Klik untuk membalik kartu" });
    await expect(flashcard).toBeVisible();
    await capture(page, testInfo, flashcards, `${testInfo.project.name}-home-flashcard-front`);
    await flashcard.click();
    await expect(flashcards.getByRole("button", { name: "Kartu terbalik ; klik untuk kembali" })).toBeVisible();
    await capture(page, testInfo, flashcards, `${testInfo.project.name}-home-flashcard-back`);
    await flashcards.getByRole("button", { name: "Bagus" }).click();
    await expect(flashcards.getByText("diulang 6 hari lagi", { exact: false })).toBeVisible();
    await capture(page, testInfo, flashcards, `${testInfo.project.name}-home-flashcard-rated`);

    const path = page.locator('[aria-labelledby="landing-path-heading"]');
    await expect(path.getByText("Integral", { exact: true })).toBeVisible();
    await expect(path.getByText("terbuka", { exact: true })).toBeVisible();
    await capture(page, testInfo, path, `${testInfo.project.name}-home-path-a`);
    await path.getByRole("button", { name: "Mahasiswa B" }).click();
    await expect(path.getByRole("button", { name: "Mahasiswa B" })).toHaveAttribute("aria-pressed", "true");
    await expect(path.getByText("Integral Parsial", { exact: true })).toBeVisible();
    await capture(page, testInfo, path, `${testInfo.project.name}-home-path-b`);

    const faq = page.locator('[aria-labelledby="landing-faq-heading"]');
    const firstFaq = faq.locator("details").first();
    await expect(firstFaq).not.toHaveAttribute("open", "");
    await capture(page, testInfo, faq, `${testInfo.project.name}-home-faq-closed`);
    await firstFaq.locator("summary").click();
    await expect(firstFaq).toHaveAttribute("open", "");
    await capture(page, testInfo, faq, `${testInfo.project.name}-home-faq-open`);

    const closing = page.locator('[aria-labelledby="closing-heading"]');
    await expect(closing.getByRole("link", { name: "Lihat paket" })).toHaveAttribute("href", "/plans");
    await expect(closing.getByRole("link", { name: "Coba demo", exact: true })).toHaveAttribute("href", "/demo");
    await capture(page, testInfo, closing, `${testInfo.project.name}-home-closing-cta`);
    expect(errors).toEqual([]);
  });

  test("tutor chat playback and replay", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.getByRole("heading", { name: "Pahami materi kuliah ITB, dengan arah yang jelas." })).toBeVisible();
    await page.waitForTimeout(500);
    const errors = observeFailures(page);
    const tutor = page.locator('[aria-labelledby="landing-tutor-heading"]');
    await tutor.scrollIntoViewIfNeeded();
    const replay = tutor.getByRole("button", { name: "Putar ulang" });
    await expect(tutor.getByLabel("Zyra sedang mengetik")).toBeVisible({ timeout: 10_000 });
    await capture(page, testInfo, tutor, `${testInfo.project.name}-home-chat-running`);
    await expect(replay).toBeEnabled({ timeout: 15_000 });
    await capture(page, testInfo, tutor, `${testInfo.project.name}-home-chat-complete`);

    await replay.click();
    await expect(replay).toBeDisabled();
    await expect(tutor.getByLabel("Zyra sedang mengetik")).toBeVisible({ timeout: 10_000 });
    await capture(page, testInfo, tutor, `${testInfo.project.name}-home-chat-replay`);
    await expect(replay).toBeEnabled({ timeout: 15_000 });
    expect(errors).toEqual([]);
  });
});
