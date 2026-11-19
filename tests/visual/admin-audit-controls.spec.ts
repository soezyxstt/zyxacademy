import { expect, test } from "@playwright/test";

const fixture = "/visual-fixtures/admin-audit-controls";
test.setTimeout(120_000);

test("assessment identifies its course and groups consequential actions", async ({ page }, info) => {
  const mutations: string[] = [];
  await page.route("**/api/admin/assessments/**", async (route) => {
    mutations.push(route.request().method());
    await route.fulfill({ status: 200, json: {} });
  });
  await page.goto(fixture);
  await expect(page.getByRole("heading", { name: "Ujian kalkulus dan penerapannya", level: 2 })).toBeVisible();
  await expect(page.getByText("Matematika I", { exact: true })).toBeVisible();
  const actions = page.getByRole("button", { name: "Aksi asesmen", exact: true });
  await actions.click();
  await expect(page.getByRole("menuitem", { name: "Ingest ulang soal" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Hapus permanen" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("assessment-actions.png"), style: "nextjs-portal { display: none }" });
  await page.getByRole("menuitem", { name: "Arsipkan ujian" }).click();
  const confirmation = page.getByRole("dialog", { name: "Arsipkan ujian" });
  await expect(confirmation).toContainText("Ujian kalkulus dan penerapannya");
  await page.screenshot({ path: info.outputPath("assessment-archive-confirmation.png"), style: "nextjs-portal { display: none }" });
  await confirmation.getByRole("button", { name: "Batal" }).click();
  await expect(confirmation).toBeHidden();
  expect(mutations).toEqual([]);
});

test("flashcard search preserves an active chapter and offers one create menu", async ({ page }, info) => {
  await page.goto(`${fixture}?view=flashcards`);
  const create = page.getByRole("button", { name: "Tambah kartu atau set", exact: true });
  await create.click();
  await expect(page.getByRole("menuitem", { name: "Tambah set", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Tambah kartu", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("flashcard-create-menu.png"), style: "nextjs-portal { display: none }" });
  await page.keyboard.press("Escape");
  const chapter = page.locator("button[role=combobox]").first();
  await chapter.click();
  await page.getByRole("option", { name: /Limit fungsi dan kekontinuan/ }).click();
  await page.getByRole("button", { name: /Cari/ }).click();
  await expect(page.getByRole("textbox", { name: /Cari/ })).toBeFocused();
  await expect(chapter).toContainText("Limit fungsi dan kekontinuan");
  await expect(chapter).toBeVisible();
  await page.screenshot({ path: info.outputPath("flashcard-active-filter.png"), style: "nextjs-portal { display: none }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("attempt scores are readable on mobile and the desktop matrix remains available", async ({ page }, info) => {
  const attemptsPath = "/api/admin/quiz-insights/visual-quiz/attempts";
  await page.route((url) => url.pathname === attemptsPath, (route) =>
    route.fulfill({
      json: {
        attempts: [{
          id: "visual-attempt",
          studentId: "visual-student",
          studentName: "Nadia Putri",
          studentEmail: "nadia@example.test",
          score: 85,
          durationSeconds: 150,
          status: "completed",
          startedAt: "2026-11-01T00:00:00Z",
          submittedAt: "2026-11-01T00:02:30Z",
          questionsSnapshot: [{ id: "q1", prompt: "Berapa nilai limit?", options: ["Nol", "Satu"], correctIndices: [1] }],
          answersSnapshot: { q1: 0 },
        }],
      },
    })
  );
  const response = page.waitForResponse((res) => new URL(res.url()).pathname === attemptsPath);
  await page.goto(`${fixture}?view=attempts`);
  expect((await response).ok()).toBe(true);
  await expect(page.getByText("Nadia Putri", { exact: true }).filter({ visible: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("85", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Filter pengerjaan", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Status" })).toBeVisible();
  await page.keyboard.press("Escape");
  if (page.viewportSize()!.width < 768) {
    await expect(page.getByRole("table")).toBeHidden();
    await page.getByRole("button", { name: "Soal (1)", exact: true }).click();
    await expect(page.getByText("Berapa nilai limit?", { exact: true }).filter({ visible: true })).toBeVisible();
  } else {
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Nilai" })).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath("attempt-results.png"), style: "nextjs-portal { display: none }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
