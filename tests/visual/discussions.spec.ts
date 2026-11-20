import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { createServer } from "node:http";
import { fixtureProxy } from "./fixtures/discussion-download-proxy.cjs";

test.setTimeout(120_000);
const fixture = "/visual-fixtures/discussions";

test("long course labels wrap within the list and thread", async ({ page }, info) => {
  await open(page, "?state=long-channel&role=admin");
  await expect(page.locator("[data-discussion-channel-label]").last()).toContainText("Matematika".repeat(16));
  const contained = async () => page.locator("[data-discussion-channel-label]").evaluateAll(labels => labels.every(label => label.scrollWidth <= label.clientWidth + 1));
  expect(await contained()).toBe(true);
  await capture(page, info, "long-channel-thread");
  if (page.viewportSize()!.width < 900) await page.getByRole("button", { name: "Kembali ke pertanyaan", exact: true }).click();
  await expect(page.getByRole("button", { name: /Mengapa limit ini perlu difaktorkan/ })).toBeVisible();
  expect(await contained()).toBe(true);
  await capture(page, info, "long-channel-list");
});

test("read acknowledgement retries once while the same content stays visible", async ({ page }, info) => {
  await open(page, "?state=read-observation&fail=read");
  await expect(page.locator("main")).toHaveAttribute("data-fixture-read-attempts", "1", { timeout: 15000 });
  await expect(page.locator("main")).toHaveAttribute("data-fixture-read-revision", "0");
  await capture(page, info, "read-ack-first-failure");
  await expect(page.locator("main")).toHaveAttribute("data-fixture-read-attempts", "2", { timeout: 15000 });
  await expect(page.locator("main")).toHaveAttribute("data-fixture-read-revision", "1");
  await capture(page, info, "read-ack-recovered-without-scroll");
});

test("message actions and deletion identify repeated posts by sequence and excerpt", async ({ page }, info) => {
  await open(page, "?locale=en&role=admin");
  const actions = page.locator('[data-message-id="m3"]').getByRole("button", { name: /^Actions for message 3 from Nadia Putri:/ });
  await actions.scrollIntoViewIfNeeded();
  await actions.click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete message" });
  await expect(dialog).toContainText("Message 3 from Nadia Putri:");
  await expect(dialog).toContainText("Jadi hasilnya 4");
  await capture(page, info, "delete-message-reference");
});

