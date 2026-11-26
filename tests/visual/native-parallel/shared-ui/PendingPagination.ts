import assert from "node:assert/strict";
import type { Page, Route } from "playwright-core";

/** Install after loading the pending fixture, before clicking Next. No request
 * reaches the application server. Keep the returned hold until after capture. */
export async function preparePendingPagination(page: Page): Promise<() => void> {
  let release!: () => void;
  let intercepted!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const seen = new Promise<void>(resolve => { intercepted = resolve; });
  const handler = async (route: Route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) {
      await route.fallback();
      return;
    }
    intercepted();
    await held;
    await route.abort("blockedbyclient").catch(() => {});
  };
  await page.route("**/*", handler);
  const previous = page.getByRole("button", { name: "Sebelumnya", exact: true });
  const next = page.getByRole("button", { name: "Berikutnya", exact: true });
  await next.click();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([seen, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Pending server action was not intercepted")), 10000); })]);
  } finally {
    clearTimeout(timeout);
  }
  await page.waitForFunction(() => {
    const span = Array.from(document.querySelectorAll("span")).find(el => el.textContent?.trim() === "2 / 5");
    return Boolean(span);
  });
  assert.equal(await previous.isDisabled(), true, "Previous must be disabled while loading");
  assert.equal(await next.isDisabled(), true, "Next must be disabled while loading");
  assert.equal(await page.getByText("2 / 5", { exact: true }).textContent(), "2 / 5");
  return release;
}
