import { test, expect, type Page, type TestInfo } from "@playwright/test";

const fixture = (displayMode = "section") => ({
  id: "visual-form", slug: "visual-form", title: "Pendaftaran tutorial", category: "registration",
  description: "Pilih jadwal dan unggah berkas pendukung.", totalResponses: 2, createdAt: "2026-10-25T00:00:00Z",
  settings: { displayMode, collectEmail: "input", acceptingResponses: true },
  questions: [
    { type: "TEXT", title: "Nama lengkap", required: true },
    { type: "RADIO", title: "Jadwal", options: ["Sabtu pagi", "Minggu sore"], required: true, otherOption: { enabled: true, label: "Lainnya" } },
    { type: "SECTION", title: "Berkas dan catatan", description: "Unggah berkas pendukung jika ada." },
    { type: "FILE_UPLOAD", title: "Berkas pendukung", maxFileSizeMb: 5 },
    { type: "PARAGRAPH", title: "Catatan", required: true },
  ],
});

async function mockForm(page: Page, displayMode = "section") {
  const form = fixture(displayMode);
  let submissions = 0;
  let lastBody: any;
  await page.route("**/api/forms/qa", async (route) => {
    if (route.request().method() === "POST") {
      submissions++;
      lastBody = route.request().postDataJSON();
      await route.fulfill({ json: { success: true, message: "Tanggapan tersimpan." } });
    } else await route.fulfill({ json: { form } });
  });
  return { get submissions() { return submissions; }, get body() { return lastBody; } };
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => { await document.fonts.ready; });
  const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
    nodes: [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && getComputedStyle(el).position !== "fixed").slice(0, 10).map((el) => `${el.tagName}.${el.className}`),
  }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: name !== "admin-mode-menu", animations: "disabled" });
}

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

