import { expect, test, type Page } from "@playwright/test";
import { buildFixture } from "./fixtures/interactive-document-build";

const origin = "http://student-assessment-layout.invalid";
let fixture: Awaited<ReturnType<typeof buildFixture>>;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  fixture = await buildFixture("tests/visual/fixtures/student-assessment-layout.tsx", "", {
    "../daftar/actions": "export async function registerPkaAction() { throw new Error('Registration is outside this fixture'); }",
    "next/image": "import React from 'react'; export default function Image({unoptimized,fill,...props}) { return React.createElement('img',props); }",
  });
});

async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route(`${origin}/**`, (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html lang="id"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div></html>',
  }));
  return errors;
}

async function visit(page: Page, state: string) {
  const response = await page.goto(`${origin}/?state=${state}`);
  expect(response?.status()).toBe(200);
  await page.addStyleTag({ content: fixture.styles });
  await page.addScriptTag({ content: fixture.script });
}

async function capture(page: Page, path: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path, animations: "disabled" });
}

test("quiz gateway and results fit with pending and exhausted attempts", async ({ page }, testInfo) => {
  const errors = await setup(page);
  await visit(page, "resume");
  await expect(page.getByRole("link", { name: "Lanjutkan", exact: true })).toHaveAttribute("href", /attemptId=in-progress$/);
  await expect(page.getByRole("link", { name: "Lihat pembahasan soal" })).toHaveAttribute("href", /attemptId=completed$/);
  await capture(page, testInfo.outputPath("quiz-gateway.png"));

  await visit(page, "exhausted");
  await expect(page.getByText(/Batas percobaan maksimal/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Lanjutkan", exact: true })).toHaveCount(0);
  await capture(page, testInfo.outputPath("quiz-exhausted.png"));

  await visit(page, "results");
  await expect(page.getByText("Menunggu penilaian", { exact: true })).toHaveCount(1);
  await expect(page.getByText("85%", { exact: true })).toBeVisible();
  await capture(page, testInfo.outputPath("results.png"));

  await visit(page, "empty");
  await expect(page.getByText("Belum ada riwayat ujian")).toBeVisible();
  await capture(page, testInfo.outputPath("results-empty.png"));
  expect(errors).toEqual([]);
});

test("Tutorial PKA upload fits before and after selecting an image", async ({ page }, testInfo) => {
  const errors = await setup(page);
  await visit(page, "registration");
  await expect(page.getByRole("button", { name: /Klik untuk mengunggah/ })).toBeVisible();
  await capture(page, testInfo.outputPath("pka-registration.png"));
  await page.locator('input[type="file"]').setInputFiles({
    name: "bukti-ikuti-akun.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByText("Gambar siap diunggah")).toBeVisible();
  await capture(page, testInfo.outputPath("pka-proof.png"));
  await page.getByRole("button", { name: "Hapus gambar" }).click();
  await expect(page.getByRole("button", { name: /Klik untuk mengunggah/ })).toBeVisible();
  expect(errors).toEqual([]);
});
