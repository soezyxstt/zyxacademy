import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { fixtureFontStyles } from "./fixtures/fonts";

// Render the production sidebar/menu with deterministic account transport.
// OAuth, Android UI and the database are covered separately, not by this fixture.
let script: string;
let styles: string;
const fixtureOrigin = "http://account-switch.test";
test.beforeAll(async () => {
  const css = resolve("app/globals.css");
  styles = (await postcss([tailwind()]).process(readFileSync(css), { from: css })).css + fixtureFontStyles();
  const stubs: Record<string, string> = {
    "next/link": `import React from "react"; export default function Link({href,prefetch,...props}) { return React.createElement("a", {href,...props}); }`,
    "next/image": `import React from "react"; export default function Image({priority,fill,...props}) { return React.createElement("img", props); }`,
    "next/navigation": `
      const router = { push(href) { window.history.pushState(null, "", href); } };
      export const useRouter = () => router;
      export const usePathname = () => "/dashboard";
    `,
    "@/components/command-menu": `export const useCommandMenu = () => ({setOpen() {}});`,
    "@/components/providers/locale-provider": `export const useAppLocale = () => ({locale:"id"});`,
    "@/components/notifications/notification-bell": `export const NotificationBell = () => null;`,
    "@/components/native/app-update-control": `export const AppUpdateControl = () => null;`,
    "@/hooks/use-query-account": `export const useSyncQueryAccount = () => {};`,
    "@/lib/auth/account-transition-state": `export const isLocalAccountTransitionPending = () => Boolean(window.fixtureTransitionPending);`,
    "@/lib/auth-client": `export const useSession = () => ({data:{user:window.fixtureAccounts.find(a=>a.user.id === sessionStorage.getItem("fixture-account"))?.user || window.fixtureAccounts[0].user}, isPending:false}); export const signOut = async()=>{window.fixtureCalls.push("signOut");return {error:null}};`,
    "@/lib/auth/account-switch": `
      export const MAX_SAVED_ACCOUNTS=5;
      export class AccountSwitchError extends Error { constructor(code){super(code);this.code=code;} }
      export async function listSavedAccounts(){
        window.fixtureCalls.push("list");
        if(window.fixtureScenario==="load-error") throw new AccountSwitchError("OFFLINE");
        if(window.fixtureScenario==="loading") await new Promise(resolve=>window.fixtureResolveList=resolve);
        return window.fixtureAccounts;
      }
      export async function switchSavedAccount(account){
        window.fixtureCalls.push("switch");
        if(window.fixtureScenario==="expired") throw new AccountSwitchError("SESSION_EXPIRED");
        if(window.fixtureScenario==="uncertain"){window.fixtureTransitionPending=true;throw new AccountSwitchError("SWITCH_FAILED");}
        if(window.fixtureScenario==="pending") await new Promise(resolve=>window.fixtureResolveSwitch=resolve);
        sessionStorage.setItem("fixture-account",account.user.id); return account.user.id;
      }
      export async function removeSavedAccount(account){window.fixtureCalls.push("remove");window.fixtureAccounts=window.fixtureAccounts.filter(a=>a.user.id!==account.user.id);}
      export async function startWebAccountSignIn(){window.fixtureCalls.push("web-sign-in");}
    `,
    "@/lib/native/auth": `
      export class NativeGoogleSignInError extends Error { constructor(code){super(code);this.code=code;} }
      export async function startNativeGoogleSignIn(path,options){
        window.fixtureCalls.push(options?.preferBrowser?"browser-fallback":"native-sign-in");
        if(window.fixtureScenario==="native-error"&&!options?.preferBrowser) throw new NativeGoogleSignInError("GOOGLE_NOT_CONFIGURED");
        options?.onBrowserClosed?.(); return true;
      }
    `,
  };
  const bundled = await build({ entryPoints: ["tests/visual/fixtures/account-switcher.tsx"], bundle: true, write: false, format: "iife", minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "account-fixture-services", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "account-fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "account-fixture" }, args => ({ contents: stubs[args.path], resolveDir: process.cwd() }));
    } }],
  });
  script = bundled.outputFiles[0].text;
});

