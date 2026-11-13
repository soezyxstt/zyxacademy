import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { criterionLabels, decideItem, installReviewMock } from "./helpers/solution-review-fixture";

const route = "/visual-fixtures/solution-collection";
test.setTimeout(120_000);

async function capture(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: testInfo.outputPath(`screenshots/${name}.png`), fullPage, animations: "disabled", caret: "initial" });
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll, `${name} overflows horizontally`).toBeLessThanOrEqual(dimensions.width);
}

function trackErrors(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  return failures;
}

async function prepare(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(route);
  await expect(page.locator("[data-fixture-hydrated=true]")).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; } *, *::before, *::after { animation-duration: 0s !important; transition: none !important; caret-color: transparent !important; }" });
}

async function openList(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole("button", { name: "Daftar soal" }).click();
    await expect(page.getByRole("dialog", { name: "Daftar soal" })).toBeVisible();
  }
}

test("reader navigation, reveal, search, sources and fallback states", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await prepare(page, `${route}?keep=yes#reader`);
  await expect(page.locator("[data-solution-item]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Lihat pembahasan" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("heading", { name: "Jawaban", exact: true })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Pilihan jawaban" }).locator("[data-content-kind=formula]")).toHaveCount(0);
  await capture(page, testInfo, "math-closed");
  await page.getByRole("button", { name: "Lihat petunjuk" }).click();
  await expect(page.getByRole("region", { name: "Petunjuk", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Petunjuk", exact: true })).toContainText("Cari rumus yang menghubungkan alas dan tinggi segitiga.");
  await expect(page.getByRole("region", { name: "Petunjuk", exact: true })).not.toContainText("Gunakan alas");
  await expect(page.getByRole("heading", { name: "Jawaban", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-solution-step]")).toHaveCount(0);
  await capture(page, testInfo, "hint-open");
  await page.getByRole("button", { name: "Sembunyikan petunjuk" }).click();
  await page.getByRole("button", { name: "Lihat pembahasan" }).click();
  await expect(page.getByRole("heading", { name: "Langkah perhitungan" })).toBeVisible();
  await expect(page.locator("[data-solution-step]")).toHaveCount(2);
  await expect(page.getByRole("figure", { name: "Segitiga dengan alas dan tinggi" })).toBeVisible();
  await capture(page, testInfo, "math-revealed");
  await page.getByText("Sumber", { exact: true }).click();
  await expect(page.getByText("Tim materi Zyx").first()).toBeVisible();
  await capture(page, testInfo, "sources-open");

  const mobile = testInfo.project.name === "mobile-380";
  await openList(page, mobile);
  if (mobile) await capture(page, testInfo, "mobile-list-open");
  const search = page.getByRole("textbox", { name: "Cari soal" }).filter({ visible: true });
  await search.fill("tidak ditemukan");
  await expect(page.getByText("Tidak ada soal yang cocok.")).toBeVisible();
  await capture(page, testInfo, "search-empty");
  // The first title and prompt do not contain the displayed question number.
  await search.fill("1");
  await expect(page.locator('[data-solution-list] button[data-item-index="0"]').filter({ visible: true })).toBeVisible();
  await search.fill("Python");
  await expect(page.getByRole("button", { name: /Menelusuri perulangan Python/ })).toBeVisible();
  await capture(page, testInfo, "search-result");
  await page.getByRole("button", { name: /Menelusuri perulangan Python/ }).click();
  await expect(page.locator('[data-solution-item="python-loop"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Menelusuri perulangan Python" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Lihat pembahasan" })).toHaveAttribute("aria-expanded", "false");
  expect(new URL(page.url()).searchParams.get("item")).toBe("python-loop");
  expect(new URL(page.url()).searchParams.get("keep")).toBe("yes");
  expect(new URL(page.url()).hash).toBe("#reader");
  await capture(page, testInfo, "python-closed");
  await page.getByRole("button", { name: "Lihat pembahasan" }).click();
  await expect(page.getByRole("heading", { name: "Penelusuran kode" })).toBeVisible();
  await capture(page, testInfo, "python-revealed");
  await page.getByRole("button", { name: "Sebelumnya" }).click();
  await expect(page.locator('[data-solution-item="triangle-area"]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-solution-item="python-loop"]')).toBeVisible();
  await page.goto(`${route}?item=missing`);
  await expect(page.getByText("Soal tidak ditemukan. Menampilkan soal pertama.")).toBeVisible();
  await capture(page, testInfo, "invalid-item");
  await page.goto(`${route}?empty=1`);
  await expect(page.getByText("Belum ada soal dalam kumpulan ini.")).toBeVisible();
  await capture(page, testInfo, "empty-collection");
  expect(failures).toEqual([]);
});

test("conceptual, science and proof explanations, English controls and text zoom", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  for (const [id, expected, screenshot] of [
    ["school-claim", "Alur penjelasan", "conceptual"],
    ["constant-speed", "Langkah perhitungan", "science"],
    ["parity-proof", "Alur penjelasan", "proof"],
  ]) {
    await prepare(page, `${route}?item=${id}`);
    await page.getByRole("button", { name: "Lihat pembahasan" }).click();
    await expect(page.getByRole("heading", { name: expected })).toBeVisible();
    if (id === "constant-speed") {
      const figure = page.getByRole("figure", { name: "Posisi awal dan akhir benda" });
      await expect(figure).toBeVisible();
      const frame = figure.locator("[data-geometry-frame]");
      const bounds = await frame.evaluate((element) => {
        const frameRect = element.getBoundingClientRect();
        return {
          ratio: frameRect.height / frameRect.width,
          labelsWithinFrame: [...element.querySelectorAll("[data-geometry-label]")].every((label) => {
            const rect = label.getBoundingClientRect();
            return rect.left >= frameRect.left - 1 && rect.right <= frameRect.right + 1 && rect.top >= frameRect.top - 1 && rect.bottom <= frameRect.bottom + 1;
          }),
        };
      });
      expect(bounds.ratio).toBeLessThan(0.32);
      expect(bounds.labelsWithinFrame).toBe(true);
    }
    await capture(page, testInfo, screenshot);
  }
  await prepare(page, `${route}?language=en&item=school-claim`);
  await page.getByRole("button", { name: "Show solution" }).focus();
  await expect(page.getByRole("button", { name: "Show solution" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Explanation", exact: true })).toBeVisible();
  await page.getByText("Sources", { exact: true }).click();
  await capture(page, testInfo, "english-keyboard-revealed");
  // Scale each element's computed text size, including pixel-sized tokens, without
  // changing the viewport or layout dimensions. Preserve relative KaTeX sizing.
  const size = async (selector: string) => page.locator(selector).first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const control = page.getByRole("button", { name: "Hide solution" });
  const before = [await size("body"), await size("#claim-prompt p"), await control.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))];
  await page.evaluate(() => {
    const values = [...document.querySelectorAll("body, body *")].filter((element): element is HTMLElement => element instanceof HTMLElement).map((element) => {
      const style = getComputedStyle(element);
      return { element, fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight) };
    });
    for (const { element, fontSize, lineHeight } of values) {
      if (Number.isFinite(fontSize)) element.style.setProperty("font-size", `${fontSize * 2}px`, "important");
      if (Number.isFinite(lineHeight)) element.style.setProperty("line-height", `${lineHeight * 2}px`, "important");
    }
  });
  const after = [await size("body"), await size("#claim-prompt p"), await control.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))];
  for (let i = 0; i < before.length; i++) expect(after[i]).toBeCloseTo(before[i] * 2, 1);
  await expect(control).toBeVisible();
  expect(await control.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await control.focus();
  await expect(control).toBeFocused();
  await capture(page, testInfo, "text-zoom-200");
  expect(failures).toEqual([]);
});

test("long collection has bounded Tab navigation, arrow shortcuts, and a return to the active question", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await prepare(page, `${route}?long=1`);
  const mobile = testInfo.project.name === "mobile-380";
  await openList(page, mobile);
  const list = page.locator("[data-solution-list]").filter({ visible: true });
  if (!mobile) {
    const metrics = await list.evaluate((element) => ({ height: element.clientHeight, scroll: element.scrollHeight, viewport: innerHeight }));
    expect(metrics.scroll).toBeGreaterThan(metrics.height);
    expect(metrics.height).toBeLessThan(metrics.viewport);
  }
  await expect(list.locator("button")).toHaveCount(20);
  await expect(list.locator('button[tabindex="0"]')).toHaveCount(20);
  const search = page.getByRole("textbox", { name: "Cari soal" }).filter({ visible: true });
  await search.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Ke soal aktif" }).filter({ visible: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Halaman soal berikutnya" }).filter({ visible: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(list.locator('button[data-item-index="20"]')).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(list.locator('button[data-item-index="21"]')).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("ArrowUp");
  await expect(list.locator('button[data-item-index="19"]')).toBeFocused();
  await page.keyboard.press("Home");
  await expect(list.locator('button[data-item-index="0"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(list.locator('button[data-item-index="1"]')).toBeFocused();
  await page.keyboard.press("End");
  await expect(list.locator('button[data-item-index="499"]')).toBeFocused();
  await capture(page, testInfo, "long-list", false);
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-solution-item="long-500"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Perulangan 500" })).toBeFocused();
  await capture(page, testInfo, "long-list-selection", false);
  await openList(page, mobile);
  await page.getByRole("textbox", { name: "Cari soal" }).filter({ visible: true }).fill("tidak ditemukan");
  await page.getByRole("button", { name: "Ke soal aktif" }).filter({ visible: true }).click();
  await expect(page.getByRole("textbox", { name: "Cari soal" }).filter({ visible: true })).toHaveValue("");
  await expect(list.locator('button[data-item-index="499"]')).toBeFocused();
  await expect(list.locator('button[data-item-index="499"]')).toHaveAttribute("aria-current", "true");
  await capture(page, testInfo, "long-list-active", false);
  expect(failures).toEqual([]);
});

test("code construction is static and math titles match in the list and heading", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await prepare(page, `${route}?item=shortest-subarray`);
  const mobile = testInfo.project.name === "mobile-380";
  await openList(page, mobile);
  const list = page.locator("[data-solution-list]").filter({ visible: true });
  await page.getByRole("textbox", { name: "Cari soal" }).filter({ visible: true }).fill("Subarray");
  const listMath = list.locator("button .katex annotation");
  const headingMath = page.locator('[data-solution-item="shortest-subarray"] h2 .katex annotation');
  await expect(listMath).toHaveCount(1);
  expect(await listMath.textContent()).toBe(await headingMath.textContent());
  if (mobile) await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Lihat pembahasan" }).click();
  await expect(page.getByRole("heading", { name: "Penyusunan kode" })).toBeVisible();
  await expect(page.locator('[data-solution-step="subarray-trace"] code').filter({ hasText: /^left=1$/ })).toBeVisible();
  const code = page.locator('[data-part-id="subarray-code"]');
  await expect(code.locator("pre code")).toContainText("def shortest_subarray(nums, k)");
  const codeRegion = code.getByRole("region", { name: "Kode, hanya baca" });
  await expect(codeRegion).toHaveAttribute("tabindex", "0");
  await expect(code.getByRole("button", { name: /Jalankan|Run|Submit/ })).toHaveCount(0);
  await expect(page.getByText(/\[0, 0, 5\]/)).toBeVisible();
  await capture(page, testInfo, "code-construction");
  await expect(page.getByText("python", { exact: true })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as any).__copiedSolutionCode = text; } } }));
  await page.getByRole("button", { name: "Salin kode", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kode disalin", exact: true })).toBeVisible();
  await expect(page.locator('[role="status"][aria-live="polite"]')).toHaveText("Kode disalin");
  expect(await page.evaluate(() => (window as any).__copiedSolutionCode)).toContain("def shortest_subarray");
  await capture(page, testInfo, "code-copied");
  await page.getByRole("button", { name: "Kode disalin", exact: true }).click();
  await expect(page.locator('[data-copy-announcement="2"]')).toHaveText("Kode disalin");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Clipboard denied"); } } }));
  await page.getByRole("button", { name: "Kode disalin", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Penyalinan tidak tersedia" })).toBeVisible();
  await capture(page, testInfo, "code-copy-unavailable");
  if (mobile) {
    await expect(code.getByText("Geser kode, atau gunakan panah kiri/kanan.")).toBeVisible();
    await expect(code.getByRole("button", { name: "Geser kode ke kanan" })).toBeEnabled();
    await codeRegion.focus();
    await page.keyboard.press("ArrowRight");
    expect(await codeRegion.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await page.keyboard.press("End");
    await expect(code.getByRole("button", { name: "Geser kode ke kanan" })).toBeDisabled();
    await capture(page, testInfo, "code-scroll-end");
    await page.keyboard.press("Home");
    expect(await codeRegion.evaluate(element => element.scrollLeft)).toBe(0);
    await code.getByRole("button", { name: "Geser kode ke kanan" }).click();
    expect(await codeRegion.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  }
  expect(failures).toEqual([]);
});


test("admin review follows the active item and preserves only unchanged drafts", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await installReviewMock(page);
  await prepare(page, `${route}?mode=review`);
  await expect(page.getByRole("status").filter({ hasText: "0 dari 2 soal selesai direview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setujui bundle" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Langkah perhitungan" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Keputusan review soal" })).toHaveCount(1);
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeEnabled();
  await expect(page.getByRole("region", { name: "Petunjuk yang dilihat siswa" })).toContainText("Cari rumus yang menghubungkan alas dan tinggi segitiga.");
  await expect(page.getByRole("button", { name: "Sembunyikan pembahasan" })).toBeVisible();
  await capture(page, testInfo, "review-incomplete");
  await page.getByLabel(criterionLabels[0], { exact: true }).click();
  await page.getByRole("option", { name: "Disetujui" }).click();
  await page.getByLabel("Catatan", { exact: true }).fill("Draft belum selesai.");
  await prepare(page, `${route}?mode=review`);
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toContainText("Disetujui");
  await expect(page.getByLabel(criterionLabels[1], { exact: true })).toContainText("Pilih keputusan");
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("Draft belum selesai.");
  await expect(page.getByRole("status").filter({ hasText: "0 dari 2 soal selesai direview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setujui bundle" })).toBeDisabled();
  await capture(page, testInfo, "review-partial-recovered");
  await decideItem(page, "Disetujui");
  await page.getByLabel("Catatan", { exact: true }).fill("Periksa satuan luas.");
  await expect(page.getByRole("status").filter({ hasText: "1 dari 2 soal selesai direview" })).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.locator('[data-solution-item="python-loop"]')).toBeVisible();
  await decideItem(page, "Disetujui");
  await page.getByLabel("Catatan", { exact: true }).fill("Catatan Python.");
  await expect(page.getByRole("status").filter({ hasText: "2 dari 2 soal selesai direview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setujui bundle" })).toBeEnabled();
  await capture(page, testInfo, "review-complete");
  await page.evaluate(() => { const state = (window as any).__solutionReviewMock; state.revision = "revision-2"; state.hashes[1] = "hash-python-changed"; });
  await page.getByRole("button", { name: "Ganti revisi" }).click();
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeEnabled();
  await expect(page.getByRole("status").filter({ hasText: "1 dari 2 soal selesai direview" })).toBeVisible();
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Setujui bundle" })).toBeDisabled();
  await page.getByRole("button", { name: "Sebelumnya" }).click();
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("Periksa satuan luas.");
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toContainText("Disetujui");
  await page.getByRole("button", { name: "Berikutnya" }).click();
  await decideItem(page, "Perlu revisi");
  await page.getByLabel("Catatan", { exact: true }).fill("Catatan revisi Python.");
  await expect(page.getByRole("button", { name: "Setujui bundle" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Tolak bundle" })).toBeEnabled();
  await capture(page, testInfo, "review-changes-requested");
  await page.evaluate(() => { (window as any).__solutionReviewMock.failSave = true; });
  await page.getByRole("button", { name: "Tolak bundle" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Review belum tersimpan" })).toContainText("Review belum tersimpan");
  await capture(page, testInfo, "review-save-error");
  await page.evaluate(() => { (window as any).__solutionReviewMock.failSave = false; });
  // Force the refreshed review to recover the submitted decisions from the server.
  await page.evaluate(() => sessionStorage.removeItem("zyx:solution-review:fixture-reviewer:fixture-import"));
  await page.getByRole("button", { name: "Tolak bundle" }).click();
  await expect(page.getByText("Aksi: review")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("zyx:solution-review:fixture-reviewer:fixture-import"))).toBeNull();
  await expect(page.getByText("Keputusan revisi tersimpan. Bundle belum disetujui.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "2 dari 2 soal selesai direview" })).toBeVisible();
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("Catatan revisi Python.");
  await capture(page, testInfo, "review-server-recovered");
  const submitted = await page.evaluate(() => (window as any).__solutionReviewMock.submitted);
  expect(submitted.expectedRevision).toBe("revision-2");
  expect(submitted.decision).toBe("rejected");
  expect(submitted.items.map((item: { itemHash: string }) => item.itemHash)).toEqual(["hash-triangle", "hash-python-changed"]);
  expect(failures).toEqual([]);
});

test("admin persists mixed decisions and blocks publication until local changes are resolved", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await installReviewMock(page);
  await prepare(page, `${route}?mode=review`);
  await expect(page.getByRole("button", { name: "Ke soal belum selesai" })).toBeEnabled();
  await page.getByRole("button", { name: "Ke soal belum selesai" }).click();
  await expect(page.locator('[data-solution-item="python-loop"]')).toBeVisible();
  await decideItem(page, "Disetujui");
  const mobile = testInfo.project.name === "mobile-380";
  await openList(page, mobile);
  await expect(page.getByRole("img", { name: "Review selesai", exact: true })).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Review belum selesai", exact: true })).toHaveCount(1);
  await capture(page, testInfo, "review-completion-list");
  if (mobile) await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Ke soal belum selesai" }).click();
  await expect(page.locator('[data-solution-item="triangle-area"]')).toBeVisible();
  await decideItem(page, "Disetujui");
  await page.getByLabel(criterionLabels[1], { exact: true }).click();
  await page.getByRole("option", { name: "Perlu revisi" }).click();
  await page.evaluate(() => sessionStorage.clear());
  await page.getByRole("button", { name: "Tolak bundle" }).click();
  await expect(page.getByText("Keputusan revisi tersimpan. Bundle belum disetujui.", { exact: false })).toBeVisible();
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toContainText("Disetujui");
  await expect(page.getByLabel(criterionLabels[1], { exact: true })).toContainText("Perlu revisi");
  await capture(page, testInfo, "mixed-decisions-restored");
  await page.getByLabel(criterionLabels[1], { exact: true }).click();
  await page.getByRole("option", { name: "Disetujui" }).click();
  await page.getByRole("button", { name: "Setujui bundle" }).click();
  await page.getByRole("button", { name: "Siap publikasi" }).click();
  await expect(page.getByRole("button", { name: "Publikasikan" })).toBeEnabled();
  await page.getByLabel(criterionLabels[0], { exact: true }).click();
  await page.getByRole("option", { name: "Perlu revisi" }).click();
  await expect(page.getByRole("button", { name: "Publikasikan" })).toBeDisabled();
  await expect(page.getByText("Ada perubahan review yang belum disimpan.", { exact: false })).toBeVisible();
  await capture(page, testInfo, "unsaved-publication-blocked");
  await page.getByRole("button", { name: "Pulihkan review tersimpan" }).click();
  await expect(page.getByRole("dialog", { name: "Pulihkan review tersimpan" })).toBeVisible();
  await capture(page, testInfo, "restore-review-confirm");
  await page.getByRole("dialog").getByRole("button", { name: "Pulihkan", exact: true }).click();
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toContainText("Disetujui");
  await expect(page.getByRole("button", { name: "Publikasikan" })).toBeEnabled();
  await capture(page, testInfo, "saved-approval-restored");
  expect(failures).toEqual([]);
});

test("admin context error, publish, withdraw and discard", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await installReviewMock(page, true);
  await prepare(page, `${route}?mode=review`);
  await expect(page.getByRole("alert").filter({ hasText: "Review belum dapat dimuat" })).toContainText("Review belum dapat dimuat");
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeDisabled();
  await capture(page, testInfo, "review-context-error");
  await page.evaluate(() => { (window as any).__solutionReviewMock.failLoad = false; });
  await page.getByRole("button", { name: "Muat ulang revisi" }).click();
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Publikasikan" })).toBeDisabled();
  await page.getByRole("button", { name: "Siap publikasi" }).click();
  await expect(page.getByRole("button", { name: "Publikasikan" })).toBeDisabled();
  await decideItem(page, "Disetujui");
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await decideItem(page, "Disetujui");
  await page.getByRole("button", { name: "Setujui bundle" }).click();
  await expect(page.getByRole("button", { name: "Publikasikan" })).toBeEnabled();
  await capture(page, testInfo, "review-publish-ready");
  await page.getByRole("button", { name: "Referensi berubah" }).click();
  await expect(page.getByRole("button", { name: "Publikasikan" })).toBeDisabled();
  await expect(page.getByRole("status", { name: "Kesiapan publikasi" })).toContainText("Mata kuliah, bab, atau referensi berubah");
  await expect(page.getByRole("button", { name: "Muat ulang status" })).toBeEnabled();
  await capture(page, testInfo, "review-dependency-blocked");
  await page.getByRole("button", { name: "Muat ulang status" }).click();
  await expect(page.getByRole("status", { name: "Kesiapan publikasi" })).toContainText("Perbarui konteks sumber dan Idea");
  await page.getByRole("button", { name: "Siap publikasi" }).click();
  await expect(page.getByRole("button", { name: "Publikasikan" })).toBeEnabled();
  await page.getByRole("button", { name: "Publikasikan" }).click();
  await expect(page.getByText("Sudah dipublikasikan")).toBeVisible();
  await capture(page, testInfo, "review-published");
  await page.getByRole("button", { name: "Tarik publikasi" }).click();
  await expect(page.getByRole("dialog", { name: "Tarik publikasi" })).toBeVisible();
  await capture(page, testInfo, "review-withdraw-confirm");
  await page.getByRole("dialog").getByRole("button", { name: "Tarik publikasi" }).click();
  await expect(page.getByText("Aksi: withdraw")).toBeVisible();
  await page.getByRole("button", { name: "Hapus draft" }).click();
  await expect(page.getByRole("dialog", { name: "Hapus draft" })).toBeVisible();
  await capture(page, testInfo, "review-discard-confirm");
  await page.getByRole("dialog").getByRole("button", { name: "Hapus draft" }).click();
  await expect(page.getByText("Aksi: discard")).toBeVisible();
  expect(failures).toEqual([]);
});

test("catalogue grid and list navigate to the collection; hierarchy labels translate", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  for (const view of ["grid", "list"]) {
    await prepare(page, `${route}?mode=catalogue`);
    if (view === "list") await page.getByRole("button", { name: "Tampilan daftar" }).click();
    const link = page.getByRole("link", { name: /Pembahasan soal pilihan/ });
    await expect(link).toHaveAttribute("href", `${route}?from=catalogue`);
    await capture(page, testInfo, `catalogue-${view}`);
    await link.click();
    await expect(page.locator('[data-solution-item="triangle-area"]')).toBeVisible();
    expect(new URL(page.url()).searchParams.get("from")).toBe("catalogue");
  }
  for (const [query, label] of [["", "Kumpulan pembahasan"], ["&language=en", "Solution collection"]]) {
    await prepare(page, `${route}?mode=hierarchy${query}`);
    const chapter = page.getByRole("button", { name: /Penalaran dasar/ });
    if (await chapter.getAttribute("aria-expanded") !== "true") await chapter.click();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await capture(page, testInfo, query ? "hierarchy-english" : "hierarchy-indonesian");
  }
  expect(failures).toEqual([]);
});


test("a collection without authored hints never reveals its full strategy as a hint", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await prepare(page, `${route}?hint=none`);
  await expect(page.getByRole("button", { name: "Lihat petunjuk" })).toHaveCount(0);
  await expect(page.getByText("Gunakan alas dan tinggi yang saling tegak lurus.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Jawaban", exact: true })).toHaveCount(0);
  await capture(page, testInfo, "hint-absent");
  await page.getByRole("button", { name: "Lihat pembahasan" }).click();
  await expect(page.getByText("Gunakan alas dan tinggi yang saling tegak lurus.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jawaban", exact: true })).toBeVisible();
  expect(failures).toEqual([]);
});


test("Markdown code in prompts and worked steps has shared keyboard scroll controls", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await prepare(page, `${route}?markdown=1&item=python-loop`);
  await expect(page.getByText("Teks biasa", { exact: true })).toBeVisible();
  const code = page.getByRole("region", { name: "Kode, hanya baca" });
  await expect(code).toHaveCount(1);
  await expect(code.first()).toHaveAttribute("tabindex", "0");
  if (testInfo.project.name === "mobile-380") {
    await expect(page.getByText("Geser kode, atau gunakan panah kiri/kanan.", { exact: true })).toBeVisible();
    await code.first().focus();
    await page.keyboard.press("End");
    expect(await code.first().evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await page.keyboard.press("Home");
  }
  await capture(page, testInfo, "markdown-prompt-code");
  await page.getByRole("button", { name: "Lihat pembahasan" }).click();
  await expect(code).toHaveCount(2);
  await expect(code.nth(1)).toHaveAttribute("tabindex", "0");
  await code.nth(1).focus();
  if (testInfo.project.name === "mobile-380") {
    await page.keyboard.press("ArrowRight");
    expect(await code.nth(1).evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  }
  await capture(page, testInfo, "markdown-step-code");
  await page.goto(`${route}?markdown=1&item=python-loop&language=en`);
  await expect(page.getByText("Plain text", { exact: true })).toBeVisible();
  await capture(page, testInfo, "markdown-plain-english");
  expect(failures).toEqual([]);
});

test("review draft conflicts preserve newer server decisions and offer explicit recovery", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await installReviewMock(page);
  await prepare(page, `${route}?mode=review`);
  await page.getByLabel(criterionLabels[0], { exact: true }).click();
  await page.getByRole("option", { name: "Disetujui" }).click();
  await page.getByLabel("Catatan", { exact: true }).fill("Draft lokal lama.");
  await page.evaluate(() => {
    const state = (window as any).__solutionReviewMock;
    state.saved = { decision: "rejected", items: ["triangle-area", "python-loop"].map((itemId, index) => ({ itemId, itemHash: state.hashes[index], correctness: "changes_requested", reasoning: "changes_requested", problemProvenance: "approved", solutionProvenance: "approved", release: "approved", notes: "Keputusan server lebih baru." })) };
  });
  await page.getByRole("button", { name: "Muat ulang status" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Review di server berubah" })).toBeVisible();
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toContainText("Perlu revisi");
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publikasikan" })).toBeDisabled();
  await capture(page, testInfo, "review-draft-conflict");
  await page.getByRole("button", { name: "Pulihkan draft lokal", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Pulihkan draft lokal" })).toContainText("Review server tidak berubah");
  await capture(page, testInfo, "review-conflict-confirm");
  await page.getByRole("dialog").getByRole("button", { name: "Pulihkan draft lokal" }).click();
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toContainText("Disetujui");
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("Draft lokal lama.");
  expect(await page.evaluate(() => (window as any).__solutionReviewMock.saved.items[0].correctness)).toBe("changes_requested");
  await capture(page, testInfo, "review-local-recovered");
  await page.evaluate(() => { (window as any).__solutionReviewMock.saved.items[0].notes = "Perubahan server berikutnya."; });
  await page.getByRole("button", { name: "Muat ulang status" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Review di server berubah" })).toBeVisible();
  await page.getByRole("button", { name: "Gunakan review server" }).click();
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("Perubahan server berikutnya.");
  expect(await page.evaluate(() => sessionStorage.getItem("zyx:solution-review:fixture-reviewer:fixture-import"))).toBeNull();
  await capture(page, testInfo, "review-server-selected");
  expect(failures).toEqual([]);
});

test("English review translates criteria, recovery, publication and confirmation controls", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await installReviewMock(page);
  await prepare(page, `${route}?mode=review&language=en`);
  await expect(page.getByRole("heading", { name: "Review each question" })).toBeVisible();
  await expect(page.getByLabel("Question and answer correctness", { exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Hint shown to students" })).toContainText("Cari rumus yang menghubungkan alas dan tinggi segitiga.");
  await page.getByLabel("Reasoning and verification", { exact: true }).click();
  await page.getByRole("option", { name: "Needs changes" }).click();
  await capture(page, testInfo, "review-english");
  await page.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Discard draft" })).toContainText("This bundle draft will be deleted.");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Cancel" })).toBeVisible();
  await capture(page, testInfo, "review-english-confirm");
  expect(failures).toEqual([]);
});

test("saving an already-open stale review detects another tab before overwriting", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await installReviewMock(page);
  await prepare(page, `${route}?mode=review`);
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeEnabled();
  await decideItem(page, "Disetujui");
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await decideItem(page, "Disetujui");
  await page.getByLabel("Catatan", { exact: true }).fill("Draft dari tab pertama.");
  await page.evaluate(() => {
    const state = (window as any).__solutionReviewMock;
    state.saved = { decision: "rejected", items: ["triangle-area", "python-loop"].map((itemId, index) => ({ itemId, itemHash: state.hashes[index], correctness: "changes_requested", reasoning: "changes_requested", problemProvenance: "approved", solutionProvenance: "approved", release: "approved", notes: "Keputusan tab kedua." })) };
  });
  await page.getByRole("button", { name: "Setujui bundle", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Review di server berubah" })).toBeVisible();
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("Keputusan tab kedua.");
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__solutionReviewMock.saved.decision)).toBe("rejected");
  await capture(page, testInfo, "review-open-tab-conflict");
  await page.getByRole("button", { name: "Gunakan review server", exact: true }).click();
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeEnabled();
  expect(failures).toEqual([]);
});

test("conflicting in-memory decisions survive when tab storage is unavailable", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await installReviewMock(page);
  await prepare(page, `${route}?mode=review`);
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toBeEnabled();
  await page.evaluate(() => Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("Unavailable", "SecurityError"); } }));
  await decideItem(page, "Disetujui");
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await decideItem(page, "Disetujui");
  await page.getByLabel("Catatan", { exact: true }).fill("Draft tetap ada di memori.");
  await page.evaluate(() => {
    const state = (window as any).__solutionReviewMock;
    state.saved = { decision: "rejected", items: ["triangle-area", "python-loop"].map((itemId, index) => ({ itemId, itemHash: state.hashes[index], correctness: "changes_requested", reasoning: "changes_requested", problemProvenance: "approved", solutionProvenance: "approved", release: "approved", notes: "Keputusan server terbaru." })) };
  });
  await page.getByRole("button", { name: "Setujui bundle", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Review di server berubah" })).toBeVisible();
  await page.getByRole("button", { name: "Pulihkan draft lokal", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Pulihkan draft lokal", exact: true }).click();
  await expect(page.getByLabel("Catatan", { exact: true })).toHaveValue("Draft tetap ada di memori.");
  await expect(page.getByLabel(criterionLabels[0], { exact: true })).toContainText("Disetujui");
  expect(await page.evaluate(() => (window as any).__solutionReviewMock.saved.decision)).toBe("rejected");
  await capture(page, testInfo, "review-storage-unavailable-recovered");
  expect(failures).toEqual([]);
});

test("English formula regions and misconception corrections are clearly labelled", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  await prepare(page, `${route}?item=parity-proof&language=en`);
  await page.getByRole("button", { name: "Show solution", exact: true }).click();
  await expect(page.getByRole("region", { name: "Main formula", exact: true }).first()).toBeVisible();
  await expect(page.locator('[aria-label="Rumus utama"], [aria-label="Rumus matematika"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Misconception", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Correction", exact: true })).toBeVisible();
  await capture(page, testInfo, "english-math-and-correction");
  expect(failures).toEqual([]);
});

test("the question list follows next and history across a page boundary", async ({ page }, testInfo) => {
  const failures = trackErrors(page);
  const mobile = testInfo.project.name === "mobile-380";
  await prepare(page, `${route}?long=1&item=long-20`);
  await expect(page.locator('[data-solution-item="long-20"]')).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya", exact: true }).filter({ visible: true }).last().click();
  await expect(page.locator('[data-solution-item="long-21"]')).toBeVisible();
  await openList(page, mobile);
  const list = page.locator("[data-solution-list]").filter({ visible: true });
  await expect(list.locator('button[data-item-index="20"]')).toHaveAttribute("aria-current", "true");
  await expect(list.locator('button[data-item-index="20"]')).toBeInViewport();
  await capture(page, testInfo, "long-list-next-follows-active", false);
  if (mobile) await page.keyboard.press("Escape");
  await page.goBack();
  await expect(page.locator('[data-solution-item="long-20"]')).toBeVisible();
  await openList(page, mobile);
  await expect(list.locator('button[data-item-index="19"]')).toHaveAttribute("aria-current", "true");
  await expect(list.locator('button[data-item-index="19"]')).toBeInViewport();
  await capture(page, testInfo, "long-list-history-follows-active", false);
  expect(failures).toEqual([]);
});

test("moving to the next question clears a filter that hides the new active item", async ({ page }, info) => {
  const failures = trackErrors(page), mobile = info.project.name === "mobile-380";
  await prepare(page, route);
  await openList(page, mobile);
  await page.getByRole("textbox", { name: "Cari soal" }).filter({ visible: true }).fill("Luas segitiga");
  await expect(page.locator("[data-solution-list]").filter({ visible: true }).locator("button")).toHaveCount(1);
  if (mobile) await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Berikutnya", exact: true }).filter({ visible: true }).last().click();
  await openList(page, mobile);
  await expect(page.getByRole("textbox", { name: "Cari soal" }).filter({ visible: true })).toHaveValue("");
  await expect(page.locator("[data-solution-list]").filter({ visible: true }).locator('button[aria-current="true"]')).toContainText("Python");
  await capture(page, info, "list-filter-cleared-for-active-item", false);
  expect(failures).toEqual([]);
});