for (const locale of ["id", "en"] as const) {
 test(`namesake pages reach the eleventh authorized identity in ${locale}`, async ({ page }, info) => {
  const en = locale === "en";
  await open(page, `?locale=${locale}&state=mention-pages`);
  await page.getByRole("button", { name: en ? "Mention someone" : "Sebut orang", exact: true }).click();
  const picker = page.getByRole("dialog", { name: en ? "Mention someone" : "Sebut orang", exact: true });
  await picker.getByRole("textbox", { name: en ? "Search people to mention" : "Cari orang untuk disebut" }).fill("Alice");
  await expect(picker.getByRole("button", { name: en ? "Next" : "Berikutnya", exact: true })).toBeEnabled();
  await capture(page, info, `${locale}-namesake-first-page`);
  await picker.getByRole("button", { name: en ? "Next" : "Berikutnya", exact: true }).click();
  const person = picker.getByRole("button", { name: /Alice, (Student|Murid), Materi 11$/, exact: true });
  await expect(person).toBeEnabled();
  await capture(page, info, `${locale}-namesake-eleventh`);
  await person.click();
  await page.getByRole("button", { name: en ? "Send answer" : "Kirim jawaban", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-fixture-mention-ids", "alice-11");
  await capture(page, info, `${locale}-namesake-eleventh-posted`);
 });
 test(`uncertain forward explains a resolved destination in ${locale}`, async ({ page }, info) => {
  const en = locale === "en";
  await open(page, `?locale=${locale}&fail=resolved-forward`);
  await page.locator('[data-message-id="m2"]').getByRole("button", { name: /Actions for|Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: en ? "Forward" : "Teruskan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: en ? "Forward message" : "Teruskan pesan" });
  await expect(dialog.locator("[data-forward-preview]")).toBeVisible();
  await dialog.getByRole("option", { name: /Cara membaca domain dari grafik fungsi/ }).click();
  await dialog.getByRole("button", { name: en ? "Forward" : "Teruskan", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(en ? "Delivery status is unknown" : "Status pengiriman belum diketahui");
  await dialog.getByRole("button", { name: en ? "Forward" : "Teruskan", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(en ? "The destination discussion is resolved" : "Diskusi tujuan sudah selesai");
  const attempts = JSON.parse((await page.locator("main").getAttribute("data-fixture-forward-attempts"))!);
  expect(attempts[1].requestId).toBe(attempts[0].requestId);
  await capture(page, info, `${locale}-resolved-forward-uncertain`);
 });
}

for (const locale of ["id", "en"] as const) {
  test(`global Zyra guidance identifies its effective Free lane in ${locale}`, async ({ page }, info) => {
    await open(page, `?locale=${locale}&question=study`);
    await page.getByRole("textbox", { name: locale === "en" ? "Write a message" : "Tulis pesan" }).fill("@Zyra jelaskan topiknya");
    await expectHelpText(page, locale === "en" ? "This channel uses Free for student accounts: text only." : "Kanal ini memakai Free untuk akun murid: teks saja.", locale);
    await expectUnclipped(page.getByRole("button", { name: locale === "en" ? "Send answer" : "Kirim jawaban", exact: true }));
    await capture(page, info, `${locale}-global-zyra-effective-free`);
  });
}

for (const locale of ["id", "en"] as const) {
  test(`mention search error retains helper typography and retries in ${locale}`, async ({ page }, info) => {
    const en = locale === "en";
    await open(page, `?locale=${locale}&fail=mention`);
    await page.getByRole("button", { name: en ? "Mention someone" : "Sebut orang", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: en ? "Mention someone" : "Sebut orang", exact: true });
    await dialog.getByRole("textbox", { name: en ? "Search people to mention" : "Cari orang untuk disebut" }).fill("Dina");
    await expect(dialog.getByRole("alert").locator("p")).toHaveCSS("font-size", "12px");
    await capture(page, info, `${locale}-mention-search-error`);
    await dialog.getByRole("button", { name: en ? "Try again" : "Coba lagi", exact: true }).click();
    await expect(dialog.getByRole("button", { name: /Dina Sari/ })).toBeVisible();
    await capture(page, info, `${locale}-mention-search-recovered`);
  });
}

test("paragraphs and authored lists retain the same main body typography", async ({ page }, info) => {
  await open(page, "?question=function");
  const body = "Periksa setiap langkah berikut.\n\n- Faktorkan pembilang.\n- Sederhanakan pecahan.\n\n1. Periksa domain.\n2. Hitung limit.";
  await page.getByRole("textbox", { name: "Tulis pesan" }).fill(body);
  await capture(page, info, "markdown-list-editor");
  await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
  const message = page.locator("[data-discussion-content]").filter({ hasText: "Periksa setiap langkah berikut." });
  await expect(message).toBeVisible();
  for (const element of await message.locator("p, li").all()) await expect(element).toHaveCSS("font-size", "16px");
  await capture(page, info, "markdown-list-message");
});

test("session expiry preserves a private draft only for the same verified account", async ({ page }, info) => {
  await open(page, "?state=session");
  const input = page.getByRole("textbox", { name: "Tulis pesan" });
  await input.fill("Draf privat tetap tersedia.");
  await page.locator('input[type="file"]').setInputFiles("public/visual-fixtures/discussion-problem.png");
  await expect(page.getByRole("status", { name: /: Siap/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Expire fixture session" }).click();
  await expect(input).toHaveCount(0);
  await expect(page.locator("main").getByRole("alert")).toContainText(/draf/i);
  await capture(page, info, "session-expired-draft-hidden");
  await page.getByRole("button", { name: "Resume same account" }).click();
  await expect(input).toHaveText("Draf privat tetap tersedia.");
  await expect(page.getByRole("status", { name: /: Siap/ }).first()).toBeVisible();
  await expect(page.locator('img[alt="Pratinjau discussion-problem.png"]')).toBeVisible();
  await capture(page, info, "session-resumed-draft-retained");
  await page.getByRole("button", { name: "Switch fixture account" }).click();
  await expect(input).toHaveCount(0);
  await expect(page.locator("main").getByRole("alert")).toContainText("Sesi berubah");
  await capture(page, info, "session-account-changed-draft-purged");
  await page.getByRole("button", { name: "Resume same account" }).click();
  await expect(input).toHaveCount(0);
});

async function open(page: Page, query = "", origin = "") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(`${origin}${fixture}${query}`, { waitUntil: "load" });
  expect(response?.status()).toBeLessThan(400);
  expect(new URL(page.url()).pathname).toBe(fixture);
  const english = new URL(page.url()).searchParams.get("locale") === "en";
  await expect(page.getByRole("heading", { name: english ? "Discussions" : "Diskusi", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: english ? "Fixture role" : "Peran fixture" })).toContainText(english ? /Student|Tutor|Admin/ : /Murid|Tutor|Admin/);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
}

async function capture(page: Page, info: TestInfo, state: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`screenshots/${state}.png`);
  await page.screenshot({ path, fullPage: false, animations: "disabled" });
  await info.attach(state, { path, contentType: "image/png" });
}

async function expectHelpText(page: Page, text: string, locale: "id" | "en" = "id") {
  const name = locale === "en" ? "Discussion help" : "Bantuan diskusi";
  await page.getByRole("button", { name, exact: true }).click();
  const help = page.getByRole("dialog", { name, exact: true });
  await expect(help.getByText(text, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
}

async function expectMenuGutter(page: Page, menu: Locator) {
  await expect.poll(async () => {
    const box = await menu.boundingBox(), viewport = page.viewportSize();
    return !!box && !!viewport && box.x >= 15.5 && box.y >= 15.5
      && box.x + box.width <= viewport.width - 15.5 && box.y + box.height <= viewport.height - 15.5;
  }).toBe(true);
}

async function expectUnclipped(locator: Locator) {
  await expect(locator).toBeInViewport({ ratio: 1 });
  const clipping = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const failures: string[] = [];
    if (rect.top < -1 || rect.left < -1 || rect.bottom > innerHeight + 1 || rect.right > innerWidth + 1) failures.push("viewport");
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
      const x = /^(auto|scroll|hidden|clip)$/.test(style.overflowX), y = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
      if ((x && (rect.left < box.left + parent.clientLeft - 1 || rect.right > box.left + parent.clientLeft + parent.clientWidth + 1)) ||
          (y && (rect.top < box.top + parent.clientTop - 1 || rect.bottom > box.top + parent.clientTop + parent.clientHeight + 1))) failures.push(parent.className.toString());
    }
    return { height: rect.height, failures };
  });
  expect(clipping.failures).toEqual([]);
  return clipping.height;
}

async function expectComposerBounds(page: Page, sendLabel = "Kirim balasan") {
  expect(await expectUnclipped(page.getByRole("textbox", { name: "Tulis pesan" }))).toBeGreaterThanOrEqual(36);
  await expectUnclipped(page.getByRole("button", { name: sendLabel, exact: true }));
  await expectUnclipped(page.locator("[data-discussion-reply-target]"));
  const messages = page.locator("[data-discussion-messages]");
  const height = await expectUnclipped(messages);
  const roomFor160 = await messages.evaluate((element) => {
    const header = element.previousElementSibling as HTMLElement, composer = element.nextElementSibling as HTMLElement;
    const region = composer.querySelector<HTMLElement>('[role="region"]');
    const naturalComposer = composer.offsetHeight + (region ? Math.max(0, region.scrollHeight - region.clientHeight) : 0);
    return element.parentElement!.clientHeight - header.offsetHeight - naturalComposer >= 160;
  });
  if (roomFor160) expect(height).toBeGreaterThanOrEqual(159);
  else expect(height).toBeGreaterThanOrEqual(94);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  (page as Page & { discussionErrors: string[] }).discussionErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { discussionErrors: string[] }).discussionErrors).toEqual([]);
});

test("student question list and course mute", async ({ page }, info) => {
  await open(page, "?question=none");
  await capture(page, info, "student-question-list");
  const sidebar = page.getByRole("complementary", { name: "Daftar pertanyaan" });
  await sidebar.getByRole("combobox", { name: "Filter kanal" }).click();
  await expectMenuGutter(page, page.locator('[data-slot="popover-content"]'));
  await page.getByRole("option", { name: /Matematika I/ }).click();
  const bell = sidebar.getByRole("button", { name: "Bisukan notifikasi Matematika I" });
  const filterBox = (await sidebar.getByRole("combobox", { name: "Filter kanal" }).boundingBox())!;
  const bellBox = (await bell.boundingBox())!;
  expect(Math.abs(filterBox.y + filterBox.height / 2 - (bellBox.y + bellBox.height / 2))).toBeLessThan(4);
  expect(await sidebar.locator(".border-b").first().innerText()).toBe("Matematika I");
  await bell.click();
  await expect(sidebar.getByRole("button", { name: "Aktifkan notifikasi Matematika I" })).toBeVisible();
  await capture(page, info, "course-muted-unread");
});

test("thread actions reply and compact rich text composer", async ({ page }, info) => {
  await open(page);
  await capture(page, info, "student-course-thread");
  const initialMessagesHeight = (await page.locator("[data-discussion-messages]").boundingBox())!.height;
  const message = page.locator('[data-message-id="m2"]');
  await message.getByRole("button", { name: /Tindakan pesan/ }).click();
  await expectMenuGutter(page, page.getByRole("menu"));
  await capture(page, info, "message-actions");
  await page.getByRole("menuitem", { name: "Balas", exact: true }).click();
  expect((await page.locator("[data-discussion-messages]").boundingBox())!.height).toBeGreaterThanOrEqual(initialMessagesHeight - 56);
  await expect(page.getByText(/Balasan bukan jawaban/)).toHaveCount(0);
  const toolbar = page.locator("[data-discussion-toolbar]");
  const toolbarBox = await toolbar.boundingBox();
  expect(toolbarBox!.height).toBeLessThanOrEqual(44);
  await page.getByRole("button", { name: "Format teks", exact: true }).click();
  await expectMenuGutter(page, page.getByRole("menu"));
  await capture(page, info, "formatting-menu");
  await page.getByRole("menuitem", { name: "Tebal", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Tulis pesan" })).toHaveText("****");
  await page.getByRole("textbox", { name: "Tulis pesan" }).fill("**Terima kasih**, @Zyra bagaimana jika penyebutnya berbeda?");
  await expect(page.getByText(/@Zyra membaca judul, pesan ini/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kirim balasan", exact: true })).toBeInViewport({ ratio: 1 });
  const editor = page.getByRole("textbox", { name: "Tulis pesan" });
  const editorBox = await editor.boundingBox();
  const regionBox = await page.getByRole("region", { name: "Isi penyunting pesan" }).boundingBox();
  expect(editorBox!.height).toBeGreaterThanOrEqual(36);
  expect(editorBox!.y + editorBox!.height).toBeLessThanOrEqual(regionBox!.y + regionBox!.height + 1);
  await capture(page, info, "reply-zyra-guidance");
  await expect(page.locator(".zyra-composer-bold")).toContainText("Terima kasih");
  await capture(page, info, "composer-rich-inline");
  await page.locator('input[type="file"]').setInputFiles({ name: "balasan.png", mimeType: "image/png", buffer: await readFile("public/visual-fixtures/discussion-problem.png") });
  await expect(page.getByRole("button", { name: "Hapus balasan.png" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kirim balasan", exact: true })).toBeInViewport({ ratio: 1 });
  await expectComposerBounds(page);
  await capture(page, info, "reply-image-zyra-combined");
});

test("English reply and answer labels remain distinct", async ({ page }, info) => {
  await open(page, "?locale=en");
  await page.locator('[data-message-id="m2"]').getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Reply", exact: true }).click();
  await expect(page.getByText(/Replies are not answers/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send reply", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Text formatting", exact: true }).click();
  await expectMenuGutter(page, page.getByRole("menu"));
  await expect(page.getByRole("menuitem", { name: "Formula", exact: true })).toBeVisible();
  await capture(page, info, "en-formatting-menu");
  await page.keyboard.press("Escape");
  await capture(page, info, "en-reply-guidance");
  await page.getByRole("button", { name: "Cancel reply", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send answer", exact: true })).toBeVisible();
});

test("image attachment and report dialog", async ({ page }, info) => {
  await open(page);
  await page.locator('[data-message-id="m1"]').getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Laporkan", exact: true }).click();
  await page.getByRole("textbox", { name: "Alasan laporan" }).fill("Gambar perlu ditinjau oleh tim.");
  await capture(page, info, "report-message-dialog");
  await page.getByRole("button", { name: "Kirim laporan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles({ name: "soal.png", mimeType: "image/png", buffer: await readFile("public/visual-fixtures/discussion-problem.png") });
  await expect(page.getByRole("button", { name: "Hapus soal.png" })).toBeVisible();
  await capture(page, info, "image-upload-preview");
  await expect(page.getByRole("button", { name: "Kirim jawaban", exact: true })).toBeInViewport();
});

test("private attachment preview and download stay inside viewport", async ({ page, context }, info) => {
  const image = await readFile("public/visual-fixtures/discussion-problem.png");
  expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
  const proxy = fixtureProxy(info.project.use.baseURL!, image);
  const server = createServer(proxy);
  server.on("upgrade", proxy.upgrade);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Invalid discussion fixture proxy address");
    const origin = `http://127.0.0.1:${address.port}`;
    await context.route(url => url.pathname.startsWith("/api/discussions/attachments/") && `${url.pathname}${url.search}` !== "/api/discussions/attachments/image-1?download=1", route => route.fulfill({ status: 200, contentType: "image/png", body: image }));
    await open(page, "?state=private-image", origin);
    await expect(page.getByRole("img", { name: "Soal limit fungsi saat x mendekati 2", exact: true })).toHaveAttribute("src", /\/api\/discussions\/attachments\/image-1\?preview=1$/);
    await capture(page, info, "private-image-small-preview");
    await page.getByRole("button", { name: /Perbesar Soal limit/ }).click();
    await expect(page.getByRole("link", { name: "Unduh", exact: true })).toBeInViewport();
    await capture(page, info, "private-image-preview-long-filename");
    await expect(page.getByRole("link", { name: "Unduh", exact: true })).toHaveAttribute("href", "/api/discussions/attachments/image-1?download=1");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Unduh", exact: true }).click();
    const file = await download;
    expect(file.url()).toContain("/api/discussions/attachments/image-1?download=1");
    expect(file.url()).toBe(`${origin}/api/discussions/attachments/image-1?download=1`);
    expect(file.suggestedFilename()).toBe("soal-limit.png");
    expect(await file.failure()).toBeNull();
    expect(await readFile(await file.path())).toEqual(image);
    await open(page, "?state=private-image-old", origin);
    await expect(page.getByText("Pratinjau tidak tersedia.", { exact: true })).toBeVisible();
    await expect(page.getByText("Buka gambar", { exact: true })).toBeVisible();
    await page.getByText("Pratinjau tidak tersedia.", { exact: true }).scrollIntoViewIfNeeded();
    await capture(page, info, "private-image-legacy-placeholder");
    await page.getByRole("button", { name: /Perbesar Soal limit/ }).click();
    await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();
  } finally {
    proxy.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("full image retries after a transient decode failure", async ({ page, context }, info) => {
  const image = await readFile("public/visual-fixtures/discussion-problem.png");
  let fullRequests = 0;
  await context.route("**/api/discussions/attachments/**", route => {
    const preview = route.request().url().includes("preview=1");
    if (!preview) fullRequests++;
    return route.fulfill({ status: 200, contentType: "image/png", headers: { "cache-control": "no-store" }, body: !preview && fullRequests === 1 ? "invalid image" : image });
  });
  await open(page, "?state=private-image");
  await page.getByRole("button", { name: /Perbesar Soal limit/ }).click();
  await expect(page.getByRole("dialog").getByText("Gambar tidak tersedia.")).toBeVisible();
  await capture(page, info, "private-image-full-failed");
  await page.getByRole("dialog").getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();
  expect(fullRequests).toBe(2);
  await capture(page, info, "private-image-full-retried");
});

test("a failed private thumbnail reloads after opening and closing the image", async ({ page, context }, info) => {
  const image = await readFile("public/visual-fixtures/discussion-problem.png");
  let previews = 0;
  let recovered = false;
  await context.route("**/api/discussions/attachments/**", route => {
    const preview = route.request().url().includes("preview=1");
    if (preview) previews++;
    return route.fulfill({ status: 200, contentType: "image/png", headers: { "cache-control": "no-store" }, body: preview && !recovered ? "invalid image" : image });
  });
  await open(page, "?state=private-image");
  await expect(page.getByText("Pratinjau tidak tersedia.", { exact: true })).toBeVisible();
  await expect(page.getByText("Buka gambar", { exact: true })).toBeVisible();
  await capture(page, info, "private-thumbnail-failed");
  recovered = true;
  await page.getByRole("button", { name: /Perbesar Soal limit/ }).click();
  await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();
  await page.keyboard.press("Escape");
  const thumbnail = page.getByRole("img", { name: "Soal limit fungsi saat x mendekati 2", exact: true });
  await expect(thumbnail).toBeVisible();
  await expect.poll(() => thumbnail.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
  expect(previews).toBeGreaterThanOrEqual(2);
  await capture(page, info, "private-thumbnail-recovered");
});

test("an image dialog delays observing a new message revision until it closes", async ({ page }, info) => {
  await open(page, "?state=read-observation");
  const message = page.locator('[data-message-id="m1"]');
  await message.scrollIntoViewIfNeeded();
  await expect(page.locator("main")).toHaveAttribute("data-fixture-read-revision", "1");
  await message.getByRole("button", { name: /Perbesar Soal limit/ }).click();
  await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();
  await page.waitForTimeout(1700);
  await expect(page.locator("main")).toHaveAttribute("data-fixture-read-revision", "1");
  await capture(page, info, "read-revision-dialog-open");
  await page.keyboard.press("Escape");
  await expect(page.locator("main")).toHaveAttribute("data-fixture-read-revision", "2");
  await capture(page, info, "read-revision-dialog-closed");
});

test("the real visibility helper ignores a header without message content", async ({ page }, info) => {
  await open(page, "?state=read-visibility");
  const pane = page.locator("[data-discussion-messages]");
  const message = page.locator('[data-message-id="m1"]');
  await pane.evaluate(element => {
    const item = element.querySelector<HTMLElement>('[data-message-id="m1"]')!;
    element.scrollTop += item.getBoundingClientRect().top - (element.getBoundingClientRect().bottom - 38);
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(message.getByText("Nadia Putri", { exact: true })).toBeInViewport();
  expect(await message.locator("[data-discussion-content]").evaluate(element => element.getBoundingClientRect().top >= element.closest("[data-discussion-messages]")!.getBoundingClientRect().bottom - 1)).toBe(true);
  await page.waitForTimeout(2300);
  await expect.poll(async () => Number(await page.locator("main").getAttribute("data-fixture-empty-observations"))).toBeGreaterThan(0);
  await expect(page.locator("main")).toHaveAttribute("data-fixture-read-revision", "0");
  await capture(page, info, "read-header-only");
  await message.locator("[data-discussion-content]").scrollIntoViewIfNeeded();
  await expect(page.locator("main")).toHaveAttribute("data-fixture-read-revision", "1");
  await capture(page, info, "read-content-visible");
});

test("image fallback and failed upload retry", async ({ page }, info) => {
  await open(page, "?state=image-error");
  await expect(page.getByText("Gambar tidak tersedia.", { exact: true })).toBeVisible();
  await page.getByText("Gambar tidak tersedia.", { exact: true }).scrollIntoViewIfNeeded();
  await capture(page, info, "image-error-fallback");
  await open(page, "?fail=upload");
  await page.locator('input[type="file"]').setInputFiles("public/visual-fixtures/discussion-problem.png");
  await expect(page.getByRole("status", { name: /: Unggah gagal/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coba unggah discussion-problem.png lagi" })).toBeInViewport();
  await capture(page, info, "upload-error-retry");
  await page.getByRole("button", { name: "Coba unggah discussion-problem.png lagi" }).click();
  await expect(page.getByRole("status", { name: /: Unggah gagal/ })).toHaveCount(0);
});

test("new question keeps submit visible with image and Zyra", async ({ page }, info) => {
  await open(page, "?question=none");
  await page.getByRole("button", { name: "Pertanyaan baru", exact: true }).click();
  await expect(page.locator("[data-discussion-new-question]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pertanyaan baru", exact: true })).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Tulis pesan", exact: true }).fill("Bagaimana menyederhanakan limit ini?\n@Zyra bantu jelaskan langkahnya.");
  await page.locator('[data-discussion-composer] input[type="file"]').setInputFiles("public/visual-fixtures/discussion-problem.png");
  await expect(page.getByRole("button", { name: "Kirim pertanyaan", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Kirim pertanyaan", exact: true })).toBeInViewport();
  await capture(page, info, "new-question-image-zyra");
});

test("send failure preserves draft then success and edit", async ({ page }, info) => {
  await open(page, "?fail=send");
  const input = page.getByRole("textbox", { name: "Tulis pesan" });
  await input.fill("Saya mencoba memfaktorkan pembilang terlebih dahulu.");
  await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
  await expect(input).toHaveText("Saya mencoba memfaktorkan pembilang terlebih dahulu.");
  await expect(page.getByText("Status pengiriman belum diketahui. Periksa diskusi atau coba kirim ulang tanpa mengubah isi.")).toBeVisible();
  await capture(page, info, "send-error-preserved-draft");
  await page.getByRole("button", { name: "Coba kirim lagi", exact: true }).click();
  await expect(input).toHaveText(/^(Tulis pesan|Write a message)?$/);
  const sent = page.locator("[data-message-id]").filter({ hasText: "Saya mencoba memfaktorkan pembilang terlebih dahulu." });
  await sent.getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Ubah", exact: true }).click();
  await capture(page, info, "student-edit-window");
});

test("lost response locks the submitted draft until an unchanged retry resolves", async ({ page }, info) => {
  await open(page, "?fail=lost-response");
  const input = page.getByRole("textbox", { name: "Tulis pesan" });
  await page.locator('[data-message-id="m2"]').getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Balas", exact: true }).click();
  await input.fill("@Zyra jelaskan contoh ini.");
  await page.getByRole("button", { name: "Kirim balasan", exact: true }).click();
  await expect(page.getByText(/Status pengiriman belum diketahui/)).toBeVisible();
  await expect(input).toBeDisabled();
  await expect(input).toHaveText("@Zyra jelaskan contoh ini.");
  const other = page.locator('[data-message-id="m1"]');
  await other.getByRole("button", { name: /Tindakan pesan/ }).click();
  await expect(page.getByRole("menuitem", { name: "Balas", exact: true })).toBeDisabled();
  await capture(page, info, "send-outcome-unknown-reply-disabled");
  await page.keyboard.press("Escape");
  await other.dispatchEvent("pointerdown", { pointerId: 17, pointerType: "touch", clientX: 100, clientY: 300 });
  await other.dispatchEvent("pointermove", { pointerId: 17, pointerType: "touch", clientX: 180, clientY: 302 });
  await other.dispatchEvent("pointerup", { pointerId: 17, pointerType: "touch", clientX: 180, clientY: 302 });
  await expect(page.getByText("Membalas Raka Pratama", { exact: true })).toBeVisible();
  await capture(page, info, "send-outcome-unknown");
  await page.getByRole("button", { name: "Coba kirim lagi", exact: true }).click();
  await expect(input).toHaveText(/^(Tulis pesan|Write a message)?$/);
  await expect(page.locator("[data-message-id]").filter({ hasText: "@Zyra jelaskan contoh ini." })).toHaveCount(1);
  await capture(page, info, "send-outcome-replayed");
});

test("an uncommitted uncertain reply can be unlocked and discarded after the discussion resolves", async ({ page }, info) => {
  await open(page, "?fail=lost-then-resolved");
  await page.locator('[data-message-id="m2"]').getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Balas", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Tulis pesan" });
  await input.fill("Balasan yang belum tersimpan.");
  await page.getByRole("button", { name: "Kirim balasan", exact: true }).click();
  await expect(page.getByText(/Status pengiriman belum diketahui/)).toBeVisible();
  await expect(input).toBeDisabled();
  await capture(page, info, "resolved-uncertain-reply");
  await page.getByRole("button", { name: "Coba kirim lagi", exact: true }).click();
  await expect(page.getByText("Diskusi sudah selesai. Pemilik pertanyaan atau admin dapat membuka kembali.")).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(input).toHaveText("Balasan yang belum tersimpan.");
  await expect(page.getByRole("button", { name: "Buka kembali", exact: true })).toHaveCount(0);
  const attempts = JSON.parse((await page.locator("main").getAttribute("data-fixture-reply-attempts"))!);
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toBe(attempts[1]);
  await capture(page, info, "resolved-reply-unlocked");
  await page.getByRole("button", { name: "Buang draf", exact: true }).click();
  await expect(input).toHaveCount(0);
  await expect(page.locator("main")).toHaveAttribute("data-fixture-reply-attempts", JSON.stringify(attempts));
  await capture(page, info, "resolved-reply-discarded");
});

for (const locale of ["id", "en"] as const) {
  test(`legacy replay offers inspection and explicit discard in ${locale}`, async ({ page }, info) => {
    const en = locale === "en";
    await open(page, `?locale=${locale}&fail=legacy-replay`);
    const input = page.getByRole("textbox", { name: en ? "Write a message" : "Tulis pesan" });
    await input.fill("@Zyra pending discussion payload");
    await page.locator('input[type="file"]').setInputFiles("public/visual-fixtures/discussion-problem.png");
    await expect(page.getByRole("status", { name: en ? /: Ready/ : /: Siap/ }).first()).toBeVisible();
    await page.getByRole("button", { name: en ? "Send answer" : "Kirim jawaban", exact: true }).click();
    await page.getByRole("button", { name: en ? "Try sending again" : "Coba kirim lagi", exact: true }).click();
    await expect(input).toBeDisabled();
    await expect(input).toHaveText("@Zyra pending discussion payload");
    await expect(page.getByText(en ? /Check it before sending again to avoid a duplicate/ : /Periksa sebelum mengirim ulang agar tidak terkirim dua kali/)).toBeVisible();
    await expect(page.getByRole("alert").locator("p")).toHaveCSS("font-size", "12px");
    const inspect = page.getByRole("link", { name: en ? "Inspect message" : "Periksa pesan" });
    await expect(inspect).toHaveAttribute("href", "/discussions?thread=limit&message=m2");
    await expect(inspect).toHaveAttribute("target", "_blank");
    expect(await expectUnclipped(input)).toBeGreaterThanOrEqual(36);
    await expectUnclipped(inspect);
    await expectUnclipped(page.getByRole("button", { name: en ? "Discard pending draft" : "Buang draf tertunda" }));
    await capture(page, info, `${locale}-legacy-replay-locked`);
    await page.getByRole("button", { name: en ? "Discard pending draft" : "Buang draf tertunda" }).click();
    await expect(input).toBeEnabled();
    await expect(input).toHaveText(/^(Tulis pesan|Write a message)?$/);
    await expect(page.locator("[data-message-id]").filter({ hasText: "pending discussion payload" })).toHaveCount(0);
    await capture(page, info, `${locale}-legacy-replay-discarded`);
  });
}

async function openFixtureForward(page: Page) {
  await page.locator('[data-message-id="m2"]').getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Teruskan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Teruskan pesan" });
  await expect(dialog.locator("[data-forward-preview]")).toBeVisible();
  await dialog.getByRole("option", { name: /Cara membaca domain dari grafik fungsi/ }).click();
  return dialog;
}

test("an uncertain forward survives source remount and temporary session absence", async ({ page }, info) => {
  await open(page, "?role=admin&state=session-forward&fail=lost-forward");
  let dialog = await openFixtureForward(page);
  await dialog.getByRole("button", { name: "Teruskan", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("belum diketahui");
  const first = JSON.parse((await page.locator("main").getAttribute("data-fixture-forward-attempts"))!)[0];
  await capture(page, info, "forward-unknown-before-session-loss");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await capture(page, info, "forward-unknown-dismissed");
  await page.locator('[data-message-id="m2"]').getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Teruskan", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Teruskan pesan" });
  await expect(dialog.getByRole("alert")).toContainText("belum diketahui");
  await page.getByRole("button", { name: "Hide fixture source", includeHidden: true }).evaluate(button => (button as HTMLElement).click());
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Show fixture source" }).click();
  dialog = page.getByRole("dialog", { name: "Teruskan pesan" });
  await expect(dialog.getByRole("alert")).toContainText("belum diketahui");
  await page.getByRole("button", { name: "Expire fixture session", includeHidden: true }).evaluate(button => (button as HTMLElement).click());
  await expect(dialog).toHaveCount(0);
  await capture(page, info, "forward-session-absent");
  await page.getByRole("button", { name: "Resume same account" }).click();
  dialog = page.getByRole("dialog", { name: "Teruskan pesan" });
  await expect(dialog.getByRole("combobox", { name: "Kanal tujuan" })).toContainText("Matematika I");
  await expect(dialog.getByRole("option", { name: /Cara membaca domain dari grafik fungsi/ })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("alert")).toContainText("belum diketahui");
  await capture(page, info, "forward-session-restored");
  await dialog.getByRole("button", { name: "Teruskan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const attempts = JSON.parse((await page.locator("main").getAttribute("data-fixture-forward-attempts"))!);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(first);
  await capture(page, info, "forward-confirmed-after-restore");
});

test("a legacy forward remains inspectable after the same session returns", async ({ page }, info) => {
  await open(page, "?role=admin&state=session-forward&fail=legacy-forward");
  let dialog = await openFixtureForward(page);
  await dialog.getByRole("button", { name: "Teruskan", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("belum diketahui");
  await dialog.getByRole("button", { name: "Teruskan", exact: true }).click();
  await expect(dialog.getByRole("link", { name: "Periksa pesan" })).toBeVisible();
  await page.getByRole("button", { name: "Expire fixture session", includeHidden: true }).evaluate(button => (button as HTMLElement).click());
  await page.getByRole("button", { name: "Resume same account" }).click();
  dialog = page.getByRole("dialog", { name: "Teruskan pesan" });
  await expect(dialog.getByRole("link", { name: "Periksa pesan" })).toHaveAttribute("href", "/discussions?thread=function&message=existing-forward");
  await capture(page, info, "forward-legacy-session-restored");
  await dialog.getByRole("button", { name: "Buang draf tertunda" }).click();
  await expect(dialog).toHaveCount(0);
  const attempts = JSON.parse((await page.locator("main").getAttribute("data-fixture-forward-attempts"))!);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});

test("a different verified account purges an in-flight forward even when its old callback resolves", async ({ page }, info) => {
  await open(page, "?role=admin&state=session-forward&fail=delay-forward");
  const dialog = await openFixtureForward(page);
  await dialog.getByRole("button", { name: "Teruskan", exact: true }).click();
  await expect.poll(async () => JSON.parse((await page.locator("main").getAttribute("data-fixture-forward-attempts"))!).length).toBe(1);
  await page.getByRole("button", { name: "Switch fixture account", includeHidden: true }).evaluate(button => (button as HTMLElement).click());
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Finish fixture forward" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Sesi berubah");
  await capture(page, info, "forward-different-account-purged");
  await page.getByRole("button", { name: "Resume same account" }).click();
  await expect(dialog).toHaveCount(0);
});

test("legacy replay preserves a new question until discard", async ({ page }, info) => {
  await open(page, "?fail=legacy-replay&question=none");
  await page.getByRole("button", { name: "Pertanyaan baru", exact: true }).click();
  const composeHeader = page.locator("[data-discussion-new-question]");
  const editor = page.getByRole("textbox", { name: "Tulis pesan" });
  await editor.fill("Isi pertanyaan tertunda");
  await page.getByRole("button", { name: "Kirim pertanyaan" }).click();
  await page.getByRole("button", { name: "Coba kirim lagi" }).click();
  await expect(composeHeader.getByRole("combobox", { name: "Kanal" })).toBeDisabled();
  await expect(editor).toHaveText("Isi pertanyaan tertunda");
  await expect(page.getByRole("link", { name: "Periksa pesan" })).toHaveAttribute("href", "/discussions?thread=limit&message=m1");
  await expect(page.locator("section").getByRole("alert").locator("p")).toHaveCSS("font-size", "12px");
  await capture(page, info, "new-question-legacy-replay");
  await page.getByRole("button", { name: "Buang draf tertunda" }).click();
  await expect(editor).toHaveText(/^(Tulis pesan)?$/);
  await expect(composeHeader.getByRole("combobox", { name: "Kanal" })).toBeEnabled();
});

test("lost new-question response locks its channel and body for unchanged replay", async ({ page }, info) => {
  await open(page, "?fail=lost-response&question=none");
  await page.getByRole("button", { name: "Pertanyaan baru", exact: true }).click();
  const composeHeader = page.locator("[data-discussion-new-question]");
  const editor = page.getByRole("textbox", { name: "Tulis pesan" });
  await editor.fill("Pertanyaan yang tersimpan. @Zyra bantu jelaskan.");
  await page.getByRole("button", { name: "Kirim pertanyaan" }).click();
  await expect(page.getByText(/Status pengiriman belum diketahui/)).toBeVisible();
  await expect(composeHeader.getByRole("combobox", { name: "Kanal" })).toBeDisabled();
  await expect(editor).toBeDisabled();
  await capture(page, info, "new-question-outcome-unknown");
  await page.getByRole("button", { name: "Coba kirim lagi" }).click();
  await expect(composeHeader).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Pertanyaan yang tersimpan." })).toBeVisible();
  await expect(page.locator("[data-message-id]").filter({ hasText: "@Zyra bantu jelaskan." })).toHaveCount(1);
  await capture(page, info, "new-question-outcome-replayed");
});

test("expired attachment retains its bytes for re-upload", async ({ page }, info) => {
  await open(page, "?fail=expired-send");
  const input = page.getByRole("textbox", { name: "Tulis pesan" });
  await input.fill("Mohon periksa gambar ini.");
  await page.locator('input[type="file"]').setInputFiles("public/visual-fixtures/discussion-problem.png");
  await expect(page.getByRole("status", { name: /: Siap/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Gambar kedaluwarsa. Unggah lagi." })).toBeVisible();
  await expect(page.getByText("Gambar kedaluwarsa. Unggah ulang gambar, lalu kirim lagi.", { exact: true })).toHaveCount(0);
  await expect(input).toHaveText("Mohon periksa gambar ini.");
  await capture(page, info, "attachment-expired-retry");
  await page.getByRole("button", { name: "Coba unggah discussion-problem.png lagi" }).click();
  await expect(page.getByRole("status", { name: /: Siap/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Coba kirim lagi", exact: true }).click();
  await expect(page.locator("[data-message-id]").filter({ hasText: "Mohon periksa gambar ini." })).toHaveCount(1);
  await capture(page, info, "attachment-expired-resent");
});

test("resolved send keeps the draft and image until the question is reopened", async ({ page }, info) => {
  await open(page, "?fail=resolved-send");
  const input = page.getByRole("textbox", { name: "Tulis pesan" });
  await input.fill("Jawaban ini masih ingin saya kirim.");
  await page.locator('input[type="file"]').setInputFiles("public/visual-fixtures/discussion-problem.png");
  await expect(page.getByRole("status", { name: /: Siap/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
  await expect(input).toHaveText("Jawaban ini masih ingin saya kirim.");
  await expect(page.getByText("Diskusi sudah selesai. Pemilik pertanyaan atau admin dapat membuka kembali.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hapus discussion-problem.png" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coba kirim lagi", exact: true })).toBeDisabled();
  await capture(page, info, "resolved-send-preserved-draft");
  await page.getByRole("button", { name: "Buka kembali", exact: true }).click();
  await expect(input).toHaveText("Jawaban ini masih ingin saya kirim.");
  await expect(page.getByRole("button", { name: "Coba kirim lagi", exact: true })).toBeEnabled();
  await expect(page.getByText("Diskusi sudah selesai. Pemilik pertanyaan atau admin dapat membuka kembali.")).toHaveCount(0);
  await capture(page, info, "resolved-send-reopened");
  await page.getByRole("button", { name: "Coba kirim lagi", exact: true }).click();
  await expect(input).toHaveText(/^(Tulis pesan|Write a message)?$/);
});

test("image dimension failure explains recovery and keeps the draft", async ({ page }, info) => {
  await open(page, "?fail=upload-pixels");
  const input = page.getByRole("textbox", { name: "Tulis pesan" });
  await input.fill("Draf tetap tersedia saat gambar gagal.");
  await page.locator('input[type="file"]').setInputFiles("public/visual-fixtures/discussion-problem.png");
  await expect(page.getByText(/Perkecil gambar hingga maksimal 4096 piksel per sisi dan 16 juta piksel/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Hapus discussion-problem.png" })).toBeVisible();
  await capture(page, info, "image-dimensions-recovery");
  await page.getByRole("button", { name: "Coba unggah discussion-problem.png lagi" }).click();
  await expect(page.getByRole("status", { name: /: Siap/ }).first()).toBeVisible();
  await expect(input).toHaveText("Draf tetap tersedia saat gambar gagal.");
  await capture(page, info, "image-dimensions-retry-success");
  await page.getByRole("button", { name: "Hapus discussion-problem.png" }).click();
  await expect(input).toHaveText("Draf tetap tersedia saat gambar gagal.");
});

test("reaction forwarding and admin deletion", async ({ page }, info) => {
  await open(page, "?role=admin");
  const message = page.locator('[data-message-id="m2"]');
  await message.getByRole("button", { name: /^Tambah reaksi\. Pesan 2 dari Raka Pratama:/ }).click();
  await page.getByRole("menuitem").first().click();
  await expect(message.getByRole("button", { name: /Reaksi/, pressed: true })).toHaveCount(2);
  await capture(page, info, "message-reaction-selected");
  await message.getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Teruskan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Teruskan pesan" });
  await expect(dialog.locator("[data-forward-preview]")).toBeVisible();
  await dialog.getByRole("option", { name: /Cara membaca domain dari grafik fungsi/ }).click();
  await capture(page, info, "forward-message-dialog");
  await page.getByRole("button", { name: "Teruskan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await message.getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Hapus", exact: true }).click();
  await capture(page, info, "admin-delete-message");
  await page.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(message).toHaveCount(0);
});

test("scoped swipe reply and long press actions", async ({ page }, info) => {
  await open(page);
  const message = page.locator('[data-message-id="m2"]');
  await message.scrollIntoViewIfNeeded();
  await message.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "touch", clientX: 100, clientY: 300 });
  await message.dispatchEvent("pointermove", { pointerId: 7, pointerType: "touch", clientX: 180, clientY: 302 });
  await message.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch", clientX: 180, clientY: 302 });
  await expect(page.getByText("Membalas Raka Pratama", { exact: true })).toBeVisible();
  await capture(page, info, "swipe-reply-context");
  await page.getByRole("button", { name: "Batalkan balasan", exact: true }).click();
  await message.dispatchEvent("pointerdown", { pointerId: 8, pointerType: "touch", clientX: 100, clientY: 300 });
  await expect(page.getByRole("menuitem", { name: "Balas", exact: true })).toBeVisible();
  await message.dispatchEvent("pointerup", { pointerId: 8, pointerType: "touch", clientX: 100, clientY: 300 });
  await capture(page, info, "long-press-actions");
});

test("resolved discussion disables composer", async ({ page }, info) => {
  await open(page, "?question=motion");
  await expect(page.getByRole("textbox", { name: "Tulis pesan" })).toHaveCount(0);
  await capture(page, info, "resolved-thread");
});

test("new inline question formatting and validation", async ({ page }, info) => {
  await open(page, "?question=none");
  await page.getByRole("button", { name: "Pertanyaan baru", exact: true }).click();
  await expect(page.locator("[data-discussion-new-question]")).toBeVisible();
  await expect(page.locator("[data-discussion-composer]")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await capture(page, info, "new-question-inline");
});

test("channel and forward pickers paginate cleanly", async ({ page }, info) => {
  await open(page, "?state=pagination&question=none");
  await page.getByRole("combobox", { name: "Filter kanal", exact: true }).click();
  const picker = page.locator('[data-slot="popover-content"]');
  await expectMenuGutter(page, picker);
  await expect(picker.getByRole("button", { name: "Berikutnya", exact: true })).toBeEnabled();
  await capture(page, info, "channel-picker-first-page");
  await picker.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(picker.getByText("Halaman 2", { exact: true })).toBeVisible();
  await expect(picker.getByRole("option", { name: "Kelas tambahan 18", exact: true })).toBeVisible();
  await capture(page, info, "channel-picker-next-page");
  await page.keyboard.press("Escape");
  await open(page, "?state=pagination");
  await page.locator('[data-message-id="m2"]').getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Teruskan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Teruskan pesan", exact: true });
  await expect(dialog.getByRole("button", { name: "Berikutnya", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(dialog.getByText("Halaman 2", { exact: true })).toBeVisible();
  await dialog.getByRole("option", { name: /Pertanyaan tambahan 25/ }).click();
  await capture(page, info, "forward-picker-next-page");
});

test("new question mention search follows its channel", async ({ page }, info) => {
  await open(page, "?state=course&question=none");
  await page.getByRole("button", { name: "Pertanyaan baru", exact: true }).click();
  const composeHeader = page.locator("[data-discussion-new-question]");
  await page.getByRole("button", { name: "Sebut orang", exact: true }).click();
  await expectMenuGutter(page, page.locator('[data-slot="popover-content"]'));
  await page.getByRole("textbox", { name: "Cari orang untuk disebut", exact: true }).fill("Raka");
  await expect(page.getByRole("button", { name: "Raka Pratama, Tutor", exact: true })).toBeVisible();
  await capture(page, info, "mention-search-results");
  await page.getByRole("button", { name: "Raka Pratama, Tutor", exact: true }).click();
  await page.getByRole("textbox", { name: "Tulis pesan", exact: true }).fill("Tautan materi tidak terbuka. Tolong periksa tautan materi.");
  await page.getByRole("button", { name: "Kirim pertanyaan", exact: true }).click();
  await expect(composeHeader).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tautan materi tidak terbuka.", exact: true })).toBeVisible();
  await capture(page, info, "new-question-created");
});

test("same-name mentions keep only the person still present in the draft", async ({ page }, info) => {
  await open(page, "?state=same-name");
  const input = page.getByRole("textbox", { name: "Tulis pesan" });
  await page.getByRole("button", { name: "Sebut orang", exact: true }).click();
  await page.getByRole("textbox", { name: "Cari orang untuk disebut" }).fill("Alice");
  await expect(page.getByRole("button", { name: "Alice, Murid, Saya belajar limit.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Alice, Murid, Saya belajar limit.", exact: true }).click();
  await page.getByRole("button", { name: "Sebut orang", exact: true }).click();
  await page.getByRole("button", { name: "Alice, Murid, Saya belajar integral.", exact: true }).click();
  await expect(input).toHaveText(/@Alice\s+@Alice_2/);
  await capture(page, info, "same-name-mentions");
  await input.fill("@Alice_2 dapat membantu?");
  await capture(page, info, "same-name-one-removed");
  await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
  await expect(page.locator("main[data-fixture-mention-ids]")).toHaveAttribute("data-fixture-mention-ids", "alice-2");
});

test("new question identifies the global and course audiences", async ({ page }, info) => {
  await open(page, "?question=none");
  await page.getByRole("button", { name: "Pertanyaan baru", exact: true }).click();
  const composeHeader = page.locator("[data-discussion-new-question]");
  await expectHelpText(page, "Terlihat oleh murid, tutor, dan admin aktif.");
  await capture(page, info, "new-global-audience");
  await composeHeader.getByRole("combobox", { name: "Kanal" }).click();
  await page.getByRole("option", { name: "Matematika I", exact: true }).click();
  await expectHelpText(page, "Terlihat oleh murid dengan akses penuh, tutor pengampu, dan admin yang berwenang.");
  await capture(page, info, "new-course-audience");
});

test("tutor thread and admin report resolution", async ({ page }, info) => {
  await open(page, "?role=tutor");
  await capture(page, info, "tutor-course-thread");
  await open(page, "?role=admin");
  await page.getByRole("tab", { name: /Laporan/ }).click();
  await capture(page, info, "admin-pending-reports");
  await expect(page.getByRole("columnheader")).toHaveCount(5);
  await page.getByRole("button", { name: "Bagaimana membagi waktu latihan menjelang ujian?", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Pesan dilaporkan" })).toContainText("Raka Pratama, pesan 45");
  await expect(page.getByRole("dialog", { name: "Pesan dilaporkan" })).toContainText("Apa strategi yang membantu");
  await capture(page, info, "reported-message-context");
  await page.getByRole("dialog", { name: "Pesan dilaporkan" }).getByRole("button", { name: /Tutup|Close/ }).click();
  await page.getByRole("button", { name: "Selesaikan", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Selesai", exact: true })).toBeVisible();
  await capture(page, info, "admin-report-resolved");
});

test("report opens its discussion and leaves the reports tab", async ({ page }, info) => {
  await open(page, "?role=admin&state=shell");
  await page.getByRole("tab", { name: /Laporan/ }).click();
  await page.getByRole("button", { name: "Bagaimana membagi waktu latihan menjelang ujian?", exact: true }).click();
  await page.getByRole("dialog", { name: "Pesan dilaporkan" }).getByRole("button", { name: "Buka diskusi", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Pertanyaan", exact: true })).toHaveAttribute("data-state", "active");
  await expect(page.getByRole("heading", { name: "Bagaimana membagi waktu latihan menjelang ujian?", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/question=study/);
  await capture(page, info, "report-open-discussion");
  await page.locator('[data-message-id="m5"]').getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Balas", exact: true }).click();
  await page.getByRole("textbox", { name: "Tulis pesan" }).fill("@Zyra bantu jelaskan.");
  await page.locator('input[type="file"]').setInputFiles("public/visual-fixtures/discussion-problem.png");
  await expect(page.getByRole("status", { name: /: Siap/ }).first()).toBeVisible();
  await expectComposerBounds(page);
  await capture(page, info, "admin-report-reply-image-zyra");
});

test("report navigation targets the 45th message on a bounded page", async ({ page }, info) => {
  await open(page, "?role=admin&state=report-target");
  await page.getByRole("tab", { name: /Laporan/ }).click();
  await page.getByRole("button", { name: "Bagaimana membagi waktu latihan menjelang ujian?", exact: true }).click();
  await page.getByRole("dialog", { name: "Pesan dilaporkan" }).getByRole("button", { name: "Buka diskusi", exact: true }).click();
  await expect(page).toHaveURL(/question=study.*message=reported-45/);
  const target = page.locator('[data-message-id="reported-45"]');
  await expect(target).toHaveAttribute("data-discussion-target", "true");
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
  expect(await page.locator("[data-message-id]").count()).toBeLessThanOrEqual(30);
  await expect(page.locator('[data-message-id="reported-1"]')).toHaveCount(0);
  await capture(page, info, "report-target-message-45");
});

test("a deep report target opens the adjacent previous page and returns to the target", async ({ page }, info) => {
  await open(page, "?role=admin&state=report-target-deep");
  await page.getByRole("tab", { name: /Laporan/ }).click();
  await page.getByRole("button", { name: "Bagaimana membagi waktu latihan menjelang ujian?", exact: true }).click();
  await page.getByRole("dialog", { name: "Pesan dilaporkan" }).getByRole("button", { name: "Buka diskusi", exact: true }).click();
  await expect(page.locator('[data-message-id="reported-450"]')).toHaveAttribute("data-discussion-target", "true");
  await capture(page, info, "report-target-message-450");
  await page.getByRole("button", { name: "Pesan sebelumnya", exact: true }).click();
  await expect(page.locator('[data-message-id="reported-420"]')).toHaveCount(1);
  await expect(page.locator('[data-message-id="reported-449"]')).toHaveCount(1);
  await expect(page.locator('[data-message-id="reported-1"]')).toHaveCount(0);
  await capture(page, info, "report-target-adjacent-previous");
  await page.getByRole("button", { name: "Pesan sebelumnya", exact: true }).click();
  await expect(page.locator('[data-message-id="reported-390"]')).toHaveCount(1);
  await expect(page.locator('[data-message-id="reported-419"]')).toHaveCount(1);
  await capture(page, info, "report-target-second-previous");
  await page.getByRole("button", { name: "Pesan berikutnya", exact: true }).click();
  await page.getByRole("button", { name: "Pesan berikutnya", exact: true }).click();
  await expect(page.locator('[data-message-id="reported-450"]')).toHaveCount(1);
  await expect(page.locator('[data-message-id="reported-450"]')).toBeFocused();
  await expect(page.locator('[data-message-id="reported-450"]')).toBeInViewport();
  await expect(page.locator('[data-message-id="reported-449"]')).toHaveCount(0);
  await capture(page, info, "report-target-returned");
});

test("exhausted read acknowledgement offers an explicit visible-content retry", async ({ page }, info) => {
 await open(page, "?state=read-observation&fail=read-always&locale=en");
 await expect(page.locator("main")).toHaveAttribute("data-fixture-read-attempts", "3", { timeout: 20000 });
 const error = page.getByRole("alert").filter({ hasText: "Read status could not be saved" });
 await expect(error).toBeVisible();
 await expect(page.locator("main")).toHaveAttribute("data-fixture-read-revision", "0");
 await capture(page, info, "read-ack-exhausted-recovery");
 await error.getByRole("button", { name: "Try again", exact: true }).click();
 await expect(page.locator("main")).toHaveAttribute("data-fixture-read-revision", "1", { timeout: 15000 });
 await expect(error).toHaveCount(0);
 await capture(page, info, "read-ack-explicit-retry-success");
});

test("emphasized multiplication keeps mathematical meaning in preview, message and quote", async ({ page }, info) => {
 await open(page, "?question=function");
 await page.getByRole("textbox", { name: "Tulis pesan" }).fill("**$a*b*c$** dan *$x*y*z$*");
 await page.getByRole("button", { name: "Kirim jawaban", exact: true }).focus();
 await expect(page.locator("[data-discussion-composer] .zyra-composer-math")).toHaveCount(2);
 await capture(page, info, "emphasized-multiplication-inline");
 await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
 const message = page.locator('[data-message-id]').last();
 await expect(message.locator(".katex")).toHaveCount(2);
 await capture(page, info, "emphasized-multiplication-message");
 await message.getByRole("button", { name: /Tindakan pesan/ }).click();
 await page.getByRole("menuitem", { name: "Balas", exact: true }).click();
 await expect(page.locator('[data-discussion-reply-target] .katex')).toHaveCount(2);
 await capture(page, info, "emphasized-multiplication-quote");
});

test("tutor combined reply image and Zyra controls remain visible", async ({ page }, info) => {
 await open(page, "?role=tutor&question=function&state=shell");
 await page.locator('[data-message-id="m4"]').getByRole("button", { name: /Tindakan pesan/ }).click();
 await page.getByRole("menuitem", { name: "Balas", exact: true }).click();
 await page.getByRole("textbox", { name: "Tulis pesan" }).fill("@Zyra periksa langkah ini.");
 await page.locator('input[type="file"]').setInputFiles("public/visual-fixtures/discussion-problem.png");
 await expect(page.getByRole("status", { name: /: Siap/ }).first()).toBeVisible();
 await expectComposerBounds(page);
 await capture(page, info, "tutor-reply-image-zyra-combined");
});

test("long report metadata wraps inside the details dialog", async ({ page }, info) => {
  await open(page, "?role=admin&state=long-text");
  await page.getByRole("tab", { name: /Laporan/ }).click();
  await page.getByRole("button", { name: "Question".repeat(20), exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Pesan dilaporkan" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await capture(page, info, "long-report-metadata");
});

test("long forwarding titles wrap within the select gutter", async ({ page }, info) => {
  await open(page, "?state=long-text");
  await page.locator('[data-message-id="m2"]').getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Teruskan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Teruskan pesan", exact: true });
  await expect(dialog.getByRole("listbox", { name: "Pertanyaan tujuan" })).toBeVisible();
  await capture(page, info, "long-forwarding-title");
  await dialog.getByRole("option", { name: new RegExp("Question".repeat(20)) }).click();
  await expect(dialog.getByRole("option", { name: new RegExp("Question".repeat(20)) })).toHaveAttribute("aria-selected", "true");
  await capture(page, info, "long-forwarding-selected");
});

test("admin discussion keeps the combined composer in the viewport", async ({ page }, info) => {
  await open(page, "?role=admin&question=study&state=shell");
  await page.locator('[data-message-id="m5"]').getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Balas", exact: true }).click();
  await page.getByRole("textbox", { name: "Tulis pesan" }).fill("@Zyra bantu jelaskan.");
  await page.locator('input[type="file"]').setInputFiles("public/visual-fixtures/discussion-problem.png");
  await expect(page.getByRole("status", { name: /: Siap/ }).first()).toBeVisible();
  await expectComposerBounds(page);
  await capture(page, info, "admin-reply-image-zyra");
});

for (const state of ["empty", "list-loading", "list-error", "thread-loading", "thread-error"] as const) {
  test(`discussion ${state}`, async ({ page }, info) => {
    await open(page, `?state=${state}${state.startsWith("list") ? "&question=none" : ""}`);
    await capture(page, info, state);
  });
}

test("discussion container breakpoint", async ({ page }, info) => {
  await page.setViewportSize({ width: 900, height: 864 });
  await open(page);
  await expect(page.getByRole("complementary", { name: "Daftar pertanyaan" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Isi diskusi" })).toBeVisible();
  await capture(page, info, "container-breakpoint-900");
  await page.locator('[data-message-id="m2"]').getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Balas", exact: true }).click();
  await page.getByRole("textbox", { name: "Tulis pesan" }).fill("@Zyra bantu jelaskan.");
  await page.locator('input[type="file"]').setInputFiles("public/visual-fixtures/discussion-problem.png");
  await expect(page.getByRole("status", { name: /: Siap/ }).first()).toBeVisible();
  await expectComposerBounds(page);
  await capture(page, info, "container-breakpoint-900-combined");
});

test("edit conflict preserves the draft and offers a new revision", async ({ page }, info) => {
  await open(page, "?role=admin&fail=edit-conflict");
  await page.locator('[data-message-id="m2"]').getByRole("button", { name: /Tindakan pesan/ }).click();
  await page.getByRole("menuitem", { name: "Ubah", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ubah pesan" });
  await dialog.getByRole("textbox", { name: "Isi pesan" }).fill("Draf saya tetap tersimpan.");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toContainText("Versi terbaru dari admin.");
  await expect(dialog.getByRole("textbox", { name: "Isi pesan" })).toHaveValue("Draf saya tetap tersimpan.");
  await expect(dialog.getByRole("button", { name: "Simpan", exact: true })).toBeDisabled();
  await capture(page, info, "edit-conflict-preserved-draft");
  await dialog.getByRole("button", { name: "Pertahankan draf", exact: true }).click();
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-message-id="m2"]')).toContainText("Draf saya tetap tersimpan.");
});

for (const state of ["reports-loading", "reports-error"] as const) {
  test(`discussion ${state}`, async ({ page }, info) => {
    await open(page, `?role=admin&state=${state}`);
    await page.getByRole("tab", { name: /Laporan/ }).click();
    await expect(page.getByText("Belum ada laporan", { exact: true })).toHaveCount(0);
    await capture(page, info, state);
  });
}

test("English student thread and inline new question", async ({ page }, info) => {
  await open(page, "?locale=en&question=none");
  await page.getByRole("combobox", { name: "Filter channels" }).click();
  await page.getByRole("textbox", { name: "Search channels" }).fill("General");
  await expect(page.getByRole("option", { name: "General", exact: true })).toBeVisible();
  await capture(page, info, "en-channel-search");
  await open(page, "?locale=en");
  await expect(page.getByRole("textbox", { name: "Write a message" })).toBeVisible();
  await expect(page.locator('[data-message-id="m1"]')).toContainText("Saat");
  const author = page.locator('[data-message-id="m1"]').getByText("Nadia Putri", { exact: true });
  const action = page.locator('[data-message-id="m1"]').getByRole("button", { name: /^Actions for message 1 from Nadia Putri:/ });
  const authorBox = await author.boundingBox(), actionBox = await action.boundingBox();
  expect(Math.abs(authorBox!.y - actionBox!.y)).toBeLessThan(5);
  await capture(page, info, "en-student-thread");
  await open(page, "?locale=en&state=course&question=none");
  await page.getByRole("button", { name: "New question", exact: true }).click();
  await expect(page.locator("[data-discussion-new-question]")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectHelpText(page, "Visible to students with full access, assigned tutors, and authorized admins.", "en");
  await capture(page, info, "en-new-question");
  await page.getByRole("textbox", { name: "Write a message" }).fill("Access to my course. Please help with access.");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("heading", { name: "Access to my course." })).toBeVisible();
  await capture(page, info, "en-new-question-created");
});

test("English resolved and image recovery preserve the draft", async ({ page }, info) => {
  await open(page, "?locale=en&fail=resolved-send");
  let input = page.getByRole("textbox", { name: "Write a message" });
  await input.fill("My answer remains here.");
  await page.getByRole("button", { name: "Send answer", exact: true }).click();
  await expect(input).toHaveText("My answer remains here.");
  await expect(page.getByText(/The question owner or an admin can reopen it/)).toBeVisible();
  await capture(page, info, "en-resolved-draft");
  await page.getByRole("button", { name: "Reopen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Try sending again" })).toBeEnabled();
  await expect(page.getByText(/The question owner or an admin can reopen it/)).toHaveCount(0);
  await capture(page, info, "en-resolved-reopened");
  await open(page, "?locale=en&fail=upload-pixels");
  input = page.getByRole("textbox", { name: "Write a message" });
  await input.fill("Keep this draft.");
  await page.locator('input[type="file"]').setInputFiles("public/visual-fixtures/discussion-problem.png");
  await expect(page.getByText(/4096 pixels per side and 16 million pixels/)).toBeVisible();
  await capture(page, info, "en-image-recovery");
  await page.getByRole("button", { name: "Retry uploading discussion-problem.png", exact: true }).click();
  await expect(input).toHaveText("Keep this draft.");
  await expect(page.getByRole("status", { name: /: Ready/ }).first()).toBeVisible();
  await capture(page, info, "en-image-retried");
});

test("English report navigation and forwarding dialog", async ({ page }, info) => {
  await open(page, "?locale=en&role=admin");
  await page.getByRole("tab", { name: /Reports/ }).click();
  await capture(page, info, "en-admin-reports");
  await page.getByRole("button", { name: "Bagaimana membagi waktu latihan menjelang ujian?", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Reported message" })).toContainText("Perlu ditinjau oleh tim.");
  await capture(page, info, "en-report-details");
  await page.getByRole("dialog", { name: "Reported message" }).getByRole("button", { name: "Open discussion" }).click();
  await expect(page.getByRole("tab", { name: "Questions", exact: true })).toHaveAttribute("data-state", "active");
  await capture(page, info, "en-report-open-discussion");
  await open(page, "?locale=en&role=admin&state=pagination");
  await page.locator('[data-message-id="m2"]').getByRole("button", { name: /Actions for/ }).click();
  const menu = page.getByRole("menu");
  await expectMenuGutter(page, menu);
  await page.getByRole("menuitem", { name: "Forward", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Forward message", exact: true });
  await expect(dialog.getByRole("option", { name: /Pertanyaan selesai/ })).toHaveCount(0);
  await capture(page, info, "en-forward-open-questions");
});

test("English mentions retain only the remaining same-name person", async ({ page }, info) => {
  await open(page, "?locale=en&state=same-name");
  const input = page.getByRole("textbox", { name: "Write a message" });
  await page.getByRole("button", { name: "Mention someone", exact: true }).click();
  await page.getByRole("textbox", { name: "Search people to mention" }).fill("Alice");
  await expect(page.getByRole("button", { name: "Alice, Student, Saya belajar limit.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Alice, Student, Saya belajar limit.", exact: true }).click();
  await page.getByRole("button", { name: "Mention someone", exact: true }).click();
  await page.getByRole("button", { name: "Alice, Student, Saya belajar integral.", exact: true }).click();
  await expect(input).toHaveText(/@Alice\s+@Alice_2/);
  await input.fill("@Alice_2 can help?");
  await capture(page, info, "en-same-name-one-removed");
  await page.getByRole("button", { name: "Send answer", exact: true }).click();
  await expect(page.locator("main[data-fixture-mention-ids]")).toHaveAttribute("data-fixture-mention-ids", "alice-2");
});

test("server namesake metadata shows context and blocks ambiguous candidates across pages", async ({ page }, info) => {
  await open(page, "?state=namesake-metadata");
  await page.getByRole("button", { name: "Sebut orang", exact: true }).click();
  await page.getByRole("textbox", { name: "Cari orang untuk disebut" }).fill("Alice");
  const candidate = page.getByRole("button", { name: "Alice, Murid, Saya belajar limit., Nama dan konteks belum cukup untuk membedakan orang ini", exact: true });
  await expect(candidate).toBeDisabled();
  await capture(page, info, "server-namesake-ambiguous");
});

test("overflow ambiguity still recommends a narrower search", async ({ page }, info) => {
  await open(page, "?state=mention-overflow");
  await page.getByRole("button", { name: "Sebut orang", exact: true }).click();
  await page.getByRole("textbox", { name: "Cari orang untuk disebut" }).fill("Alice");
  await expect(page.getByRole("button", { name: /Persempit pencarian untuk memastikan orangnya/ })).toBeDisabled();
  await capture(page, info, "mention-overflow-narrow-search");
});

test("English namesake ambiguity explains that identity is unavailable", async ({ page }, info) => {
  await open(page, "?locale=en&state=namesake-metadata");
  await page.getByRole("button", { name: "Mention someone", exact: true }).click();
  await page.getByRole("textbox", { name: "Search people to mention" }).fill("Alice");
  await expect(page.getByRole("button", { name: /The name and context are not enough to identify this person/ })).toBeDisabled();
  await capture(page, info, "en-server-namesake-unavailable");
});

for (const locale of ["id", "en"] as const) {
  test(`legacy forward keeps its target and offers inspection in ${locale}`, async ({ page }, info) => {
    const en = locale === "en";
    await open(page, `?locale=${locale}&role=admin&fail=legacy-forward`);
    await page.locator('[data-message-id="m2"]').getByRole("button", { name: en ? /Actions for/ : /Tindakan pesan/ }).click();
    await page.getByRole("menuitem", { name: en ? "Forward" : "Teruskan", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: en ? "Forward message" : "Teruskan pesan" });
    await dialog.getByRole("option", { name: /Cara membaca domain dari grafik fungsi/ }).click();
    await dialog.getByRole("button", { name: en ? "Forward" : "Teruskan", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(en ? "unknown" : "belum diketahui");
    await expect(dialog.getByRole("combobox", { name: en ? "Destination channel" : "Kanal tujuan" })).toBeDisabled();
    await capture(page, info, `${locale}-forward-outcome-unknown`);
    await dialog.getByRole("button", { name: en ? "Forward" : "Teruskan", exact: true }).click();
    await expect(dialog.getByRole("link", { name: en ? "Inspect message" : "Periksa pesan" })).toHaveAttribute("href", "/discussions?thread=function&message=existing-forward");
    await expect(dialog.getByRole("button", { name: en ? "Forward" : "Teruskan", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("alert").locator("p")).toHaveCSS("font-size", "12px");
    await capture(page, info, `${locale}-forward-legacy-inspection`);
    await dialog.getByRole("button", { name: en ? "Discard pending draft" : "Buang draf tertunda" }).click();
    await expect(dialog).toHaveCount(0);
    await capture(page, info, `${locale}-forward-legacy-discarded`);
  });
}


for (const scenario of [
  { name: "id global", query: "?locale=id&question=study", locale: "id", audience: "Terlihat oleh murid, tutor, dan admin aktif.", policy: "Kanal ini memakai Free untuk akun murid: teks saja." },
  { name: "en course", query: "?locale=en&question=function", locale: "en", audience: "Visible to students with full access, assigned tutors, and authorized admins.", policy: "Free: text only. Image-enabled plans allow up to 4 images, prioritizing this message." },
  { name: "id new question", query: "?locale=id&state=course&question=none", locale: "id", audience: "Terlihat oleh murid dengan akses penuh, tutor pengampu, dan admin yang berwenang.", policy: "Free: teks saja. Jika paket mendukung gambar, maksimal 4; gambar pesan ini diutamakan.", modal: true },
  { name: "en new question", query: "?locale=en&question=none", locale: "en", audience: "Visible to active students, tutors, and admins.", policy: "This channel uses Free for student accounts: text only.", modal: true },
] as const) {
  test(`compact discussion help ${scenario.name}`, async ({ page }, info) => {
    await open(page, scenario.query);
    const en = scenario.locale === "en";
    if ("modal" in scenario) await page.getByRole("button", { name: en ? "New question" : "Pertanyaan baru", exact: true }).click();
    const name = en ? "Discussion help" : "Bantuan diskusi";
    const helpButton = page.getByRole("button", { name, exact: true });
    await expect(helpButton).toHaveCount(1);
    const editor = page.getByRole("textbox", { name: en ? "Write a message" : "Tulis pesan" });
    const before = await editor.boundingBox();
    await capture(page, info, "help-closed");
    await helpButton.focus();
    await page.keyboard.press("Enter");
    const help = page.getByRole("dialog", { name, exact: true });
    await expect(help.getByText(scenario.audience, { exact: true })).toBeVisible();
    await expect(help.getByText(scenario.policy, { exact: true })).toBeVisible();
    await expect(help.getByText(en ? /up to 5 earlier messages/ : /hingga 5 pesan sebelumnya/)).toBeVisible();
    await expect(help.getByText(en ? "Uses 1 allowance turn." : "Memakai 1 giliran kuota.")).toBeVisible();
    await expectMenuGutter(page, help);
    await capture(page, info, "help-open");
    await page.keyboard.press("Escape");
    await expect(helpButton).toBeFocused();
    await expect(page.getByText(scenario.audience, { exact: true })).toHaveCount(0);
    await editor.fill("@Zyra");
    expect((await editor.boundingBox())!.height).toBe(before!.height);
    await expect(page.getByText(scenario.policy, { exact: true })).toHaveCount(0);
    await capture(page, info, "help-closed-zyra");
  });
}

test("compact discussion status sections and resolved pages", async ({ page }, info) => {
  await open(page, "?state=pagination&question=none");
  const openRow = page.locator('[data-question-status="open"]').filter({ hasText: "Cara membaca domain" });
  const answered = page.locator('[data-question-status="answered"]').filter({ hasText: "Mengapa limit" });
  await expect(openRow).toBeVisible();
  await expect(answered).toBeVisible();
  expect(await openRow.locator("span.font-heading").evaluate(el => getComputedStyle(el).color)).not.toBe(await answered.locator("span.font-heading").evaluate(el => getComputedStyle(el).color));
  const toggle = page.getByRole("button", { name: "Selesai", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[data-question-status="resolved"]')).toHaveCount(0);
  await capture(page, info, "resolved-collapsed");
  await toggle.click();
  await expect(page.locator('[data-question-status="resolved"]')).toHaveCount(20);
  const asideBox = (await page.getByRole("complementary", { name: "Daftar pertanyaan" }).boundingBox())!;
  const resolvedBox = (await page.locator("[data-discussion-resolved]").boundingBox())!;
  expect(resolvedBox.y + resolvedBox.height).toBeCloseTo(asideBox.y + asideBox.height, 0);
  expect(resolvedBox.height).toBeLessThanOrEqual(asideBox.height * 0.5 + 1);
  await page.locator('[data-question-status="resolved"]').first().scrollIntoViewIfNeeded();
  await capture(page, info, "resolved-first-page");
  await page.getByRole("button", { name: "Muat pertanyaan lainnya", exact: true }).last().click();
  await expect(page.locator('[data-question-status="resolved"]')).toHaveCount(16);
  await capture(page, info, "resolved-next-page");
  await page.getByRole("button", { name: "Cari pertanyaan", exact: true }).click();
  await page.getByRole("textbox", { name: "Cari pertanyaan" }).fill("Pertanyaan selesai 35");
  await expect(page.locator('[data-question-status="resolved"]')).toHaveCount(1);
  await capture(page, info, "resolved-search");
});

test("own vs other chat bubbles and clickable author profile dialog", async ({ page }, info) => {
  await open(page);
  await expect(page.locator('[data-message-id="m1"]')).toHaveAttribute("data-own-message", "true");
  await expect(page.locator('[data-message-id="m2"]')).not.toHaveAttribute("data-own-message", "true");
  await page.getByRole("button", { name: "Lihat profil Raka Pratama", exact: true }).first().click();
  const staffDialog = page.getByRole("dialog", { name: "Profil pengguna", exact: true });
  await expect(staffDialog).toContainText("Raka Pratama");
  await expect(staffDialog).toContainText("Anggota tim Zyx");
  await capture(page, info, "discussion-author-profile-staff");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Lihat profil Nadia Putri", exact: true }).first().click();
  const studentDialog = page.getByRole("dialog", { name: "Profil siswa", exact: true });
  await expect(studentDialog).toContainText("Nadia Putri");
  await expect(studentDialog).toContainText("Matematika");
  await capture(page, info, "discussion-author-profile-student");
});

test("compact discussion status resolution, reopening and deep link", async ({ page }, info) => {
  await open(page, "?question=function");
  await page.getByRole("button", { name: "Selesaikan", exact: true }).click();
  await expect(page.locator("[data-discussion-status]")).toHaveAccessibleDescription("Selesai");
  await capture(page, info, "resolved-selected");
  if (page.viewportSize()!.width < 900) await page.getByRole("button", { name: "Kembali ke pertanyaan" }).click();
  await page.getByRole("button", { name: "Selesai", exact: true }).click();
  const moved = page.locator('[data-question-status="resolved"]').filter({ hasText: "Cara membaca domain" });
  await expect(moved).toBeVisible();
  await moved.click();
  await page.getByRole("button", { name: "Buka kembali", exact: true }).click();
  await expect(page.locator("[data-discussion-status]")).toHaveAccessibleDescription("Terbuka");
  if (page.viewportSize()!.width < 900) await page.getByRole("button", { name: "Kembali ke pertanyaan" }).click();
  await expect(page.locator('[data-question-status="open"]').filter({ hasText: "Cara membaca domain" })).toBeVisible();
  await open(page, "?question=motion");
  await expect(page.locator("[data-discussion-status]")).toHaveAccessibleDescription("Selesai");
  await capture(page, info, "resolved-deep-link");
});

test("question metadata separates channel and answer count", async ({ page }, info) => {
  await open(page, "?question=none");
  const sidebar = page.getByRole("complementary", { name: "Daftar pertanyaan" });
  const newQuestion = page.getByRole("button", { name: "Pertanyaan baru", exact: true });
  const searchTrigger = sidebar.getByRole("button", { name: "Cari pertanyaan", exact: true });
  const channelFilter = sidebar.getByRole("combobox", { name: "Filter kanal" });
  const answeredCount = await page.locator('[data-question-status="answered"]').count();
  await expect(sidebar.getByRole("heading", { name: "Pertanyaan", exact: true })).toHaveCount(0);
  await expect(channelFilter).toBeVisible();
  await expect(searchTrigger).toBeVisible();
  await expect(newQuestion).toHaveCount(1);
  await expect(newQuestion).toHaveText("");
  await expect(newQuestion.locator("svg.lucide-square-pen")).toHaveCount(1);
  for (const [title, count] of [["Cara membaca domain", 0], ["Mengapa limit", 1]] as const) {
    const row = page.locator("[data-question-status]").filter({ hasText: title });
    const metadata = row.locator("[data-question-metadata]");
    await expect(row).toHaveAccessibleName(new RegExp(`${count} jawaban`));
    const layout = await metadata.evaluate(element => {
      const [channel, details] = Array.from(element.children);
      const left = channel.getBoundingClientRect(), right = details.getBoundingClientRect(), bounds = element.getBoundingClientRect();
      const count = details.querySelector('[aria-hidden="true"] + [aria-hidden="true"]');
      const visibleDetails = details.cloneNode(true) as HTMLElement;
      visibleDetails.querySelectorAll(".sr-only").forEach(node => node.remove());
      return { left: left.x, leftRight: left.right, right: right.x, rightEdge: right.right, boundsLeft: bounds.x, boundsRight: bounds.right,
        icon: details.querySelector("svg") !== null, count: count?.textContent, visible: visibleDetails.textContent };
    });
    expect(layout.left).toBeCloseTo(layout.boundsLeft, 0);
    expect(layout.leftRight).toBeLessThanOrEqual(layout.right);
    expect(layout.rightEdge).toBeCloseTo(layout.boundsRight, 0);
    expect(layout.icon).toBe(true);
    expect(layout.count).toBe(String(count));
    expect(layout.visible).not.toMatch(/jawaban|answers/);
  }
  await capture(page, info, "question-metadata");
  await searchTrigger.click();
  const search = sidebar.getByRole("textbox", { name: "Cari pertanyaan" });
  await expect(search).toBeFocused();
  await expect(channelFilter).toHaveCount(0);
  await expect(newQuestion).toHaveCount(0);
  await capture(page, info, "question-search-expanded");
  await search.fill("Cara membaca domain");
  await expect(page.locator('[data-question-status="open"]')).toHaveCount(1);
  await expect(page.locator('[data-question-status="answered"]')).toHaveCount(0);
  await capture(page, info, "question-search-populated");
  await sidebar.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(searchTrigger).toBeFocused();
  await expect(channelFilter).toBeVisible();
  await expect(newQuestion).toBeVisible();
  await expect(page.locator('[data-question-status="answered"]')).toHaveCount(answeredCount);
  await capture(page, info, "question-search-restored");
  await searchTrigger.click();
  await expect(search).toHaveValue("");
  await search.fill("Cara membaca domain");
  await search.press("Escape");
  await expect(searchTrigger).toBeFocused();
  await expect(page.locator('[data-question-status="answered"]')).toHaveCount(answeredCount);
});

test("compact discussion live composer and four image recovery", async ({ page }, info) => {
  await open(page, "?fail=upload-mixed&question=function");
  const editor = page.getByRole("textbox", { name: "Tulis pesan" });
  await editor.fill("Teks awal");
  await editor.press("Control+A");
  await page.keyboard.insertText("Pengganti");
  await editor.press("Control+z");
  await expect(editor).toHaveText("Teks awal");
  await editor.fill("**Tebal** dan $x^2$ @Zyra");
  await page.getByRole("button", { name: "Bantuan diskusi" }).focus();
  await expect(page.locator(".zyra-composer-bold")).toContainText("Tebal");
  await expect(page.locator(".zyra-composer-math")).toHaveAttribute("aria-label", "x^2");
  const toolbar = page.locator("[data-discussion-toolbar]");
  const send = page.getByRole("button", { name: "Kirim jawaban", exact: true });
  async function expectSendPlacement() {
    await expect(send).toHaveCount(1);
    await expect(send).toHaveText("");
    await expect(send.locator("svg")).toHaveCount(1);
    const toolbarBox = (await toolbar.boundingBox())!, sendBox = (await send.boundingBox())!;
    const editorBox = (await page.locator("[data-editor-disabled]").boundingBox())!;
    expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(editorBox.y);
    expect(sendBox.x).toBeGreaterThanOrEqual(editorBox.x + editorBox.width);
    expect(sendBox.y + sendBox.height / 2).toBeCloseTo(editorBox.y + editorBox.height / 2, 0);
  }
  await expectSendPlacement();
  await page.getByRole("textbox", { name: "Tulis pesan" }).press("Tab");
  await expect(send).toBeFocused();
  await capture(page, info, "composer-nonempty");
  const image = await readFile("public/visual-fixtures/discussion-problem.png");
  await page.locator('input[type="file"]').setInputFiles(["one.png", "two.png", "slow.png", "failed.png"].map(name => ({ name, mimeType: "image/png", buffer: image })));
  await expect(page.getByRole("status", { name: "slow.png: Mengunggah" })).toBeVisible();
  await capture(page, info, "four-images-loading");
  await expect(page.getByRole("status", { name: "failed.png: Unggah gagal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coba unggah failed.png lagi" })).toBeVisible();
  await capture(page, info, "four-images-error");
  await page.getByRole("button", { name: "Coba unggah failed.png lagi" }).click();
  await expect(page.getByRole("status", { name: "failed.png: Siap" })).toBeVisible();
  await expect(page.getByRole("status", { name: "slow.png: Siap" })).toBeVisible();
  const tiles = await page.locator("[data-discussion-images] > div").evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { y: box.y, bottom: box.bottom }; }));
  expect(tiles).toHaveLength(4);
  expect(new Set(tiles.map(tile => Math.round(tile.y))).size).toBe(1);
  expect(Math.max(...tiles.map(tile => tile.bottom))).toBeLessThanOrEqual((await toolbar.boundingBox())!.y);
  await expectSendPlacement();
  await capture(page, info, "four-images-ready");
  await page.getByRole("button", { name: "Hapus one.png" }).click();
  await expect(page.locator("[data-discussion-images] img")).toHaveCount(3);
  await capture(page, info, "image-removed");
  await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
  await expect(page.locator('[data-message-id]').last()).toContainText("Tebal");
  await expect(page.locator('[data-message-id]').last().locator(".katex")).toHaveCount(1);
  await open(page, "?fail=lost-response&question=function");
  const locked = page.getByRole("textbox", { name: "Tulis pesan" });
  await locked.fill("**Draf** $x^2$");
  await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
  await expect(locked).toBeDisabled();
  await expect(page.getByRole("alert").filter({ hasText: "Status pengiriman belum diketahui" })).toBeVisible();
  await capture(page, info, "live-editor-uncertain-lock");
  await page.getByRole("button", { name: "Coba kirim lagi", exact: true }).click();
  await expect(page.locator('[data-message-id]').last().locator(".katex")).toHaveCount(1);
});
