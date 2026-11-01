import { expect, test } from "@playwright/test";
import { mockTerminal, mockZyraDrawer } from "./terminal-fixture";

test("shows Zyra's answer with the compact composer", async ({ page }, info) => {
  await mockTerminal(page);
  await mockZyraDrawer(page);
  await page.route("**/api/zyra/chat", route => route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"text-delta","textDelta":"Mulai dengan menyimpan panjang dan lebar, lalu kalikan keduanya."}\n\ndata: [DONE]\n\n' }));
  await page.goto("/visual-fixtures/coding?terminal=1");
  await expect(page.getByRole("textbox", { name: "Kode Python" })).toBeVisible();
  await page.getByRole("button", { name: "Buka Zyra" }).click();
  await page.getByRole("complementary", { name: "Asisten belajar Zyra" }).getByRole("tab", { name: "Tutor", exact: true }).click();
  await page.getByRole("textbox", { name: "Tanyakan materi atau rumus..." }).fill("Beri petunjuk menghitung luas.");
  await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect(page.getByText("Mulai dengan menyimpan panjang dan lebar, lalu kalikan keduanya.")).toBeVisible();
  const userText = page.getByRole("complementary").getByText("Beri petunjuk menghitung luas.", { exact: true });
  expect(await userText.evaluate(element => element.getBoundingClientRect().right <= element.closest('[role="region"]')!.getBoundingClientRect().right)).toBe(true);
  await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
  await page.screenshot({ path: info.outputPath("screenshots/helper-answer.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
