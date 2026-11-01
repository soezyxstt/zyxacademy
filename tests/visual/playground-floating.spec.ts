import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mockTerminal, mockZyraDrawer } from "./terminal-fixture";

async function openZyra(page: Page) {
  await mockTerminal(page);
  await mockZyraDrawer(page);
  await page.goto("/visual-fixtures/coding?terminal=1");
  await expect(page.getByRole("button", { name: "Masalah yang ingin diselesaikan" })).toHaveCount(0);
  await page.getByRole("button", { name: "Buka Zyra" }).click();
  const drawer = page.getByRole("complementary", { name: "Asisten belajar Zyra" });
  await expect(drawer.getByText("Kalikan panjang dengan lebar.")).toBeVisible();
  return { drawer, composer: drawer.getByRole("textbox", { name: "Tanyakan materi atau rumus..." }) };
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
  return `data: ${JSON.stringify({ type: "text-delta", textDelta: text })}\n\ndata: [DONE]\n\n`;
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
  const { drawer, composer } = await openZyra(page);
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
  await composer.fill("Hitung luas 6 kali 4.");
  await drawer.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect(drawer.getByRole("tab", { name: "Tutor", exact: true })).toBeDisabled();
  await expect(drawer.getByRole("button", { name: "Input matematika" })).toBeDisabled();
  await capture(page, info, "python-sending");
  release();
  await expect(drawer.getByText("Kode diterapkan ke editor.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Kode Python" })).toContainText("print(24)");
  await expect(drawer.locator("pre")).toHaveCount(0);
  expect(requests[0].codingContext).toMatchObject({ kind: "playground" });
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
  expect(errors).toEqual([]);
});

test("Python protects edits made while the response is pending", async ({ page }, info) => {
  const errors = failures(page);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/zyra/chat", async route => { await waiting; await route.fulfill({ contentType: "text/event-stream", body: reply("```python\nprint(24)\n```") }); });
  const { drawer, composer } = await openZyra(page);
  await composer.fill("Buat kode luas.");
  await composer.press("Enter");
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
  await drawer.getByRole("button", { name: "Input matematika" }).click();
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