test("flowing sections validate, preserve answers and confirm before submit", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => { if (e.type() === "error") errors.push(e.text()); });
  const state = await mockForm(page);
  await page.goto("/forms/qa");
  await expect(page.getByRole("heading", { name: "Nama lengkap" })).toBeVisible();
  await capture(page, info, "flow-first-section");
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await expect(page.getByText("Alamat email wajib diisi dengan format yang benar.", { exact: true })).toBeVisible();
  await capture(page, info, "flow-validation");
  await page.getByRole("textbox", { name: "Alamat email", exact: true }).fill("student@example.test");
  await page.getByRole("textbox", { name: "Nama lengkap", exact: true }).fill("Mahasiswa uji");
  await page.getByRole("button", { name: /Sabtu pagi/ }).click();
  await expect(page.getByRole("heading", { name: "Nama lengkap" })).toBeVisible();
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Berkas dan catatan" })).toBeVisible();
  await expect(page.getByText("Maksimal 5 MB per berkas")).toBeVisible();
  await capture(page, info, "flow-second-section");
  await page.getByRole("textbox", { name: "Catatan", exact: true }).fill("Bahas latihan soal.");
  await page.getByRole("button", { name: "Kembali", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nama lengkap", exact: true })).toHaveValue("Mahasiswa uji");
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Catatan", exact: true })).toHaveValue("Bahas latihan soal.");
  await page.getByRole("button", { name: "Kirim tanggapan", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(state.submissions).toBe(0);
  await expect(page.getByText("Tinjau Jawaban Anda")).toHaveCount(0);
  await capture(page, info, "confirm");
  await page.getByRole("button", { name: "Kembali mengisi" }).click();
  await expect(page.getByRole("textbox", { name: "Catatan", exact: true })).toHaveValue("Bahas latihan soal.");
  await page.getByRole("button", { name: "Kirim tanggapan", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Kirim tanggapan" }).click();
  await expect(page.getByText("Tanggapan tersimpan.")).toBeVisible();
  expect(state.submissions).toBe(1);
  expect(state.body.answers).toEqual({ "0": "Mahasiswa uji", "1": "Sabtu pagi", "4": "Bahas latihan soal." });
  await capture(page, info, "success");
  expect(errors).toEqual([]);
});

test("one-question mode has no summary and keyboard cannot bypass confirmation", async ({ page }, info) => {
  const state = await mockForm(page, "question");
  await page.goto("/forms/qa");
  await capture(page, info, "question-cover");
  await page.getByRole("button", { name: "Mulai Isi Formulir" }).click();
  await page.getByRole("textbox", { name: "Alamat email", exact: true }).fill("student@example.test");
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("textbox", { name: "Nama lengkap", exact: true }).fill("Mahasiswa uji");
  await capture(page, info, "question-input");
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("button", { name: /Minggu sore/ }).click();
  await expect(page.getByRole("heading", { name: "Berkas dan catatan" })).toBeVisible();
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await expect(page.getByText("Maksimal 5 MB per berkas")).toBeVisible();
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("textbox", { name: "Catatan", exact: true }).fill("Latihan");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, info, "question-confirm");
  await page.keyboard.press("Control+Enter");
  expect(state.submissions).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Catatan", exact: true })).toHaveValue("Latihan");
});

test("uploads reject oversize files and block submission until upload finishes", async ({ page }, info) => {
  const state = await mockForm(page);
  let uploads = 0;
  let finishUpload: (() => void) | undefined;
  await page.route("**/api/forms/upload", async (route) => {
    uploads++;
    await new Promise<void>((resolve) => { finishUpload = resolve; });
    await route.fulfill({ json: { success: true, url: "/api/storage/fixture.pdf" } });
  });
  await page.goto("/forms/qa");
  await page.getByRole("textbox", { name: "Alamat email", exact: true }).fill("student@example.test");
  await page.getByRole("textbox", { name: "Nama lengkap", exact: true }).fill("Mahasiswa");
  await page.getByRole("button", { name: /Sabtu pagi/ }).click();
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("textbox", { name: "Catatan", exact: true }).fill("Catatan");
  const file = page.locator('input[type="file"]');
  await file.setInputFiles({ name: "large.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.getByText("Maksimal 5 MB per berkas.", { exact: true })).toBeVisible();
  expect(uploads).toBe(0);
  await file.setInputFiles({ name: "small.pdf", mimeType: "application/pdf", buffer: Buffer.from("fixture") });
  await expect.poll(() => uploads).toBe(1);
  await expect(page.getByRole("button", { name: "Kirim tanggapan" })).toBeDisabled();
  await page.keyboard.press("Control+Enter");
  expect(state.submissions).toBe(0);
  await capture(page, info, "upload-pending");
  finishUpload?.();
  await expect(page.getByText("Berkas Berhasil Terunggah", { exact: true })).toBeVisible();
  await capture(page, info, "upload-done");
});

test("admin editor persists publication mode and previews both layouts", async ({ page }, info) => {
  const form = fixture();
  let saved: any;
  await page.route("**/api/admin/custom-forms", (route) => route.fulfill({ json: { success: true, forms: [form] } }));
  await page.route(`**/api/admin/custom-forms/${form.id}`, async (route) => {
    if (route.request().method() === "PATCH" || route.request().method() === "PUT") {
      saved = route.request().postDataJSON();
      await route.fulfill({ json: { success: true, form: { ...form, ...saved } } });
    } else await route.fulfill({ json: { success: true, form } });
  });
  await page.route("**/api/admin/form-presets**", (route) => route.fulfill({ json: { success: true, presets: [] } }));
  await page.goto(`/admin/forms?edit=${form.id}`);
  await expect(page.getByRole("textbox", { name: "Judul formulir" })).toHaveValue(form.title);
  await capture(page, info, "admin-builder");
  await page.getByRole("tab", { name: "Pengaturan" }).click();
  await capture(page, info, "admin-settings");
  await page.getByRole("combobox", { name: "Tampilan formulir" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await capture(page, info, "admin-mode-menu");
  await page.getByRole("option", { name: "Satu pertanyaan per halaman", exact: true }).click();
  await page.getByRole("button", { name: "Simpan Perubahan", exact: true }).first().click();
  await expect.poll(() => saved?.settings?.displayMode).toBe("question");
  await page.getByRole("tab", { name: "Pengaturan" }).click();
  await page.getByRole("combobox", { name: "Tampilan formulir" }).click();
  await page.getByRole("option", { name: "Mengalir, satu bagian per halaman" }).click();
  await page.getByRole("tab", { name: "Pratinjau", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nama lengkap" })).toBeVisible();
  await capture(page, info, "admin-flow-preview");
});

test("failed submissions keep answers and retry sends only once while pending", async ({ page }, info) => {
  const form = fixture("section");
  form.settings.collectEmail = "none";
  form.questions = [{ type: "TEXT", title: "Nama lengkap", required: true }];
  let submissions = 0;
  let finish: (() => void) | undefined;
  await page.route("**/api/forms/qa", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ json: { form } });
      return;
    }
    submissions++;
    if (submissions === 1) {
      await route.fulfill({ json: { success: false, error: "Gagal mengirim. Coba lagi." } });
    } else {
      await new Promise<void>((resolve) => { finish = resolve; });
      await route.fulfill({ json: { success: true, message: "Tanggapan tersimpan." } });
    }
  });
  await page.goto("/forms/qa");
  await page.getByRole("textbox", { name: "Nama lengkap", exact: true }).fill("Mahasiswa");
  await page.getByRole("button", { name: "Kirim tanggapan", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Kirim tanggapan" }).click();
  await expect(page.getByRole("alert")).toHaveText("Gagal mengirim. Coba lagi.");
  await capture(page, info, "submit-error");
  await page.getByRole("dialog").getByRole("button", { name: "Kembali mengisi" }).click();
  await expect(page.getByRole("textbox", { name: "Nama lengkap", exact: true })).toHaveValue("Mahasiswa");
  await page.keyboard.press("Control+Enter");
  await page.getByRole("dialog").getByRole("button", { name: "Kirim tanggapan" }).click();
  await expect.poll(() => submissions).toBe(2);
  await expect(page.getByRole("dialog").getByRole("button", { name: "Mengirim..." })).toBeDisabled();
  await page.keyboard.press("Control+Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(submissions).toBe(2);
  await capture(page, info, "submit-pending");
  finish?.();
  await expect(page.getByText("Tanggapan tersimpan.")).toBeVisible();
});
