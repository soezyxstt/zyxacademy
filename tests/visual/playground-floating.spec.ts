import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mockTerminal, mockZyraDrawer } from "./terminal-fixture";

test.setTimeout(90_000);

async function openZyra(page: Page) {
  await mockTerminal(page);
  const history = await mockZyraDrawer(page);
  await page.goto("/visual-fixtures/coding?terminal=1");
  await expect(page.getByRole("button", { name: "Masalah yang ingin diselesaikan" })).toHaveCount(0);
  await page.getByRole("button", { name: "Buka Zyra" }).click();
  const drawer = page.getByRole("complementary", { name: "Asisten belajar Zyra" });
  await expect(drawer.getByText("Kalikan panjang dengan lebar.")).toBeVisible();
  return { drawer, history, composer: drawer.getByRole("textbox", { name: "Tanyakan materi atau rumus..." }) };
}

function failures(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  return errors;
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`screenshots/${name}.png`), animations: "disabled" });
}
function reply(text: string) {
  return `data: ${JSON.stringify({ type: "text-delta", textDelta: text })}\n\ndata: ${JSON.stringify({ type: "data-history", saved: true })}\n\ndata: [DONE]\n\n`;
}

test("one compact composer routes final Python to the editor and keeps Tutor snippets in chat", async ({ page }, info) => {
  const errors = failures(page);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/zyra/chat", async route => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) await waiting;
    await route.fulfill({ contentType: "text/event-stream", body: reply(requests.length === 1 ? "Luas dihitung dari panjang dan lebar.\n```python\nprint(24)\n```" : "Gunakan perkalian, misalnya `6 * 4`.\n```python\n6 * 4\n```") });
  });
  const { drawer, composer, history } = await openZyra(page);
  await expect(drawer.getByRole("tab", { name: "Python", exact: true })).toHaveAttribute("aria-selected", "true");
  expect((await drawer.locator("footer").boundingBox())!.height).toBeLessThan(130);
  await capture(page, info, "compact-idle");
  let uploads = 0;
  await page.route("**/api/zyra/attachments", route => { uploads++; return route.fulfill({ json: { id: "image-id", sessionId: "zyra-session", width: 1, height: 1 } }); });
  await composer.evaluate(element => {
    const data = new DataTransfer();
    data.items.add(new File([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="), c => c.charCodeAt(0))], "soal.png", { type: "image/png", lastModified: 5 }));
    for (let i = 0; i < 2; i++) element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => uploads).toBe(1);
  // Image-only messages must count even while the history summary is stale.
  await expect(composer.locator(".cm-placeholder")).toBeVisible();
  await drawer.getByRole("button", { name: "Buat kode", exact: true }).click();
  await expect(drawer.getByRole("tab", { name: "Tutor", exact: true })).toBeDisabled();
  await expect(drawer.getByRole("button", { name: "Input matematika" })).toBeDisabled();
  await capture(page, info, "python-sending");
  release();
  await expect(drawer.getByText("Kode diterapkan ke editor.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Kode Python" })).toContainText("print(24)");
  await expect(drawer.locator("pre")).toHaveCount(0);
  expect(requests[0].codingContext).toMatchObject({ kind: "playground", intent: "generate" });
  await capture(page, info, "python-complete");
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  await composer.fill("Mengapa memakai perkalian?");
  await composer.press("Enter");
  await expect(drawer.getByText("6 * 4", { exact: true }).first()).toBeVisible();
  await expect(drawer.locator("pre")).toHaveCount(1);
  expect(requests[1].codingContext).toMatchObject({ intent: "hint" });
  await expect(page.getByRole("textbox", { name: "Kode Python" })).toContainText("print(24)");
  await capture(page, info, "tutor-complete");
  await drawer.getByRole("button", { name: "Menu topik dan mode Zyra" }).click();
  await expect(drawer.getByText(/6 pesan/)).toBeVisible();
  await expect(drawer.getByText(/^0 pesan/)).toHaveCount(0);
  await capture(page, info, "history-count");
  expect(history.saveCalls).toBe(0);
  expect(errors).toEqual([]);
});

test("Python protects edits made while the response is pending", async ({ page }, info) => {
  const errors = failures(page);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/zyra/chat", async route => { await waiting; await route.fulfill({ contentType: "text/event-stream", body: reply("```python\nprint(24)\n```") }); });
  const { drawer, composer } = await openZyra(page);
  await composer.fill("Buat program luas persegi panjang.");
  await drawer.getByRole("button", { name: "Buat kode", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Kode Python" });
  await editor.fill("print('edit terbaru')", { force: true });
  release();
  await expect(drawer.getByRole("button", { name: "Terapkan ke editor" })).toBeVisible();
  await expect(editor).toContainText("edit terbaru");
  await capture(page, info, "python-edit-conflict");
  await drawer.getByRole("button", { name: "Terapkan ke editor" }).click();
  await expect(editor).toContainText("print(24)");
  expect(errors).toEqual([]);
});

test("mixed math renders inline while prose, currency and code remain literal", async ({ page }, info) => {
  const errors = failures(page);
  let submitted = 0;
  await page.route("**/api/zyra/chat", route => { submitted++; return route.fulfill({ contentType: "text/event-stream", body: reply("Diterima.") }); });
  const { drawer, composer } = await openZyra(page);
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  const value = String.raw`Hitung $\int_{a}^{b} x^2\,dx$ dengan harga $5 dan $10, kode ` + "`$x$`.";
  await composer.fill(value);
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  await expect(composer.locator(".katex")).toHaveCount(1);
  await expect(composer).toContainText("harga $5 dan $10");
  await expect(drawer.getByText("Pratinjau Rumus", { exact: false })).toHaveCount(0);
  await capture(page, info, "math-rendered");
  await composer.locator(".zyra-composer-math").click();
  await expect(composer).toContainText(String.raw`\int_{a}^{b}`);
  await capture(page, info, "math-editing");
  for (let i = 0; i < 6; i++) await composer.press("ArrowRight");
  await composer.press("Delete");
  await composer.press("5");
  for (let i = 0; i < 3; i++) await composer.press("ArrowRight");
  await composer.press("Delete");
  await composer.pressSequentially("10");
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  await expect(composer.locator(".zyra-composer-math")).toHaveAttribute("aria-label", String.raw`\int_{5}^{10} x^2\,dx`);
  await capture(page, info, "math-bounds-edited");
  await composer.fill("Hitung $x^2$ saja.");
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  await composer.locator(".zyra-composer-math").click();
  await composer.press("Delete");
  await composer.press("y");
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  await expect(composer.locator(".zyra-composer-math")).toHaveAttribute("aria-label", "y^2");
  await expect(composer).toContainText("Hitung");
  await expect(composer).toContainText("saja.");
  await composer.fill("teks biasa \nbaris kedua");
  await composer.press("End");
  await composer.press("Shift+Enter");
  await composer.press("x");
  await expect(composer).toContainText("baris kedua");
  await capture(page, info, "multiline-text");
  await composer.fill("Rumus $$\\int_0^1\nx^2 dx$$ selesai.");
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  await expect(composer.locator(".katex")).toHaveCount(1);
  await capture(page, info, "multiline-math");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await capture(page, info, "math-dark");
  await page.emulateMedia({ colorScheme: "light" });
  await composer.fill("");
  await drawer.getByRole("button", { name: "Input matematika" }).click();
  await capture(page, info, "math-palette-open");
  await page.getByRole("button", { name: /Sisipkan.*Integral tentu/ }).click();
  await expect(composer.locator(".zyra-composer-math")).toHaveAttribute("aria-label", String.raw`\int_{a}^{b}`);
  await expect(drawer.getByRole("button", { name: "Input matematika" })).toHaveAttribute("aria-expanded", "false");
  await capture(page, info, "math-palette-inserted");
  await composer.fill(String.raw`Belum selesai $\int_{a}`);
  await expect(composer.locator(".katex")).toHaveCount(0);
  await composer.evaluate(element => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  });
  expect(submitted).toBe(0);
  await composer.fill("");
  await composer.evaluate(element => {
    const data = new DataTransfer();
    data.setData("text/html", '<img src="/must-not-load" onerror="alert(1)">');
    data.setData("text/plain", "Teks <b>biasa</b>");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(composer).toContainText("Teks <b>biasa</b>");
  await expect(composer.locator("img,b")).toHaveCount(0);
  expect(errors).toEqual([]);
});


test("typing, navigating and deleting math keeps the draft intact", async ({ page }, info) => {
  const errors = failures(page);
  const { drawer, composer } = await openZyra(page);
  await composer.click();
  await composer.pressSequentially(String.raw`Hitung $\int_{a}^{b} x^2\,dx$ lalu jelaskan.`, { delay: 15 });
  await expect(composer.locator(".zyra-composer-math")).toHaveCount(1);
  await capture(page, info, "keyboard-typed-math");
  await composer.press("ControlOrMeta+Home");
  for (let i = 0; i < 8; i++) await composer.press("ArrowRight");
  // A rendered formula is one navigation/deletion unit, not hidden source offsets.
  await expect(composer.locator(".zyra-composer-math")).toHaveCount(1);
  await composer.press("Backspace");
  await expect(composer).toHaveText("Hitung  lalu jelaskan.");
  await composer.press("ControlOrMeta+z");
  await expect(composer.locator(".zyra-composer-math")).toHaveCount(1);
  await composer.press("ControlOrMeta+Home");
  for (let i = 0; i < 7; i++) await composer.press("ArrowRight");
  await composer.press("Delete");
  await expect(composer).toHaveText("Hitung  lalu jelaskan.");
  await composer.press("ControlOrMeta+z");
  await composer.press("ControlOrMeta+Shift+Z");
  await expect(composer).toHaveText("Hitung  lalu jelaskan.");
  await composer.press("ControlOrMeta+z");
  await composer.press("ControlOrMeta+End");
  await composer.pressSequentially(" Harga $5 dan $10.");
  await expect(composer.locator(".zyra-composer-math")).toHaveCount(1);
  await expect(composer).toContainText("Harga $5 dan $10.");
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  await capture(page, info, "keyboard-draft-complete");
  expect(errors).toEqual([]);
});

test("composer preserves raw source through copy, paste, send and undo", async ({ page }, info) => {
  const errors = failures(page);
  const { drawer, composer } = await openZyra(page);
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  let question = "";
  await page.route("**/api/zyra/chat", route => {
    question = route.request().postDataJSON().question;
    return route.fulfill({ contentType: "text/event-stream", body: reply("Diterima.") });
  });
  const source = String.raw`Jelaskan $\frac{1}{2}$ dan $x^2$, serta $$\nx+1\n$$.`;
  await composer.click();
  await composer.pressSequentially(source);
  await expect(composer.locator(".zyra-composer-math")).toHaveCount(2);
  await composer.press("ControlOrMeta+a");
  const copied = await composer.evaluate(element => {
    const data = new DataTransfer();
    element.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
    return data.getData("text/plain");
  });
  expect(copied).toBe(source);
  await composer.press("Backspace");
  await expect(composer.locator(".cm-placeholder")).toBeVisible();
  await composer.press("ControlOrMeta+z");
  await composer.press("ControlOrMeta+End");
  await expect(composer.locator(".zyra-composer-math")).toHaveCount(2);
  await capture(page, info, "copy-undo-restored");
  await composer.press("ControlOrMeta+a");
  await composer.press("Backspace");
  await composer.evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, copied);
  await expect(composer.locator(".zyra-composer-math")).toHaveCount(2);
  await composer.press("Enter");
  await expect.poll(() => question).toBe(source.replace(/\\n/g, "\n"));
  await expect(drawer.getByText("Diterima.", { exact: true })).toBeVisible();
  await composer.click();
  await composer.press("ControlOrMeta+z");
  await expect(composer.locator(".cm-placeholder")).toBeVisible();
  await capture(page, info, "sent-draft-undo-empty");
  expect(errors).toEqual([]);
});

test("composer keeps invalid math literal and grows only to its scroll limit", async ({ page }, info) => {
  const errors = failures(page);
  const { drawer, composer } = await openZyra(page);
  const samples = [
    [String.raw`Teks biasa, harga $5 dan $10, URL https://example.com/a_b.`, 0],
    [String.raw`Belum selesai $\int_{a}^{b}`, 0],
    [String.raw`Salah $\notACommand{x}$ dan benar $x^2$.`, 1],
    [String.raw`Kode ` + "`$x^2$`" + String.raw` dan \$literal, benar \(y^2\) serta \[z^2\].`, 2],
    [String.raw`Dua rumus $$\frac{1}{2}$$ dan $\sqrt{x}$.`, 2],
  ] as const;
  for (const [source, count] of samples) {
    await composer.click();
    await composer.press("ControlOrMeta+a");
    await composer.pressSequentially(source);
    await expect(composer.locator(".zyra-composer-math")).toHaveCount(count);
  }
  await capture(page, info, "multiple-delimiters");
  await composer.press("ControlOrMeta+a");
  await composer.pressSequentially(String.raw`Perbaiki $\notACommand{x}$ tanpa mengubah teks.`);
  await capture(page, info, "invalid-math-literal");
  await composer.press("ControlOrMeta+a");
  await composer.pressSequentially("Jelaskan langkah berikut.");
  for (let i = 0; i < 12; i++) {
    await composer.press("Shift+Enter");
    await composer.pressSequentially(`Baris ${i + 1} dengan keterangan.`);
  }
  const scroller = drawer.locator("footer .cm-scroller");
  expect(await scroller.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  expect((await drawer.locator("footer").boundingBox())!.height).toBeLessThan(250);
  await expect(drawer.getByRole("button", { name: "Kirim pesan", exact: true })).toBeInViewport();
  await capture(page, info, "long-draft-scroll");
  expect(errors).toEqual([]);
});

test("math palette closes, restores typing focus and replaces selections safely", async ({ page }, info) => {
  const errors = failures(page);
  const { drawer, composer } = await openZyra(page);
  const palette = drawer.getByRole("button", { name: "Input matematika" });
  await composer.click();
  await composer.pressSequentially("A $x^2$ B");
  await composer.locator(".zyra-composer-math").click();
  await composer.press("Shift+End");
  await palette.click();
  await page.getByRole("button", { name: /Sisipkan.*Integral tentu/ }).click();
  await expect(palette).toHaveAttribute("aria-expanded", "false");
  await expect(composer).toBeFocused();
  await expect(composer.locator(".zyra-composer-math")).toHaveCount(1);
  await composer.pressSequentially(" selesai.");
  await capture(page, info, "palette-selection-replaced");
  await composer.press("ControlOrMeta+a");
  await expect(composer).toHaveText(String.raw`A $\int_{a}^{b}$ selesai.`);
  await palette.click();
  await page.keyboard.press("Escape");
  await expect(palette).toBeFocused();
  expect(errors).toEqual([]);
});

test("an unfinished Python stream cannot change the editor or expose final code", async ({ page }, info) => {
  const errors = failures(page);
  await page.route("**/api/zyra/chat", route => route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "text-delta", textDelta: "```python\nprint(99)\n```" })}\n\n` }));
  const { drawer, composer } = await openZyra(page);
  const editor = page.getByRole("textbox", { name: "Kode Python" });
  const before = await editor.textContent();
  await composer.fill("Buat program.");
  await drawer.getByRole("button", { name: "Buat kode", exact: true }).click();
  await expect(drawer.getByText("Maaf, terjadi kendala saat memproses jawaban. Coba lagi dalam beberapa saat.")).toBeVisible();
  await expect(editor).toHaveText(before!);
  await expect(drawer.locator("pre")).toHaveCount(0);
  await expect(drawer.getByText("print(99)", { exact: true })).toHaveCount(0);
  await capture(page, info, "python-incomplete-stream");
  expect(errors).toEqual([]);
});

test("Python generation errors and missing code preserve the editor", async ({ page }, info) => {
  const errors = failures(page);
  const { drawer, composer } = await openZyra(page);
  const editor = page.getByRole("textbox", { name: "Kode Python" });
  const before = await editor.textContent();
  let failed = true;
  let unframed = false;
  await page.route("**/api/zyra/chat", route => {
    expect(route.request().postDataJSON().codingContext.intent).toBe("generate");
    return route.fulfill({ contentType: "text/event-stream", body: failed
      ? `data: ${JSON.stringify({ type: "data-error", data: { message: "Zyra belum dapat merespons." } })}\n\ndata: [DONE]\n\n`
      : reply(unframed ? "print(99)" : "Coba gunakan print.") });
  });
  await composer.fill("Tampilkan satu.");
  await drawer.getByRole("button", { name: "Buat kode", exact: true }).click();
  await expect(drawer.getByText(/Zyra belum dapat merespons/)).toBeVisible();
  await expect(editor).toHaveText(before!);
  await capture(page, info, "generation-error");
  failed = false;
  await drawer.getByRole("button", { name: /Coba lagi/i }).last().click();
  await expect(drawer.getByText("Coba gunakan print.")).toBeVisible();
  await expect(editor).toHaveText(before!);
  await capture(page, info, "generation-no-code");
  unframed = true;
  await composer.fill("Buat program lengkap.");
  await drawer.getByRole("button", { name: "Buat kode", exact: true }).click();
  await expect(drawer.getByText("print(99)", { exact: true })).toBeVisible();
  await expect(editor).toHaveText(before!);
  await capture(page, info, "generation-unframed-code");
  expect(errors).toEqual([]);
});

test("unsaved and interrupted replies do not inflate history counts", async ({ page }, info) => {
  const errors = failures(page);
  const { drawer, composer } = await openZyra(page);
  let saved = false;
  await page.route("**/api/zyra/chat", route => route.fulfill({ contentType: "text/event-stream", body:
    `data: ${JSON.stringify({ type: "text-delta", textDelta: "Penjelasan tetap tersedia." })}\n\n` +
    (saved ? "" : `data: ${JSON.stringify({ type: "data-history", saved: false, message: "Jawaban ini belum tersimpan. Salin bagian yang diperlukan." })}\n\ndata: [DONE]\n\n`) }));
  await composer.fill("Bantu saya.");
  await composer.press("Enter");
  await expect(page.getByText("Jawaban ini belum tersimpan. Salin bagian yang diperlukan.")).toBeVisible();
  await drawer.getByRole("button", { name: "Menu topik dan mode Zyra" }).click();
  await expect(drawer.getByText(/2 pesan/)).toBeVisible();
  await capture(page, info, "history-save-failed");
  await drawer.getByRole("button", { name: "Menu topik dan mode Zyra" }).click();
  saved = true;
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  await composer.fill("Coba lagi.");
  await composer.press("Enter");
  await expect(drawer.getByText("Maaf, terjadi kendala saat memproses jawaban. Coba lagi dalam beberapa saat.")).toBeVisible();
  await drawer.getByRole("button", { name: "Menu topik dan mode Zyra" }).click();
  await expect(drawer.getByText(/2 pesan/)).toBeVisible();
  await capture(page, info, "history-incomplete-not-counted");
  expect(errors).toEqual([]);
});

test("history count respects the 100-message retention limit", async ({ page }, info) => {
  const errors = failures(page);
  await mockTerminal(page);
  await mockZyraDrawer(page, 50);
  await page.route("**/api/zyra/chat", route => route.fulfill({ contentType: "text/event-stream", body: reply("Diterima.") }));
  await page.goto("/visual-fixtures/coding?terminal=1");
  await page.getByRole("button", { name: "Buka Zyra" }).click();
  const drawer = page.getByRole("complementary", { name: "Asisten belajar Zyra" });
  await expect(drawer.getByText("Kalikan panjang dengan lebar.", { exact: true })).toHaveCount(50);
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  const composer = drawer.getByRole("textbox", { name: "Tanyakan materi atau rumus..." });
  await composer.fill("Pertanyaan berikutnya.");
  await composer.press("Enter");
  await expect(drawer.getByText("Diterima.", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Menu topik dan mode Zyra" }).click();
  await expect(drawer.getByText(/100 pesan/)).toBeVisible();
  await expect(drawer.getByText(/102 pesan/)).toHaveCount(0);
  await capture(page, info, "history-retention-limit");
  expect(errors).toEqual([]);
});

test("Python presets use contextual intents and the editor fills remaining height", async ({ page }, info) => {
  const errors = failures(page);
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/zyra/chat", route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ contentType: "text/event-stream", body: reply("Langkah pertama adalah membaca input.") });
  });
  await mockTerminal(page);
  await mockZyraDrawer(page);
  await page.goto("/visual-fixtures/coding?terminal=1");
  const editor = page.getByRole("textbox", { name: "Kode Python", exact: true });
  await editor.fill(Array.from({ length: 90 }, (_, i) => `print(${i})`).join("\n"));
  for (const state of ["closed", "open"]) {
    if (state === "open") await page.getByRole("button", { name: "Buka terminal", exact: true }).click();
    await expect.poll(async () => {
      const box = await page.locator(".cm-editor").boundingBox();
      return box ? Math.abs(box.y + box.height - (page.viewportSize()!.height - 64)) : 999;
    }).toBeLessThan(3);
    await capture(page, info, `viewport-${state}`);
  }
  await page.getByRole("button", { name: "Buka Zyra" }).click();
  const drawer = page.getByRole("complementary", { name: "Asisten belajar Zyra" });
  await expect(drawer.getByRole("toolbar", { name: "Bantuan Python" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Jelaskan error", exact: true })).toBeDisabled();
  await capture(page, info, "python-presets-idle");
  await drawer.getByRole("button", { name: "Pecah masalah", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].codingContext).toMatchObject({ kind: "playground", intent: "decompose" });
  await expect(drawer.getByText("Langkah pertama adalah membaca input.", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Kode diterapkan ke editor.", { exact: true })).toHaveCount(0);
  await capture(page, info, "python-presets-response");
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  await expect(drawer.getByRole("toolbar", { name: "Bantuan Python" })).toHaveCount(0);
  await capture(page, info, "tutor-presets");
  expect(errors).toEqual([]);
});

test("review and contextual followup retries never replace the editor", async ({ page }, info) => {
  const errors = failures(page);
  const requests: string[] = [];
  await page.route("**/api/zyra/chat", route => {
    const intent = route.request().postDataJSON().codingContext.intent;
    requests.push(intent);
    const n = requests.length;
    const body = n === 1 || n === 3
      ? `data: ${JSON.stringify({ type: "data-error", data: { message: "Coba kembali." } })}\n\ndata: [DONE]\n\n`
      : `data: ${JSON.stringify({ type: "text-delta", textDelta: "Penjelasan.\n\`\`\`python\nprint(99)\n\`\`\`" })}\n\n` +
        (n === 2 ? `data: ${JSON.stringify({ type: "data-followups", followups: [{ label: "Jelaskan lagi", prompt: "Jelaskan langkah ini", icon: "help", intent: "explain" }] })}\n\n` : "") + "data: [DONE]\n\n";
    return route.fulfill({ contentType: "text/event-stream", body });
  });
  const { drawer, composer } = await openZyra(page);
  const editor = page.getByRole("textbox", { name: "Kode Python" });
  const before = await editor.textContent();
  await composer.fill("Mengapa loop ini berhenti?");
  await composer.press("Enter");
  await expect(drawer.getByRole("button", { name: /Coba lagi/i }).last()).toBeVisible();
  await capture(page, info, "review-error");
  await drawer.getByRole("button", { name: /Coba lagi/i }).last().click();
  await expect(drawer.getByRole("button", { name: "Jelaskan lagi" })).toBeVisible();
  await capture(page, info, "review-retried");
  await drawer.getByRole("button", { name: "Jelaskan lagi" }).click();
  await drawer.getByRole("button", { name: /Coba lagi/i }).last().click();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests).toEqual(["review", "review", "review", "review"]);
  await expect(drawer.getByText("Penjelasan.", { exact: true }).last()).toBeVisible();
  await capture(page, info, "followup-retried");
  expect(errors).toEqual([]);
  await expect(editor).toHaveText(before!);
});

test("image retries preserve the original request and a new draft", async ({ page }, info) => {
  const requests: Record<string, any>[] = [];
  let uploads = 0;
  await page.route("**/api/zyra/attachments", route => {
    uploads++;
    return route.fulfill({ json: { id: `image-${uploads}`, sessionId: "zyra-session", width: 1, height: 1 } });
  });
  await page.route("**/api/zyra/attachments/image-**", route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") }));
  await page.route("**/api/zyra/chat", route => {
    requests.push(route.request().postDataJSON());
    const n = requests.length;
    const body = n === 1
      ? `data: ${JSON.stringify({ type: "data-error", data: { message: "Coba kembali." } })}\n\ndata: [DONE]\n\n`
      : n === 3 ? `data: ${JSON.stringify({ type: "text-delta", textDelta: "partial" })}\n\n`
      : reply(`Penjelasan.\n\`\`\`python\nprint(${n === 4 ? 77 : 99})\n\`\`\``);
    return route.fulfill({ contentType: "text/event-stream", body });
  });
  const { drawer, composer } = await openZyra(page);
  const editor = page.getByRole("textbox", { name: "Kode Python" });
  const before = await editor.textContent();
  const pasteImage = async (name: string) => composer.evaluate((element, filename) => {
    const data = new DataTransfer();
    data.items.add(new File([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="), c => c.charCodeAt(0))], filename, { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, name);
  await pasteImage("first.png");
  await expect.poll(() => uploads).toBe(1);
  await expect(drawer.getByRole("button", { name: "Buat kode", exact: true })).toBeEnabled();
  await drawer.getByRole("button", { name: "Buat kode", exact: true }).click();
  await expect(drawer.getByText(/Coba kembali/)).toBeVisible();
  await expect(editor).toHaveText(before!);
  await capture(page, info, "image-retry-error");
  await composer.fill("Draft baru");
  await pasteImage("second.png");
  await expect.poll(() => uploads).toBe(2);
  await capture(page, info, "image-retry-draft");
  await drawer.getByRole("button", { name: /Coba lagi/i }).last().click();
  await expect(editor).toContainText("print(99)");
  await expect(composer).toContainText("Draft baru");
  await capture(page, info, "image-retry-success");
  expect(requests.slice(0, 2).map(r => [r.sessionId, r.attachmentIds, r.codingContext.intent])).toEqual([
    ["zyra-session", ["image-1"], "generate"], ["zyra-session", ["image-1"], "generate"],
  ]);
  await composer.press("Enter");
  await expect(drawer.getByRole("button", { name: /Coba lagi/i }).last()).toBeVisible();
  await drawer.getByRole("button", { name: /Coba lagi/i }).last().click();
  await expect.poll(() => requests.length).toBe(4);
  await expect(drawer.getByText("Penjelasan.", { exact: true }).last()).toBeVisible();
  expect(requests.slice(2).map(r => [r.question, r.sessionId, r.attachmentIds, r.codingContext.intent])).toEqual([
    ["Draft baru", "zyra-session", ["image-2"], "review"], ["Draft baru", "zyra-session", ["image-2"], "review"],
  ]);
  await expect(editor).toContainText("print(99)");
  expect(uploads).toBe(2);
});
