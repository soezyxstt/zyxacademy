import { test, expect, type Page, type TestInfo } from "@playwright/test";

const sampleForm = {
  id: "form-revamp-1",
  slug: "pendaftaran-tutorial-tpb",
  title: "Pendaftaran Tutorial TPB 2026",
  description: "Pilih jadwal sesi tutorial dan lengkapi data diri sebelum Jumat pukul 23.59 WIB.",
  category: "registration",
  totalResponses: 42,
  createdAt: "2026-10-25T00:00:00Z",
  settings: {
    displayMode: "section",
    collectEmail: "input",
    acceptingResponses: true,
    sendResponseCopy: "off",
    allowResponseEditing: false,
    limitToOneResponse: false,
    maxFileSizeLimit: "1GB",
    customSuccessMessage: "Jawaban Anda telah berhasil disimpan.",
  },
  questions: [
    { type: "TEXT", title: "Nama lengkap", required: true },
    {
      type: "RADIO",
      title: "Pilihan jadwal tutorial",
      options: ["Sabtu pagi (08.00 - 10.00)", "Minggu sore (15.00 - 17.00)"],
      required: true,
      otherOption: { enabled: true, label: "Lainnya" },
    },
    { type: "SECTION", title: "Berkas dan catatan", description: "Unggah berkas pendukung jika diperlukan." },
    { type: "FILE_UPLOAD", title: "Kartu rencana studi (KRS)", maxFileSizeMb: 5, required: false },
    { type: "PARAGRAPH", title: "Topik yang ingin dibahas", required: false },
  ],
};

const secondForm = {
  ...sampleForm,
  id: "form-revamp-2",
  slug: "evaluasi-dosen-kalkulus",
  title: "Evaluasi Sesi Kalkulus IIA",
  category: "feedback",
  totalResponses: 18,
};

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    nodes: [...document.querySelectorAll("body *")]
      .filter(
        (el) =>
          el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 &&
          getComputedStyle(el).position !== "fixed"
      )
      .slice(0, 10)
      .map((el) => `${el.tagName}.${el.className}`),
  }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await page.emulateMedia({ reducedMotion: "reduce" });

  await page.route("**/api/admin/custom-forms", (route) =>
    route.fulfill({ json: { success: true, forms: [sampleForm, secondForm] } })
  );
  await page.route(`**/api/admin/custom-forms/${sampleForm.id}`, (route) =>
    route.fulfill({ json: { success: true, form: sampleForm } })
  );
  await page.route("**/api/admin/form-presets**", (route) =>
    route.fulfill({ json: { success: true, presets: [] } })
  );
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

async function selectTab(page: Page, name: string) {
  const direct = page.getByRole("tab", { name, exact: true });
  if (await direct.isVisible().catch(() => false)) {
    await direct.click();
    return;
  }
  await page.getByRole("button", { name: /Lebih|More/i }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

test("form studio google-forms layout: builder active/inactive cards, settings, preview, and published list", async ({ page }, info) => {
  await page.goto(`/visual-fixtures/admin-loading-flows?state=forms&edit=${sampleForm.id}`);

  // 1. Builder loaded with first question active and rest as clean preview cards
  await expect(page.getByRole("textbox", { name: "Judul formulir" })).toHaveValue(sampleForm.title);
  await capture(page, info, "01-builder-active-first");

  // 2. Click second question (RADIO) to switch active focus card
  await page.locator('[data-qidx="1"]').click();
  await expect(page.locator('[data-qidx="1"]').getByRole("button", { name: /Tambah Opsi/i })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, info, "02-builder-active-radio");

  // 3. Settings tab (centered clean Google Forms card)
  await selectTab(page, "Pengaturan");
  await expect(page.getByRole("combobox", { name: "Tampilan formulir" })).toBeVisible();
  await capture(page, info, "03-settings");

  // 4. Preview tab (no simulation/filler copy)
  await selectTab(page, "Pratinjau");
  await expect(page.getByRole("heading", { name: "Nama lengkap" })).toBeVisible();
  await expect(page.getByText(/Simulasi interaktif/i)).toHaveCount(0);
  await capture(page, info, "04-preview");

  // 5. Published forms tab
  await selectTab(page, "Daftar Terbit");
  await expect(page.getByText(sampleForm.title)).toBeVisible();
  await expect(page.getByText(secondForm.title)).toBeVisible();
  await capture(page, info, "05-published-list");
});
