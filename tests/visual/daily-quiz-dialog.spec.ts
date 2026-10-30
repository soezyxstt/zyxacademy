import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

test("daily quiz exposes selection and feedback in a keyboard-accessible dialog", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto("/visual-fixtures/daily-quiz");
  const dialog = page.getByRole("dialog", { name: "Matematika Trivia" });
  await expect(dialog).toBeVisible();
  const answer = dialog.getByRole("button", { name: "B 4" });

  async function capture(name: string) {
    const path = info.outputPath(`screenshots/${name}.png`);
    await page.screenshot({ path, animations: "disabled" });
    await info.attach(name, { path, contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }

  await expect(dialog.getByRole("button", { name: /kirim/i })).toBeDisabled();
  await capture("unselected");
  await answer.click();
  await expect(answer).toHaveAttribute("aria-pressed", "true");
  await capture("selected");
  await dialog.getByRole("button", { name: /kirim/i }).click();
  await capture("correct");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("daily quiz explains an incorrect answer in dark mode", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/visual-fixtures/daily-quiz");
  await expect(page.locator("html")).toHaveClass(/dark/);
  const dialog = page.getByRole("dialog", { name: "Matematika Trivia" });
  await dialog.getByRole("button", { name: "A 3" }).click();
  await dialog.getByRole("button", { name: /kirim/i }).click();
  await expect(dialog.getByText("4", { exact: true })).toBeVisible();
  const path = info.outputPath("screenshots/incorrect-dark.png");
  await page.screenshot({ path, animations: "disabled" });
  await info.attach("incorrect-dark", { path, contentType: "image/png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
