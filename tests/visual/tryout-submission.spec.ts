import { expect, test } from "@playwright/test";
import { buildFixture } from "./fixtures/interactive-document-build";

const origin = "http://tryout-submission.invalid";
let fixture: Awaited<ReturnType<typeof buildFixture>>;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  fixture = await buildFixture("tests/visual/fixtures/tryout-submission.tsx", "", {
    "@/app/actions/tutor-management": "export async function submitTryoutAction(_course, _exam, answers) { return window.tryoutFixture.submit(answers); }",
    "next/navigation": "export const useRouter=()=>({push(href){window.tryoutFixture.destination=href;}}); export const usePathname=()=>'/fixture';",
  });
});

for (const mode of ["rejected", "exception", "custom-timeout"] as const) {
  test(`tryout preserves answers after ${mode} and navigates on a successful retry`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("Fixture rejection")) errors.push(message.text());
    });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(response.url()); });
    const custom = mode === "custom-timeout";
    await page.clock.install({ time: new Date("2026-11-20T00:00:00Z") });
    await page.route(`${origin}/`, (route) => route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="id"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div></html>',
    }));
    await page.route(`${origin}/api/exams/attachments`, (route) => route.fulfill({
      json: { success: true, key: "exams/fixture-exam/attachments/answer.pdf", fileName: "answer.pdf", fileSize: "10 B" },
    }));
    await page.goto(origin);
    await page.addStyleTag({ content: fixture.styles });
    await page.evaluate(({ mode, custom }) => {
      const config = {
        transport: custom, timeLimitMinutes: 1, destination: null as string | null, requests: [] as unknown[],
        async submit(answers: unknown) {
          config.requests.push(answers);
          if (config.requests.length === 1) {
            if (mode === "rejected") return { success: false };
            throw new Error("Fixture rejection");
          }
          return { success: true };
        },
      };
      Object.assign(window, { tryoutFixture: config });
    }, { mode, custom });
    await page.addScriptTag({ content: fixture.script });

    await page.getByRole("radio", { name: "Dua" }).check();
    const footer = page.locator("[data-tryout-mobile-bottombar]");
    if (info.project.name === "mobile-380") {
      await expect(page.getByRole("button", { name: /kumpulkan/i })).toHaveCount(0);
      await expect(footer.getByRole("button")).toHaveCount(2);
    } else {
      await expect(page.getByRole("button", { name: "Kumpulkan ujian", exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    const essay = page.locator("textarea");
    await essay.fill("Saya gunakan bilangan genap.");
    if (!custom) {
      await page.locator('input[type="file"]').setInputFiles({ name: "answer.pdf", mimeType: "application/pdf", buffer: Buffer.from("fixture") });
      await expect(page.getByText("answer.pdf", { exact: true })).toBeVisible();
    }
    const openConfirmation = async () => {
      const submit = page.getByRole("button", { name: "Kumpulkan jawaban", exact: true });
      if (info.project.name === "mobile-380") {
        await expect(footer.getByRole("button")).toHaveCount(2);
        expect(await submit.evaluate(button => {
          return Math.abs(button.getBoundingClientRect().right - button.parentElement!.getBoundingClientRect().right);
        })).toBeLessThanOrEqual(1);
      }
      await submit.click();
      await expect(page.getByRole("button", { name: "Periksa kembali", exact: true })).toBeFocused();
      if (!custom && mode === "rejected") {
        await page.screenshot({ path: info.outputPath("tryout-confirmation.png"), animations: "disabled" });
      }
      return page.getByRole("button", { name: "Ya, kumpulkan", exact: true });
    };
    if (custom) {
      await page.clock.runFor(60_000);
    } else {
      await (await openConfirmation()).click();
    }
    await expect(page.getByText("Gagal mengumpulkan jawaban. Coba kirim lagi.", { exact: true })).toBeVisible();
    if (!custom) await page.getByRole("button", { name: "Periksa kembali", exact: true }).click();
    await expect(essay).toHaveValue("Saya gunakan bilangan genap.");
    if (!custom) await expect(page.getByText("answer.pdf", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sebelumnya", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Dua" })).toBeChecked();
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    const status = () => page.evaluate(() => {
      const { destination, requests } = (window as unknown as {
        tryoutFixture: { destination: string | null; requests: Array<Record<string, unknown>> };
      }).tryoutFixture;
      return { destination, requests };
    });
    const afterFailure = await status();
    expect(afterFailure.destination).toBeNull();
    expect(afterFailure.requests).toHaveLength(1);
    if (custom) {
      await page.clock.runFor(3000);
      expect((await status()).requests).toHaveLength(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("tryout-recovery.png"), fullPage: true, animations: "disabled" });

    await (await openConfirmation()).click();
    await expect.poll(async () => (await status()).destination).toBe(custom ? "/custom-results" : "/courses/fixture-course/my-results");
    expect((await status()).requests).toEqual([afterFailure.requests[0], afterFailure.requests[0]]);
    expect(errors).toEqual([]);
  });
}