async function prepare(page: Page, testInfo: TestInfo, scenario = "ready", extras = "") {
  const issues: string[] = [];
  page.on("pageerror", error => issues.push(error.message));
  page.on("console", message => { if (message.type() === "error") issues.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const fixtureAccounts = [
    { user: { id: "student-a", name: "Nadia Putri", email: "nadia.pribadi@example.test", image: null, role: extras.includes("role=admin") ? "admin" : "student" }, session: { token: "fixture-token-a", expiresAt: "2030-01-01T00:00:00Z" } },
    { user: { id: "student-b", name: "Nadia Putri", email: "nadia.kampus@example.test", image: null, role: "student" }, session: { token: "fixture-token-b", expiresAt: "2030-01-01T00:00:00Z" } },
  ];
  if (scenario === "limit") for (let i = 2; i < 5; i++) fixtureAccounts.push({ user: { id: `student-${i}`, name: i === 4 ? "Nadia Putri Kusumaningrum" : "Nadia Putri", email: i === 4 ? "nadia.putri.kusumaningrum@mahasiswa.example.test" : `nadia.${i}@example.test`, image: null, role: "student" }, session: { token: `fixture-token-${i}`, expiresAt: "2030-01-01T00:00:00Z" } });
  await page.addInitScript(({ fixtureAccounts, scenario, extras }) => {
    Object.assign(window, { fixtureAccounts, fixtureScenario: scenario, fixtureCalls: [] });
    if (extras.includes("collapsed=1")) localStorage.setItem("fixture-sidebar-collapsed", "true");
  }, { fixtureAccounts, scenario, extras });
  await page.route(`${fixtureOrigin}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/brand/")) return route.fulfill({ contentType: "image/svg+xml", body: readFileSync(resolve(`public${path}`)) });
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${extras.includes("locale=en") ? "en" : "id"}" class="${extras.includes("theme=dark") ? "dark" : ""}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>${script}</script></body></html>` });
  });
  await page.goto(`${fixtureOrigin}/?scenario=${scenario}&${extras}`);
  await expect(page.locator("aside[data-sidebar-ready=true]")).toHaveCount(1);
  if (testInfo.project.name === "mobile-380") await page.getByRole("button", { name: "Buka menu", exact: true }).click();
  return issues;
}

