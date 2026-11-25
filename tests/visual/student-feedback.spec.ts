import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { buildFixture } from "./fixtures/interactive-document-build";
import { fixtureFontStyles } from "./fixtures/fonts";

let fixture: Awaited<ReturnType<typeof buildFixture>>;
test.beforeAll(async () => {
  fixture = await buildFixture("tests/visual/fixtures/student-feedback.tsx", "", {
    "./actions": `export async function submitStudentFeedbackAction(input) {
      const response = await fetch('/__fixture/feedback', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(input) });
      if (!response.ok) throw new Error('Fixture request failed');
      return response.json();
    }`,
    "@/components/student-experience-provider": `export const useStudentExperience=()=>({ mode: new URLSearchParams(location.search).get('mode') === 'demo' ? 'demo' : 'student' });`,
  });
});

async function openForm(page: Page, theme = "light", query = "") {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.route("https://feedback.fixture.test/**", route => {
    if (new URL(route.request().url()).pathname !== "/") return route.fallback();
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.styles}${fixtureFontStyles()}</style></head><body class="bg-background text-foreground"><div id="root"></div><script>${fixture.script.replace(/<\/script/gi, "<\\/script")}</script></body></html>` });
  });
  const url = `https://feedback.fixture.test/?theme=${theme}${query}`;
  expect((await page.goto(url))?.status()).toBe(200);
  expect(page.url()).toBe(url);
  await expect(page.getByRole("heading", { name: "Masukan mahasiswa" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return failures;
}

async function capture(page: Page, info: TestInfo, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

for (const theme of ["light", "dark"]) {
  test(`feedback validates, sends, retains failed drafts and retries in ${theme} mode`, async ({ page }, info) => {
    const failures = await openForm(page, theme);
    const message = page.getByLabel("Pesan dan saran");
    const send = page.getByRole("button", { name: "Kirim masukan", exact: true });
    let requests = 0;
    let finishRequest: (() => Promise<void>) | undefined;
    const payloads: unknown[] = [];
    await page.route("**/__fixture/feedback", async route => {
      requests += 1;
      payloads.push(route.request().postDataJSON());
      if (requests === 1) {
        finishRequest = async () => route.fulfill({ json: { success: false, message: "Simulated failure" } });
      } else {
        await route.fulfill({ json: { success: true, message: "Saved" } });
      }
    });

    await expect(send).toBeEnabled();
    await capture(page, info, `feedback-idle-${theme}`);
    await send.click();
    await expect(message).toBeFocused();
    await expect(message).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toHaveText("Tulis masukan setidaknya 5 karakter.");
    await capture(page, info, `feedback-validation-${theme}`);
    await message.fill("     ");
    await send.click();
    expect(requests).toBe(0);
    await expect(message).toBeFocused();

    await message.fill("  Tambahkan contoh pada pembahasan limit.  ");
    await page.getByRole("button", { name: "Fitur platform", exact: true }).click();
    await page.getByRole("button", { name: "Beri nilai 4 dari 5 bintang", exact: true }).click();
    await expect(send).toBeEnabled();
    await send.click();
    await expect.poll(() => requests).toBe(1);
    const pending = page.getByRole("button", { name: "Mengirim masukan…", exact: true });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute("aria-busy", "true");
    await page.locator("form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(requests).toBe(1);
    await capture(page, info, `feedback-pending-${theme}`);
    await finishRequest!();
    await expect(page.getByRole("alert")).toHaveText("Masukan tidak dapat dikirim. Coba lagi.");
    await expect(message).toHaveValue("  Tambahkan contoh pada pembahasan limit.  ");
    await expect(send).toBeEnabled();
    await capture(page, info, `feedback-failed-${theme}`);
    expect(payloads[0]).toEqual({ category: "fitur", rating: 4, message: "Tambahkan contoh pada pembahasan limit.", email: "pelajar@example.test" });

    await send.click();
    await expect(page.getByRole("heading", { name: "Masukan berhasil terkirim", exact: true })).toBeVisible();
    expect(requests).toBe(2);
    await capture(page, info, `feedback-sent-${theme}`);
    await page.getByRole("button", { name: "Kirim masukan lainnya" }).click();
    await expect(message).toHaveValue("");
    await expect(send).toBeEnabled();
    expect(failures).toEqual([]);
  });
}

test("feedback keeps browser-restored fields through category and rating changes", async ({ page }) => {
  const failures = await openForm(page);
  let submitted: unknown;
  await page.route("**/__fixture/feedback", async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { success: true, message: "Saved" } });
  });
  await page.getByLabel("Pesan dan saran").evaluate(element => { (element as HTMLTextAreaElement).value = "Draf dari sesi sebelumnya."; });
  await page.getByLabel("Alamat surel (opsional)").evaluate(element => { (element as HTMLInputElement).value = "tindaklanjut@example.test"; });
  await page.getByRole("button", { name: "Fitur platform", exact: true }).click();
  await page.getByRole("button", { name: "Beri nilai 4 dari 5 bintang", exact: true }).click();
  await expect(page.getByLabel("Pesan dan saran")).toHaveValue("Draf dari sesi sebelumnya.");
  await expect(page.getByLabel("Alamat surel (opsional)")).toHaveValue("tindaklanjut@example.test");
  await page.getByRole("button", { name: "Kirim masukan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Masukan berhasil terkirim", exact: true })).toBeVisible();
  expect(submitted).toEqual({ category: "fitur", rating: 4, message: "Draf dari sesi sebelumnya.", email: "tindaklanjut@example.test" });
  await page.getByRole("button", { name: "Kirim masukan lainnya" }).click();
  await expect(page.getByLabel("Pesan dan saran")).toHaveValue("");
  await expect(page.getByLabel("Alamat surel (opsional)")).toHaveValue("tindaklanjut@example.test");
  expect(failures).toEqual([]);
});

test("demo feedback explains sign-in and makes no request", async ({ page }) => {
  const failures = await openForm(page, "light", "&mode=demo");
  let requests = 0;
  await page.route("**/__fixture/feedback", route => { requests += 1; return route.fulfill({ json: { success: true } }); });
  await page.getByLabel("Pesan dan saran").fill("Contoh masukan dari mode demo.");
  await page.getByRole("button", { name: "Kirim masukan", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Masuk untuk mengirim masukan.");
  expect(requests).toBe(0);
  expect(failures).toEqual([]);
});
