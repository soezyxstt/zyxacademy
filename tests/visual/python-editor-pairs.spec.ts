import { expect, test } from "@playwright/test";
import { mockTerminal } from "./terminal-fixture";

test("pairs Python brackets and quotes while typing", async ({ page }) => {
  await mockTerminal(page);
  await page.goto("/visual-fixtures/coding?terminal=1");
  const editor = page.getByRole("textbox", { name: "Kode Python" });
  await expect(editor).toBeVisible();
  for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"], ["'", "'"], ['"', '"']]) {
    await editor.fill("");
    await editor.pressSequentially(open);
    await expect(editor).toHaveText(open + close);
    await editor.pressSequentially("x");
    await expect(editor).toHaveText(open + "x" + close);
    await editor.press("Backspace");
    await editor.press("Backspace");
    await expect(editor).toHaveText("");
  }
});