async function openMenu(page: Page) {
  const trigger = page.getByRole("button", { name: /^(Akun|Account) \(/ });
  await trigger.focus();
  await trigger.press("Enter");
  const panel = page.getByRole("dialog", { name: /^(Akun dan pengaturan|Account and settings)$/ });
  await expect(panel).toBeVisible();
  return { trigger, panel };
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const panels = page.getByRole("dialog");
  for (const panel of await panels.all()) {
    if (!(await panel.isVisible())) continue;
    // Radix mounts the popover before Floating UI resolves its viewport position.
    // Keep the bounds checks, but wait for that layout before taking the capture.
    await expect(async () => {
      const box = await panel.boundingBox();
      const viewport = page.viewportSize()!;
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    }).toPass({ timeout: 5_000 });
  }
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
}

test("saved accounts, cancel native picker, keyboard and switch", async ({ page }, info) => {
  const issues = await prepare(page, info);
  await capture(page, info, "closed");
  const { trigger, panel } = await openMenu(page);
  await expect(panel.getByRole("button", { name: "Beralih ke nadia.kampus@example.test" })).toBeEnabled();
  await capture(page, info, "accounts");
  await panel.getByRole("button", { name: "Tambah akun Google", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Tambah akun Google", exact: true })).toBeEnabled();
  await expect(panel.getByLabel("Akun aktif: Nadia Putri")).toContainText("nadia.pribadi@example.test");
  expect(await page.evaluate(() => (window as any).fixtureCalls.includes("signOut"))).toBe(false);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await panel.getByRole("button", { name: "Beralih ke nadia.kampus@example.test" }).click();
  await page.waitForURL(`${fixtureOrigin}/dashboard`);
  if (info.project.name === "mobile-380") await page.getByRole("button", { name: "Buka menu", exact: true }).click();
  const switched = await openMenu(page);
  await expect(switched.panel.getByLabel("Akun aktif: Nadia Putri")).toContainText("nadia.kampus@example.test");
  await capture(page, info, "switched");
  expect(issues).toEqual([]);
});

test("loading accounts, then ready", async ({ page }, info) => {
  const issues = await prepare(page, info, "loading");
  const { panel } = await openMenu(page);
  await expect(panel.getByRole("status")).toHaveText("Memuat akun...");
  await expect(panel.getByRole("button", { name: "Tambah akun Google" })).toBeDisabled();
  await capture(page, info, "loading");
  await page.evaluate(() => { (window as any).fixtureScenario = "ready"; (window as any).fixtureResolveList(); });
  await expect(panel.getByRole("button", { name: "Beralih ke nadia.kampus@example.test" })).toBeEnabled();
  expect(issues).toEqual([]);
});

test("load failure is recoverable", async ({ page }, info) => {
  const issues = await prepare(page, info, "load-error");
  const { panel } = await openMenu(page);
  await expect(panel.getByRole("alert")).toContainText("Akun gagal dimuat");
  await capture(page, info, "load-error");
  await page.evaluate(() => { (window as any).fixtureScenario = "ready"; });
  await panel.getByRole("button", { name: "Coba lagi" }).click();
  await expect(panel.getByRole("button", { name: "Beralih ke nadia.kampus@example.test" })).toBeEnabled();
  expect(issues).toEqual([]);
});

test("expired session keeps current account", async ({ page }, info) => {
  const issues = await prepare(page, info, "expired");
  const { panel } = await openMenu(page);
  await panel.getByRole("button", { name: "Beralih ke nadia.kampus@example.test" }).click();
  await expect(panel.getByRole("alert")).toContainText("Sesi akun ini berakhir");
  await expect(panel.getByLabel("Akun aktif: Nadia Putri")).toContainText("nadia.pribadi@example.test");
  await capture(page, info, "expired-session");
  expect(issues).toEqual([]);
});

test("pending switch disables actions and preserves identity", async ({ page }, info) => {
  const issues = await prepare(page, info, "pending");
  const { panel } = await openMenu(page);
  await panel.getByRole("button", { name: "Beralih ke nadia.kampus@example.test" }).click();
  await expect(panel.getByRole("button", { name: "Tambah akun Google" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await capture(page, info, "switching");
  expect(issues).toEqual([]);
});

test("uncertain cookie state stays locked while the guard reloads", async ({ page }, info) => {
  const issues = await prepare(page, info, "uncertain");
  const { panel } = await openMenu(page);
  await panel.getByRole("button", { name: "Beralih ke nadia.kampus@example.test" }).click();
  await expect(panel.getByRole("button", { name: "Tambah akun Google" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("status")).toHaveText("Berganti akun...");
  expect(await page.evaluate(() => (window as any).fixtureCalls.filter((call: string) => call === "list").length)).toBe(1);
  expect(issues).toEqual([]);
});

test("remove inactive account requires confirmation", async ({ page }, info) => {
  const issues = await prepare(page, info);
  let { panel } = await openMenu(page);
  await panel.getByRole("button", { name: "Kelola akun nadia.kampus@example.test" }).click();
  await page.getByRole("menuitem", { name: "Hapus akun", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Hapus akun dari aplikasi?", exact: true });
  await expect(confirm).toContainText("nadia.kampus@example.test");
  await capture(page, info, "remove-confirmation");
  await confirm.getByRole("button", { name: "Batal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Akun (Nadia Putri)", exact: true })).toBeFocused();
  ({ panel } = await openMenu(page));
  await panel.getByRole("button", { name: "Kelola akun nadia.kampus@example.test" }).click();
  await page.getByRole("menuitem", { name: "Hapus akun", exact: true }).click();
  await confirm.getByRole("button", { name: "Hapus akun", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Beralih ke nadia.kampus@example.test" })).toHaveCount(0);
  await capture(page, info, "account-removed");
  expect(issues).toEqual([]);
});

test("native setup failure offers explicit browser recovery", async ({ page }, info) => {
  const issues = await prepare(page, info, "native-error");
  const { panel } = await openMenu(page);
  await panel.getByRole("button", { name: "Tambah akun Google" }).click();
  await expect(panel.getByRole("button", { name: "Lanjut lewat browser" })).toBeEnabled();
  await capture(page, info, "native-recovery");
  await panel.getByRole("button", { name: "Lanjut lewat browser" }).click();
  await expect(panel.getByRole("button", { name: "Tambah akun Google" })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).fixtureCalls.includes("browser-fallback"))).toBe(true);
  expect(issues).toEqual([]);
});

test("account limit and long identities fit", async ({ page }, info) => {
  const issues = await prepare(page, info, "limit");
  const { panel } = await openMenu(page);
  await expect(panel.getByRole("button", { name: "Tambah akun Google" })).toBeDisabled();
  await expect(panel).toContainText("Maksimal 5 akun");
  await capture(page, info, "five-accounts");
  expect(issues).toEqual([]);
});

test("admin role actions, dark English and collapsed trigger", async ({ page }, info) => {
  const issues = await prepare(page, info, "ready", "locale=en&theme=dark&role=admin&collapsed=1");
  const { panel } = await openMenu(page);
  await expect(panel.getByRole("link", { name: "Admin panel" })).toHaveAttribute("href", "/admin");
  await expect(panel.getByRole("link", { name: "Tutor panel" })).toHaveAttribute("href", "/tutor");
  await expect(panel.getByRole("button", { name: "Add Google account" })).toBeEnabled();
  await capture(page, info, "admin-dark-english");
  expect(issues).toEqual([]);
});

test("public demo never requests saved sessions", async ({ page }, info) => {
  const issues = await prepare(page, info, "demo");
  const { panel } = await openMenu(page);
  await expect(panel).toContainText("Pelajar Demo");
  await expect(panel.getByRole("button", { name: "Tambah akun Google" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).fixtureCalls)).toEqual([]);
  await capture(page, info, "demo");
  expect(issues).toEqual([]);
});

test("mobile sidebar stays open during popover actions and first outside click", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-380", "Mobile drawer behavior only applies on narrow viewports");
  const issues = await prepare(page, info);
  const sidebar = page.locator("aside[data-sidebar-ready=true]");
  await expect(sidebar).not.toHaveAttribute("aria-hidden", "true");
  await expect(page).toHaveURL(/[?&]dialog=/);
  const sidebarUrl = page.url();

  const { panel } = await openMenu(page);
  await panel.getByRole("button", { name: "Kelola akun nadia.kampus@example.test" }).click();
  await expect(page.getByRole("menuitem", { name: "Hapus akun", exact: true })).toBeVisible();
  await expect(sidebar).not.toHaveAttribute("aria-hidden", "true");

  // Dismiss nested dropdown and popover by clicking outside; sidebar remains open.
  const viewport = page.viewportSize()!;
  await page.mouse.click(viewport.width - 10, 20);
  await expect(panel).toBeHidden();
  await expect(sidebar).not.toHaveAttribute("aria-hidden", "true");
  await expect(page).toHaveURL(sidebarUrl);

  // Clicking outside again with no overlay open closes the mobile sidebar.
  await page.mouse.click(viewport.width - 10, 20);
  await expect(sidebar).toHaveAttribute("aria-hidden", "true");
  await expect(page).not.toHaveURL(/[?&]dialog=/);
  expect(issues).toEqual([]);
});

