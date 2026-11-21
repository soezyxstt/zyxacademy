import { expect, test } from "@playwright/test";
import { buildFixture } from "./fixtures/interactive-document-build";

const origin = "http://form-upload.invalid";
let fixture: Awaited<ReturnType<typeof buildFixture>>;
test.beforeAll(async () => { fixture = await buildFixture("tests/visual/fixtures/form-upload.tsx"); });

for (const preview of [false, true]) {
  test(`file upload ${preview ? "in builder preview stays local" : "uses the saved form and question"}`, async ({ page }, info) => {
    const errors: string[] = [];
    const uploads: string[] = [];
    let finishUpload: (() => void) | undefined;
    await page.emulateMedia({ reducedMotion: "reduce" });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(response.url()); });
    await page.route(`${origin}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/") return route.fulfill({ contentType: "text/html", body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>' });
      if (path === "/api/forms/fixture-slug") return route.fulfill({ json: { form: {
        id: "fixture-id", slug: "fixture-slug", title: "Pendaftaran tutorial", category: "registration",
        settings: { displayMode: "section" },
        questions: [{ type: "FILE_UPLOAD", title: "Berkas pendukung", maxFileSizeMb: 5, allowedFileTypes: ["application/pdf"] }],
      } } });
      if (path === "/api/forms/upload") {
        uploads.push(route.request().postData() ?? "");
        await new Promise<void>((resolve) => { finishUpload = resolve; });
        return route.fulfill({ json: { success: true, url: "/api/storage/file/forms/fixture-slug/question-1/answer.pdf" } });
      }
      if (path === "/favicon.ico") return route.fulfill({ status: 204 });
      errors.push(path);
      await route.abort();
    });
    await page.goto(preview ? `${origin}/?preview` : origin);
    await page.addStyleTag({ content: fixture.styles });
    await page.addScriptTag({ content: fixture.script });
    const input = page.locator('input[type="file"]');
    await expect(input).toHaveAttribute("accept", ".pdf");
    await input.setInputFiles({ name: "answer.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-fixture") });
    if (!preview) {
      await expect.poll(() => Boolean(finishUpload)).toBe(true);
      expect(uploads[0]).toContain("fixture-id");
      expect(uploads[0]).toMatch(/name="questionNumber"\r\n\r\n1\r\n/);
      await expect(page.getByRole("button", { name: "Kirim tanggapan" })).toBeDisabled();
      await page.screenshot({ path: info.outputPath("form-upload-pending.png"), fullPage: true, animations: "disabled" });
      finishUpload!();
    }
    await expect(page.getByText(preview ? "Berkas dipilih" : "Berkas berhasil diunggah", { exact: true })).toBeVisible();
    const download = page.getByRole("link", { name: "answer.pdf", exact: true });
    await expect(download).toHaveAttribute("href", /^blob:/);
    expect(uploads).toHaveLength(preview ? 0 : 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("form-upload-done.png"), fullPage: true, animations: "disabled" });
    expect(errors).toEqual([]);
  });
}
