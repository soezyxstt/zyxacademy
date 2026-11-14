import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { addCalendarDays, assertCalendarDate } from "@/lib/date-utils";

const course = "fictional-berpikir";
const key = `zyx-demo-community:1:${course}:fixture-v1`;
test.setTimeout(180000);
test.use({ actionTimeout: 15000 });
function guard(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") && url.pathname !== "/api/demo/quiz") errors.push(`Private request ${url.pathname}`);
    if (!["GET", "HEAD"].includes(request.method()) && url.pathname !== "/api/demo/quiz") errors.push(`Mutation ${url.pathname}`);
  });
  return errors;
}
async function visit(page: Page, view: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(`/id/demo/${view}?course=${course}`, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(`/id/demo/${view}`);
  await expect(page.locator("#main-content")).toBeVisible();
}
async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('#main-content [aria-busy="true"]')).toHaveCount(0);
  if (!(await page.getByRole("dialog").count())) await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const path = info.outputPath(`screenshots/${name}.png`);
  await page.screenshot({ path, fullPage: !(await page.getByRole("dialog").count()), animations: "disabled", caret: "initial" });
  await info.attach(name, { path, contentType: "image/png" });
}
async function openSession(page: Page) {
  await page.getByRole("button").filter({ hasText: "Diskusi materi" }).first().click();
  await expect(page.locator("#session-topic")).toBeVisible();
}
test("weekly sessions persist context, pre/post files and links, moves, completion and cancellation", async ({ page }, info) => {
  const errors = guard(page);
  await visit(page, "schedule");
  await openSession(page);
  await capture(page, info, "session-open");
  await page.locator("#session-topic").fill("Diskusi tersimpan");
  await page.locator("#session-note").fill("Catatan sebelum sesi");
  await page.getByRole("button", { name: "Simpan konteks", exact: true }).click();
  const bytes = "demo attachment bytes";
  await page.locator('input[type="file"]').first().setInputFiles({ name: "sebelum.pdf", mimeType: "application/pdf", buffer: Buffer.from(bytes) });
  await expect(page.getByRole("link", { name: /sebelum.pdf/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Tambah link Sebelum sesi sesi", exact: true }).fill("https://example.com/sebelum");
  await page.getByRole("button", { name: "Tambah link", exact: true }).first().click();
  await page.locator('input[type="file"]').nth(1).setInputFiles({ name: "sesudah.pdf", mimeType: "application/pdf", buffer: Buffer.from(bytes) });
  await expect(page.getByRole("link", { name: /sesudah.pdf/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Tambah link Sesudah sesi sesi", exact: true }).fill("https://example.com/sesudah");
  await page.getByRole("button", { name: "Tambah link", exact: true }).nth(1).click();
  await capture(page, info, "session-resources");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button").filter({ hasText: "Diskusi tersimpan" }).first().click();
  await expect(page.locator("#session-note")).toHaveValue("Catatan sebelum sesi");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /sebelum.pdf/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("sebelum.pdf");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(bytes);
  await page.getByRole("button", { name: "Hapus sebelum.pdf", exact: true }).click();
  await expect(page.getByRole("link", { name: /sebelum.pdf/ })).toHaveCount(0);
  await page.locator("#demo-move-start").fill("11:00");
  await page.locator("#demo-move-end").fill("12:30");
  await page.getByRole("button", { name: "Ubah jadwal", exact: true }).click();
  await capture(page, info, "session-moved");
  await page.locator("#session-summary").fill("Pembahasan selesai");
  await page.getByRole("button", { name: "Simpan & selesaikan", exact: true }).click();
  await expect(page.getByText("Selesai", { exact: true }).last()).toBeVisible();
  await capture(page, info, "session-completed");
  await page.getByRole("button", { name: "Tutup", exact: true }).first().click();
  await page.getByRole("button").filter({ hasText: "Latihan dan pembahasan" }).first().click();
  await page.getByRole("button", { name: "Batalkan sesi", exact: true }).click();
  await page.getByText("Dibatalkan", { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText("Dibatalkan", { exact: true })).toBeVisible();
  await capture(page, info, "session-cancelled");
  await page.getByRole("button", { name: "Tutup", exact: true }).first().click();
  for (let index = 0; index < 4; index++) {
    await page.getByRole("button", { name: "Rentang berikutnya", exact: true }).click();
    await expect(page.getByRole("button").filter({ hasText: "Diskusi materi" }).first()).toBeVisible();
  }
  await capture(page, info, "future-week");
  await page.getByRole("button").filter({ hasText: /^\d{2}:\d{2}-/ }).first().click();
  await expect(page.getByRole("dialog").getByText("Pesan sesi tutorial", { exact: true })).toBeVisible();
  await page.locator("#booking-topic").fill("Pemesanan baru");
  await page.getByRole("dialog").getByRole("button").filter({ hasText: "Berpikir Komputasional" }).click();
  await capture(page, info, "booking-open");
  await page.getByRole("button", { name: "Konfirmasi pemesanan", exact: true }).click();
  await expect(page.locator("#session-topic")).toHaveValue("Pemesanan baru");
  await capture(page, info, "booking-saved");
  expect(errors).toEqual([]);
});
test("group validation, editing and browser restart preserve the roster", async ({ page }, info) => {
  const errors = guard(page); await visit(page, "groups");
  await page.locator("#demo-group-name").fill("Kelompok Limit");
  await page.locator("#demo-group-members").fill("Alya\nAlya");
  await page.getByRole("button", { name: "Simpan kelompok", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 sampai 6" })).toBeVisible();
  await capture(page, info, "group-invalid");
  await page.locator("#demo-group-members").fill("Pelajar Demo\nAlya\nBima\nCitra");
  await page.getByRole("button", { name: "Simpan kelompok", exact: true }).click();
  await capture(page, info, "group-saved");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("#demo-group-name")).toHaveValue("Kelompok Limit");
  await expect(page.locator("#demo-group-members")).toHaveValue("Pelajar Demo\nAlya\nBima\nCitra");
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toContain("Kelompok Limit");
  await capture(page, info, "group-reloaded"); expect(errors).toEqual([]);
});
test("quota failure preserves the group draft and never claims saved", async ({ page }, info) => {
  const errors = guard(page); await visit(page, "groups");
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Quota", "QuotaExceededError"); }; });
  await page.locator("#demo-group-name").fill("Draf belum tersimpan");
  await page.getByRole("button", { name: "Simpan kelompok", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Perubahan belum tersimpan" })).toBeVisible();
  await expect(page.getByText("Kelompok tersimpan.", { exact: true })).toHaveCount(0);
  await capture(page, info, "group-storage-error"); expect(errors).toEqual([]);
});
test("flashcard flip, answer and cursor survive reload", async ({ page }, info) => {
  const errors = guard(page); await visit(page, "flashcards");
  await page.getByText("Pertanyaan kartu 1?", { exact: true }).click();
  await expect(page.getByText("Jawaban kartu 1", { exact: true })).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Jawaban kartu 1", { exact: true })).toBeVisible();
  await capture(page, info, "flashcard-flip-reloaded");
  await page.getByRole("button", { name: /^(Paham|Baik|Good)$/i }).click();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Pertanyaan kartu 2?", { exact: true })).toBeVisible();
  await capture(page, info, "flashcard-cursor-reloaded"); expect(errors).toEqual([]);
});
test("completed quiz remains in history and ranking while another draft is edited", async ({ page }, info) => {
  const errors = guard(page); await visit(page, "quiz-start");
  await page.getByRole("button", { name: /^Mulai kuis$/i }).click();
  for (let index = 0; index < 4; index++) {
    await page.getByRole("radio").first().click();
    if (index < 3) await page.getByRole("button", { name: /^Lanjut$/ }).click();
  }
  await page.getByRole("button", { name: /^Kumpulkan kuis$/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ya, kumpulkan", exact: true }).click();
  await expect(page.getByText("Soal yang Anda Kerjakan", { exact: true })).toBeVisible();
  const result = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith("zyx-demo-quiz-result:v2:")));
  expect(result).toBeTruthy();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Soal yang Anda Kerjakan", { exact: true })).toBeVisible();
  await capture(page, info, "quiz-result-reloaded");
  const attempt = crypto.randomUUID();
  await page.goto(`/id/demo/quiz?course=${course}&attempt=${attempt}`, { waitUntil: "networkidle" });
  await page.getByRole("radio").first().click();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("radio").first()).toBeChecked();
  expect(await page.evaluate(key => localStorage.getItem(key), result![0])).toBe(result![1]);
  await capture(page, info, "quiz-draft-reloaded");
  await visit(page, "course-leaderboard");
  await expect(page.getByText("Pelajar Demo", { exact: true }).last()).toBeVisible();
  await capture(page, info, "leaderboard-local-attempt"); expect(errors).toEqual([]);
});
test("failed file storage rolls back metadata and reset clears scoped files", async ({ page }, info) => {
  const errors = guard(page); await visit(page, "schedule"); await openSession(page);
  const file = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("local bytes") });
  await page.locator('input[type="file"]').first().setInputFiles(file("retained.pdf"));
  await expect(page.getByRole("link", { name: /retained.pdf/ })).toBeVisible();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Quota", "QuotaExceededError"); }; });
  await page.locator('input[type="file"]').first().setInputFiles(file("rollback.pdf"));
  await expect(page.getByText("1 berkas belum berhasil ditambahkan. Coba lagi.", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /rollback.pdf/ })).toHaveCount(0);
  const countFiles = () => page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("zyx-public-demo-files", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result; const count = db.transaction("files").objectStore("files").count(); count.onsuccess = () => { resolve(count.result); db.close(); }; };
  }));
  expect(await countFiles()).toBe(1);
  await capture(page, info, "file-quota-rollback");
  await page.reload({ waitUntil: "networkidle" }); await openSession(page);
  await page.evaluate(() => { Object.defineProperty(window, "indexedDB", { get() { throw new DOMException("Unavailable", "SecurityError"); } }); });
  await page.locator('input[type="file"]').first().setInputFiles(file("blocked.pdf"));
  await expect(page.getByText("1 berkas belum berhasil ditambahkan. Coba lagi.", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /blocked.pdf/ })).toHaveCount(0);
  await capture(page, info, "file-storage-unavailable");
  await page.goto(`/id/demo?course=${course}`, { waitUntil: "networkidle" });
  if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
  await page.getByRole("button", { name: /Pelajar Demo/ }).click();
  await page.getByRole("menuitem", { name: "Keluar", exact: true }).click();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  await expect.poll(countFiles).toBe(0);
  await visit(page, "groups");
  await expect(page.locator("#demo-group-name")).toHaveValue("Logika runtut");
  await capture(page, info, "demo-reset"); expect(errors).toEqual([]);
});
test("rescheduling rejects a seeded conflict and releases the original slot", async ({ page }, info) => {
  const errors = guard(page); await visit(page, "schedule"); await openSession(page);
  const original = assertCalendarDate(await page.locator("#demo-move-date").inputValue());
  await page.locator("#demo-move-date").fill(addCalendarDays(original, 7));
  await page.getByRole("button", { name: "Ubah jadwal", exact: true }).click();
  await expect(page.getByText("Waktu tersebut sudah terisi. Pilih jadwal lain.", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  await capture(page, info, "move-conflict");
  await page.locator("#demo-move-date").fill(addCalendarDays(original, 8));
  await page.getByRole("button", { name: "Ubah jadwal", exact: true }).click();
  await expect(page.locator("#session-topic")).toHaveCount(0);
  await page.getByRole("button").filter({ hasText: /^\d{2}:\d{2}-/ }).first().click();
  await page.getByRole("dialog").getByRole("button").filter({ hasText: "Berpikir Komputasional" }).click();
  await page.locator("#booking-topic").fill("Mengisi slot asal");
  await page.getByRole("button", { name: "Konfirmasi pemesanan", exact: true }).click();
  await expect(page.locator("#session-topic")).toHaveValue("Mengisi slot asal");
  await capture(page, info, "original-slot-rebooked");
  await page.getByRole("button", { name: "Tutup", exact: true }).first().click();
  await page.getByRole("button", { name: "Rentang berikutnya", exact: true }).click();
  await page.getByRole("button").filter({ hasText: "Diskusi materi" }).last().click();
  await expect(page.locator("#demo-move-date")).toHaveValue(addCalendarDays(original, 8));
  await capture(page, info, "moved-session-next-week"); expect(errors).toEqual([]);
});
