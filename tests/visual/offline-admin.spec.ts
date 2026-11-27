import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_OFFLINE_POLICY, type OfflinePolicyResponse } from "../../lib/offline/sync-contract";
import { buildOfflineAdminFixture } from "./fixtures/offline-admin-build";
import { fixtureFontStyles } from "./fixtures/fonts";

const origin = "https://offline-admin.fixture.test";
let fixture: Awaited<ReturnType<typeof buildOfflineAdminFixture>>;
test.beforeAll(async () => { fixture = await buildOfflineAdminFixture(); });

async function openSettings(page: Page, theme: "light" | "dark", locale = "id", conflict = false) {
  const failures: string[] = [];
  const mutations: Array<{ path: string; body: Record<string, unknown> }> = [];
  let response: OfflinePolicyResponse = {
    policy: { ...DEFAULT_OFFLINE_POLICY, revision: 3, updatedAt: Date.parse("2026-11-26T02:00:00Z") },
    revision: 3, status: { cursor: "42", lastChangedAt: Date.parse("2026-11-26T02:00:00Z") },
  };
  const course = { id: "fixture-math", title: "Matematika I" };
  const material = { key: "article-fixture", kind: "article", id: "fixture-article", courseId: course.id, title: "Turunan dan laju perubahan" };
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !(conflict && message.text().includes("409"))) failures.push(message.text());
  });
  page.on("response", value => {
    if (value.status() >= 400 && !(conflict && value.status() === 409 && value.url().endsWith("/api/admin/offline/policy"))) {
      failures.push(`${value.status()} ${value.url()}`);
    }
  });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname === "/admin/ops/offline") {
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.styles}${fixtureFontStyles()}</style></head><body class="bg-background text-foreground"><div id="root"></div><script>${fixture.script.replace(/<\/script/gi, "<\\/script")}</script></body></html>` });
    }
    if (url.origin === origin && /^\/brand\/zyx-logo-(?:horizontal|symbol)-(?:color|reversed)\.svg$/.test(url.pathname)) {
      return route.fulfill({ contentType: "image/svg+xml", body: readFileSync(resolve("public", url.pathname.slice(1))) });
    }
    if (url.origin === origin && url.pathname === "/api/notifications/history" && url.searchParams.get("countOnly") === "true") {
      return route.fulfill({ json: { unreadCount: 0, quietActive: false } });
    }
    if (url.origin === origin && url.pathname === "/api/admin/offline/policy") {
      if (request.method() === "PATCH") {
        const body = request.postDataJSON();
        mutations.push({ path: url.pathname, body });
        if (conflict) {
          response = { ...response, revision: 4, policy: { ...response.policy, revision: 4, maxEntries: 300 } };
          return route.fulfill({ status: 409, json: { error: "Policy changed" } });
        }
        response = { ...response, revision: 4, policy: { ...body.policy, revision: 4, updatedAt: response.policy.updatedAt } };
      }
      return route.fulfill({ json: response });
    }
    if (url.origin === origin && url.pathname === "/api/admin/offline/catalog") {
      return route.fulfill({ json: { courses: [course], resources: url.searchParams.has("courseId") ? [material] : [] } });
    }
    if (url.origin === origin && url.pathname === "/api/admin/offline/revalidate" && request.method() === "POST") {
      mutations.push({ path: url.pathname, body: request.postDataJSON() });
      return route.fulfill({ json: { cursor: "43" } });
    }
    failures.push(`Unexpected ${request.method()} ${url.href}`);
    return route.abort();
  });
  await page.goto(`${origin}/admin/ops/offline?locale=${locale}`);
  await expect(page.locator("[data-offline-cache-settings]")).toBeVisible();
  return { failures, mutations };
}

async function capture(page: Page, info: TestInfo, name: string, failures: string[]) {
  await page.evaluate(() => document.fonts.ready);
  const mobile = info.project.name === "mobile-380";
  if (!mobile || !name.includes("targeted")) await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: !mobile, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
  expect(failures).toEqual([]);
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

for (const theme of ["light", "dark"] as const) {
  test(`admin offline policies and targeted update in ${theme}`, async ({ page }, info) => {
    const { failures, mutations } = await openSettings(page, theme);
    const save = page.getByRole("button", { name: "Simpan pengaturan", exact: true });
    await expect(save).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "Hari", exact: true })).toHaveText("Jumat");
    await capture(page, info, `offline-admin-${theme}`, failures);
    await page.getByLabel("Batas ruang (MB)", { exact: true }).fill("150");
    await save.click();
    await expect(page.locator("[data-offline-cache-settings]").getByRole("status")).toContainText("Pengaturan tersimpan");
    expect(mutations[0]?.body).toMatchObject({ expectedRevision: 3, policy: { maxBytes: 150 * 1024 * 1024 } });
    await expect(save).toBeDisabled();
    await choose(page, "Cakupan", "Satu materi");
    await expect(page.getByRole("button", { name: "Perbarui data", exact: true })).toBeDisabled();
    await choose(page, "Mata kuliah", "Matematika I");
    await choose(page, "Materi", "Turunan dan laju perubahan");
    await page.getByRole("button", { name: "Perbarui data", exact: true }).click();
    await expect(page.locator("[data-offline-cache-settings]").getByRole("status")).toContainText("Permintaan pembaruan tercatat");
    expect(mutations[1]?.body).toEqual({ scope: "resource", courseId: "fixture-math", kind: "article", resourceId: "fixture-article" });
    await capture(page, info, `offline-admin-targeted-${theme}`, failures);
    await page.getByLabel("Batas ruang (MB)", { exact: true }).fill("2048");
    await expect(save).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText("Periksa nilai");
    expect(failures).toEqual([]);
  });
}

test("English policy conflict keeps edits until the admin loads the latest revision", async ({ page }, info) => {
  const { failures } = await openSettings(page, "light", "en", true);
  const maxEntries = page.getByLabel("Material limit", { exact: true });
  await maxEntries.fill("350");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Another admin changed");
  await expect(maxEntries).toHaveValue("350");
  await expect(page.getByRole("button", { name: "Save settings", exact: true })).toBeDisabled();
  await capture(page, info, "offline-admin-conflict-en", failures);
  await page.getByRole("button", { name: "Load latest version", exact: true }).click();
  await expect(maxEntries).toHaveValue("300");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(failures).toEqual([]);
});
