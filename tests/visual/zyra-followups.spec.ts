import { expect, test } from "@playwright/test";
import { mockTerminal, mockZyraDrawer } from "./terminal-fixture";

test("contextual followups are validated and send safe intents", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const requests: any[] = [];
  const suggestions = [
    { label: "Jelaskan langkah ini", prompt: "Jelaskan langkah ini lebih rinci", icon: "help", intent: "explain" },
    { label: "Coba latihan lain", prompt: "Berikan latihan lain", icon: "example", intent: "practice" },
    { label: "Periksa pemahaman saya", prompt: "Periksa pemahaman saya", icon: "compass", intent: "check" },
  ];
  await mockTerminal(page);
  await mockZyraDrawer(page);
  await page.route("**/api/zyra/chat", route => {
    requests.push(route.request().postDataJSON());
    const followups = requests.length === 1 || requests.length === 3 ? suggestions : requests.length === 2 ? [{ ...suggestions[0], icon: "<svg>" }] : undefined;
    return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "text-delta", textDelta: `Jawaban ${requests.length}` })}\n\n${followups ? `data: ${JSON.stringify({ type: "data-followups", followups })}\n\n` : ""}data: [DONE]\n\n` });
  });
  await page.goto("/visual-fixtures/coding?terminal=1");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.getByRole("button", { name: "Buka Zyra" }).click();
  const drawer = page.getByRole("complementary", { name: "Asisten belajar Zyra" });
  const composer = drawer.getByRole("textbox", { name: "Tanyakan materi atau rumus..." });
  await expect(drawer.getByText("Kalikan panjang dengan lebar.")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Jelaskan langkah ini" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("screenshots/no-followups.png"), animations: "disabled" });
  await composer.fill("Bantu saya");
  await composer.press("Enter");
  const chip = drawer.getByRole("button", { name: "Jelaskan langkah ini" });
  await expect(chip).toBeVisible();
  await expect(chip.locator("svg")).toHaveCount(1);
  await expect(drawer.getByRole("button", { name: "Coba latihan lain" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("screenshots/followups.png"), animations: "disabled" });
  await chip.click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].question).toBe("Jelaskan langkah ini lebih rinci");
  expect(requests[1].codingContext.intent).toBe("review");
  await expect(drawer.getByText("Jawaban 2")).toBeVisible();
  await expect(chip).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("screenshots/invalid-followups.png"), animations: "disabled" });
  await drawer.getByRole("tab", { name: "Tutor", exact: true }).click();
  await composer.fill("Lanjut");
  await composer.press("Enter");
  await expect(drawer.getByText("Jawaban 3")).toBeVisible();
  await expect(chip).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/tutor-followups.png"), animations: "disabled" });
  await drawer.getByRole("button", { name: "Coba latihan lain" }).click();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests[3].question).toBe("Berikan latihan lain");
  expect(requests[3].codingContext.intent).toBe("hint");
  expect(errors).toEqual([]);
  await expect(drawer.getByText("Jawaban 4")).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/missing-followups.png"), animations: "disabled" });
  await expect(chip).toHaveCount(0);
});
