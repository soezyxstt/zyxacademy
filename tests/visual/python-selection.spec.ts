import { expect, test } from "@playwright/test";
import { mockTerminal, mockZyraDrawer } from "./terminal-fixture";

test("selected Python is quoted for review without changing the editor", async ({ page }, info) => {
  await mockTerminal(page);
  await mockZyraDrawer(page);
  let payload: any;
  await page.route("**/api/zyra/chat", route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"text-delta","textDelta":"Penjelasan."}\n\ndata: [DONE]\n\n' });
  });
  await page.goto("/visual-fixtures/coding?terminal=1&selection=1");
  const editor = page.getByRole("textbox", { name: "Kode Python" });
  await editor.fill("print(123)");
  await editor.press("ControlOrMeta+A");
  const bar = page.locator('[data-slot="python-selection-actions"]');
  await expect(bar).toBeVisible();
  await page.screenshot({ path: info.outputPath("screenshots/selected.png") });
  await bar.getByRole("button", { name: "Tutup pilihan kode" }).click();
  await expect(bar).toHaveCount(0);
  await editor.press("ArrowRight");
  await editor.press("ControlOrMeta+A");
  await expect(bar).toBeVisible();
  if (info.project.name === "mobile-380") await bar.getByRole("button", { name: "Jelaskan pilihan" }).tap();
  else await bar.getByRole("button", { name: "Jelaskan pilihan" }).click();
  const drawer = page.getByRole("complementary", { name: "Asisten belajar Zyra" });
  await expect(drawer.getByRole("tab", { name: "Python", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(drawer.locator("footer")).toContainText("print(123)");
  await page.screenshot({ path: info.outputPath("screenshots/quoted.png") });
  await drawer.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect.poll(() => payload?.codingContext?.intent).toBe("review");
  expect(payload.selectionContext.snippet).toBe("print(123)");
  expect(payload.codingContext.code).toBe("print(123)");
  await expect(editor).toContainText("print(123)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
