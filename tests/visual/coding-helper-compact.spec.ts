import { expect, test } from "@playwright/test";
import { mockTerminal } from "./terminal-fixture";

test("shows Zyra's answer with the compact composer", async ({ page }, info) => {
  await mockTerminal(page);
  await page.route("**/api/zyra/chat", route => route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"text-delta","textDelta":"Mulai dengan menyimpan panjang dan lebar, lalu kalikan keduanya."}\n\ndata: [DONE]\n\n' }));
  await page.goto("/visual-fixtures/coding?terminal=1");
  await expect(page.getByRole("textbox", { name: "Kode Python" })).toBeVisible();
  await page.getByRole("button", { name: "Petunjuk" }).click();
  await expect(page.getByText("Mulai dengan menyimpan panjang dan lebar, lalu kalikan keduanya.")).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/helper-answer.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
