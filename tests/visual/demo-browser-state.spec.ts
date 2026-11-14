import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { demoWeekSessions, initialDemoState } from "@/lib/demo-state";
import { addCalendarDays, getJakartaCalendarDate } from "@/lib/date-utils";

test.setTimeout(120_000);
const path = (view: string) => `/visual-fixtures/demo-community?view=${view}`;
const key = "zyx-public-demo:v1:/courses/demo-math";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.exposeFunction("demoErrors", () => errors);
});

async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.addStyleTag({ content: "nextjs-portal { display:none!important } *,*::before,*::after { animation:none!important; transition:none!important }" });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const screenshot = info.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: await page.getByRole("dialog", { includeHidden: true }).count() === 0, animations: "disabled" });
  await info.attach(name, { path: screenshot, contentType: "image/png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { demoErrors: () => Promise<string[]> }).demoErrors())).toEqual([]);
}

async function goto(page: Page, view: string) {
  const response = await page.goto(path(view), { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path(view));
  await page.addStyleTag({ content: "nextjs-portal { display:none!important } *,*::before,*::after { animation:none!important; transition:none!important }" });
}

test("weekly sessions, files, links, rescheduling and new bookings survive reload", async ({ page }, info) => {
  const mutations: string[] = [];
  page.on("request", request => { if (request.method() !== "GET") mutations.push(request.url()); });
  await goto(page, "schedule");
  await page.getByLabel("Tanggal", { exact: true }).fill("2032-12-31");
  await expect(page.getByRole("button", { name: "Detail sesi", exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: "Detail sesi", exact: true }).first().click();
  await capture(page, info, "session-open");
  await page.getByLabel("Catatan sesi").fill("Bahas limit kiri dan kanan.");
  await page.getByLabel("Unggah berkas", { exact: true }).setInputFiles({ name: "latihan.txt", mimeType: "text/plain", buffer: Buffer.from("materi demo lokal") });
  await page.getByLabel("Lampiran", { exact: true }).click();
  await page.getByRole("option", { name: "Sesudah sesi", exact: true }).click();
  await page.getByLabel("Tautan materi").fill("https://example.com/materi");
  await page.getByRole("button", { name: "Tambah tautan" }).click();
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByLabel("Tanggal", { exact: true }).fill("2032-12-31");
  await page.getByRole("button", { name: "Detail sesi", exact: true }).first().click();
  await expect(page.getByLabel("Catatan sesi")).toHaveValue("Bahas limit kiri dan kanan.");
  await expect(page.getByRole("link", { name: "https://example.com/materi" })).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "latihan.txt", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("latihan.txt");
  expect(await readFile((await download.path())!, "utf8")).toBe("materi demo lokal");
  await capture(page, info, "session-files-persisted");
  await page.getByRole("button", { name: "Simpan sesi" }).scrollIntoViewIfNeeded();
  await capture(page, info, "session-resources-bottom");
  await page.getByLabel("Tanggal sesi", { exact: true }).fill("2033-01-05");
  await page.getByLabel("Status sesi").click();
  await expect(page.getByRole("option", { name: "Dibatalkan", exact: true })).toBeVisible();
  await capture(page, info, "session-status-open");
  await page.getByRole("option", { name: "Dibatalkan", exact: true }).click({ timeout: 5000 });
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Detail sesi", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Minggu berikutnya" }).click();
  await expect(page.getByRole("button", { name: "Detail sesi", exact: true })).toHaveCount(4);
  await expect(page.getByText("Dibatalkan", { exact: true })).toBeVisible();
  await capture(page, info, "week-rescheduled-cancelled");
  await page.getByRole("button", { name: "Pesan sesi", exact: true }).click();
  await page.getByLabel("Topik", { exact: true }).fill("Diskusi tambahan");
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByLabel("Tanggal", { exact: true }).fill("2033-01-07");
  await expect(page.getByText("Diskusi tambahan", { exact: true })).toBeVisible();
  await capture(page, info, "week-new-booking");
  await page.getByRole("listitem").filter({ hasText: "Diskusi tambahan" }).getByRole("button", { name: "Detail sesi", exact: true }).click();
  await page.getByLabel("Status sesi").click();
  await page.getByRole("option", { name: "Selesai", exact: true }).click();
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("listitem").filter({ hasText: "Dibatalkan" }).getByRole("button", { name: "Detail sesi", exact: true }).click();
  await page.getByRole("button", { name: "Hapus", exact: true }).first().click();
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByLabel("Tanggal", { exact: true }).fill("2033-01-07");
  await page.getByRole("listitem").filter({ hasText: "Dibatalkan" }).getByRole("button", { name: "Detail sesi", exact: true }).click();
  await expect(page.getByRole("button", { name: "latihan.txt", exact: true })).toHaveCount(0);
  await capture(page, info, "session-file-deleted");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await goto(page, "groups");
  await expect(page.getByText("1 sesi selesai", { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test("group edits persist across navigation and reject duplicate members", async ({ page }, info) => {
  await goto(page, "groups");
  await page.getByLabel("Nama kelompok", { exact: true }).fill("Kelompok Integral");
  await page.getByLabel("Anggota, satu nama per baris").fill("Kamu\nAlya\nAlya");
  await page.getByRole("button", { name: "Simpan kelompok" }).click();
  await expect(page.getByRole("status")).toContainText("nama berbeda");
  await capture(page, info, "group-invalid");
  await page.getByLabel("Anggota, satu nama per baris").fill("Kamu\nAlya\nBima");
  await page.getByRole("button", { name: "Simpan kelompok" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kelompok Integral" })).toBeVisible();
  await expect(page.getByText("3 dari 6 orang")).toBeVisible();
  await capture(page, info, "group-saved");
  await goto(page, "schedule");
  await expect(page.getByText("Kelompok Integral", { exact: true })).toHaveCount(3);
});

test("quiz progress updates local ranking and flashcards resume after reload", async ({ page }, info) => {
  await page.route("**/api/demo/quiz", route => route.fulfill({ json: {
    score: 3, results: [0, 1, 2].map(index => ({ index, isCorrect: true, explanation: "Benar." })),
  } }));
  await goto(page, "quiz");
  await capture(page, info, "quiz-initial");
  for (const fieldset of await page.locator("fieldset").all()) await fieldset.locator("input").first().check();
  await page.reload();
  await expect(page.locator('input:checked')).toHaveCount(3);
  await page.getByRole("button", { name: "Kirim jawaban" }).click();
  await expect(page.getByText("Skor demo: 3 dari 3")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Skor demo: 3 dari 3")).toBeVisible();
  await capture(page, info, "quiz-result-persisted");
  await goto(page, "leaderboard");
  await expect(page.getByRole("row").nth(1)).toContainText("Kamu");
  await expect(page.getByRole("row").nth(1)).toContainText("100");
  await capture(page, info, "ranking-updated");
  await goto(page, "flashcards");
  await capture(page, info, "flashcard-initial");
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await page.getByRole("button", { name: /Klik untuk membalik/ }).click();
  await page.reload();
  await expect(page.getByText("2 dari 2", { exact: true })).toBeVisible();
  await expect(page.getByText("Nilai yang didekati suatu fungsi.", { exact: true })).toBeVisible();
  await capture(page, info, "flashcard-persisted");
});

test("failed metadata save rolls back files and preserves draft for retry", async ({ page }, info) => {
  await goto(page, "schedule");
  await page.getByRole("button", { name: "Detail sesi", exact: true }).first().click();
  await page.getByLabel("Unggah berkas", { exact: true }).setInputFiles({ name: "gagal.txt", mimeType: "text/plain", buffer: Buffer.from("pending") });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreDemoStorage: () => void }).restoreDemoStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("zyx-public-demo:")) throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  await expect(page.getByRole("alert")).toContainText("Perubahan belum tersimpan");
  await expect(page.getByRole("button", { name: "gagal.txt", exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  expect(await page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.open("zyx-public-demo-files", 1);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("files");
      const query = transaction.objectStore("files").getAllKeys();
      query.onsuccess = () => resolve(query.result.length);
      transaction.oncomplete = () => db.close();
    };
  }))).toBe(0);
  await page.getByRole("alert").scrollIntoViewIfNeeded();
  await capture(page, info, "storage-full");
  await page.evaluate(() => (window as unknown as { restoreDemoStorage: () => void }).restoreDemoStorage());
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Detail sesi", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "gagal.txt", exact: true })).toBeVisible();
});

test("blocked file storage reports failure without a false saved session", async ({ page }, info) => {
  await page.addInitScript(() => Object.defineProperty(window, "indexedDB", { get: () => { throw new DOMException("Blocked", "SecurityError"); } }));
  await goto(page, "schedule");
  await page.getByRole("button", { name: "Detail sesi", exact: true }).first().click();
  await page.getByLabel("Unggah berkas", { exact: true }).setInputFiles({ name: "blocked.txt", mimeType: "text/plain", buffer: Buffer.from("pending") });
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  await expect(page.getByRole("alert")).toContainText("Berkas belum tersimpan");
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  await page.getByRole("alert").scrollIntoViewIfNeeded();
  await capture(page, info, "file-storage-blocked");
});

test("moving all seeds keeps an actionable empty week", async ({ page }, info) => {
  const sessions = demoWeekSessions(getJakartaCalendarDate(), "Limit", {});
  const state = { ...initialDemoState(), sessions: Object.fromEntries(sessions.map(session => [session.id, { ...session, date: addCalendarDays(session.date, 7) }])) };
  await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key, state });
  await goto(page, "schedule");
  await expect(page.getByText("Tidak ada sesi minggu ini", { exact: true })).toBeVisible();
  await capture(page, info, "week-empty");
  await page.getByRole("button", { name: "Pesan sesi", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
