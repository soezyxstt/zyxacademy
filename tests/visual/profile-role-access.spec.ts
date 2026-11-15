import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// Render real profile pages and the dashboard summary with isolated account/query fixtures.
// The unrelated 3D mascot scene and application shell are omitted.
const root = process.cwd();
const harness = path.join(root, "tests/visual/gamification-harness");
let bundle: Uint8Array;
let styles: string;
const serverFixture = `
 import {badges,rewards,portrait} from '@/tests/visual/gamification-harness/data';
 export const student = new URLSearchParams(location.search).get('role') === 'student';
 const populated = new URLSearchParams(location.search).has('populated');
 export const user = { id:'fixture-account', name:'Alya Putri Maharani Kusumawardhani', email:'alya@example.test', image:populated?portrait:null, faculty:'FMIPA', major:'Matematika', entryYear:2024 };
 export const auth = { api:{ getSession:async()=>({user}) } };
 export const getStudentGamificationAccess = async()=>student?{user}:null;
 export const headers = async()=>new Headers();
 export const db = { select:()=>({from:()=>({where:()=>({limit:async()=>[user]})})}) };
 export const createMetadata=()=>({}); export const pageTitle=x=>x;
 const guard = value => async()=>{if(!student)throw Error('Forbidden');return value;};
 export const getStudentSocialSettings=guard({publicId:null,displayName:null,visibility:'private',showMajor:false,showFaculty:false,allowFollows:false,leaderboardOptIn:false,avatarBadgeId:null,avatarMode:'photo',badgeTier:null,featuredBadgeIds:[]});
 export const getAchievementBadges=guard(populated?badges:[]), getGamificationRewards=guard(populated?rewards:[]);
 export const getGamificationSummary=guard({rankKey:'rakyat',baseXpMicro:0,bonusXpMicro:0,lpBalance:0});
 export const listStudentEnrollments=guard(populated?[{id:'math',title:'Matematika I'},{id:'logic',title:'Berpikir Komputasional dan Pemecahan Masalah'}]:[]);
 export const getPrivateProfileAggregates=guard({completedCount:0,submissionCount:0,averageScore:null});
`;

test.beforeEach(async ({ page }) => {
 const errors: string[] = [];
 page.on("pageerror", error => errors.push(error.message));
 page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
 page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
 (page as any).profileErrors = errors;
 await page.route("http://profile-role.local/**", async request => {
  const pathname = new URL(request.request().url()).pathname;
  if (pathname === "/fixture.js") return request.fulfill({ contentType: "application/javascript", body: Buffer.from(bundle) });
  if (pathname === "/styles.css") return request.fulfill({ contentType: "text/css", body: styles });
  if (pathname.startsWith("/gamification/")) {
   const file = path.resolve(root, "public", `.${pathname}`);
   if (!file.startsWith(path.join(root, "public/gamification") + path.sep)) throw Error("INVALID_FIXTURE_ASSET");
   return request.fulfill({ path: file });
  }
  if (/\.(svg|png|webp|jpe?g)$/.test(pathname)) return request.fulfill({ status: 404, body: "Unknown fixture asset" });
  return request.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>' });
 });
 await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterEach(async ({ page }) => {
 expect((page as any).profileErrors).toEqual([]);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test.beforeAll(async () => {
 const aliases: Record<string, string> = {
  "next/link": "shims.link.tsx", "next/image": "shims.image.tsx", "next/navigation": "shims.navigation.ts",
  "next/dynamic": "shims.dynamic.tsx", "next-intl": "shims.i18n.ts", "@/lib/i18n/client": "shims.i18n.ts",
  "@/lib/i18n/server": "shims.i18n.ts", "@/lib/auth-client": "shims.auth.ts",
  "@/app/(student)/profile/actions": "shims.actions.ts",
  "@/app/(student)/profile/edit/cosmetic-actions": "shims.actions.ts",
  "@/lib/gamification/social-actions": "shims.actions.ts",
 };
 const serverModules = new Set(["next/headers", "@/lib/auth", "@/db", "@/lib/gamification/access", "@/lib/site",
  "@/lib/gamification/social", "@/lib/gamification/queries", "@/lib/student/course-catalog", "@/lib/gamification/profile-aggregate"]);
 const result = await build({ stdin: { contents: `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import Profile from '@/app/(student)/profile/page'; import Edit from '@/app/(student)/profile/edit/page';
  import {GamificationDashboardSummary} from '@/components/gamification/dashboard-summary';
  import RouteTemplate from '@/app/template'; import {PageTransition} from '@/components/ui/page-transition';
  import {usePathname,useRouter} from 'next/navigation';
  function Navigation(){const pathname=usePathname(),router=useRouter(); return <RouteTemplate key={pathname}><div className="p-4"><nav className="mb-6 flex flex-wrap gap-3">{['/dashboard','/achievements','/students/fixture','/profile'].map(path=><a key={path} href={path+location.search} onClick={event=>{event.preventDefault();router.push(path+location.search);}}>{path}</a>)}</nav><PageTransition><h1 className="font-heading text-h5">{pathname}</h1></PageTransition></div></RouteTemplate>;}
  (async()=>{const page=location.pathname.endsWith('/edit')?await Edit():location.pathname==='/dashboard'?await GamificationDashboardSummary({userId:'fixture-account'}):await Profile();
   createRoot(document.getElementById('root')).render(<main>{new URLSearchParams(location.search).has('navigation')?<Navigation/>:page}</main>);document.documentElement.dataset.ready='true';})();
 `, resolveDir: root, loader: "tsx" }, bundle: true, write: false, outdir: "fixture", platform: "browser", jsx: "automatic",
 define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "account-fixture", setup(builder) {
  builder.onResolve({ filter: /.*/ }, args => {
   if (args.path.endsWith("zyra-mascot-3d-scene")) return { path: "mascot-scene", namespace: "account-fixture" };
   if (serverModules.has(args.path)) return { path: "server-fixture", namespace: "account-fixture" };
   if (args.path === "@/db/schema") return { path: "schema", namespace: "account-fixture" };
   if (aliases[args.path]) return { path: path.join(harness, aliases[args.path]) };
   if (args.path.startsWith("@/")) {
    const base = path.join(root, args.path.slice(2));
    const found = [base, `${base}.tsx`, `${base}.ts`].find(file => existsSync(file));
    if (found) return { path: found };
   }
  });
  builder.onLoad({ filter: /.*/, namespace: "account-fixture" }, args => ({
   contents: args.path === "schema" ? "export const user={id:'fixture-account'};" : args.path === "mascot-scene" ? "export function mountMascotScene(){return {dispose(){},setModel(){},setAnimated(){}};}" : serverFixture,
   loader: "js", resolveDir: root,
  }));
 } }] });
 bundle = result.outputFiles.find(file => file.path.endsWith(".js"))!.contents;
 let css = readFileSync(path.join(root, "app/globals.css"), "utf8").replace('@import "tailwindcss";', '@import "tailwindcss" source(none);');
 css += ["components", "app/(student)/profile"].map(source => `\n@source "${path.join(root, source).replaceAll("\\", "/")}";`).join("");
 const compiled = await postcss([tailwind({ base: root })]).process(css, { from: path.join(root, "app/globals.css") });
 styles = compiled.css + "\n" + (result.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "");
});

for (const role of ["staff", "student"]) {
 for (const route of ["/profile", "/profile/edit", "/dashboard"]) {
  test(`${role} ${route} account rendering`, async ({ page }, info) => {
   await page.goto(`http://profile-role.local${route}?role=${role}`);
   await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
   await expect(page).toHaveURL(`http://profile-role.local${route}?role=${role}`);
   if (route === "/profile") {
    await expect(page.getByRole("heading", { name: "Alya Putri Maharani Kusumawardhani" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit Profil" })).toBeVisible();
    await expect(page.getByText("rakyat", { exact: true })).toHaveCount(role === "student" ? 1 : 0);
   } else if (route === "/profile/edit") {
    await expect(page.getByRole("button", { name: "Simpan Profil" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Privasi" })).toHaveCount(role === "student" ? 1 : 0);
   } else {
    await expect(page.locator('a[href="/achievements"]')).toHaveCount(role === "student" ? 1 : 0);
   }
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
   await page.screenshot({ path: info.outputPath("account.png"), fullPage: true, animations: "disabled" });
  });
 }
}

async function capture(page: Page, info: TestInfo, name: string, viewportOnly = false) {
 await expect.poll(() => page.locator("img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
 await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: !viewportOnly, animations: "disabled" });
}

test("populated profile and empty follow list in dark mode", async ({ page }, info) => {
 await page.goto("http://profile-role.local/profile?role=student&populated=1");
 await page.locator("html").evaluate(element => element.classList.add("dark"));
 await expect(page.getByRole("link", { name: "Matematika I", exact: true })).toBeVisible();
 await capture(page, info, "profile-populated");
 await page.getByRole("button", { name: "Pengikut", exact: true }).click();
 await expect(page.getByText("Belum ada pengguna", { exact: true })).toBeVisible();
 await capture(page, info, "followers-empty");
 await expect(page).toHaveURL("http://profile-role.local/profile?role=student&populated=1");
});

test("academic choices remain editable across tabs and save failures", async ({ page }, info) => {
 await page.goto("http://profile-role.local/profile/edit?role=student&fixtureAction=error");
 await page.getByRole("combobox", { name: "Fakultas atau sekolah ITB" }).click();
 await expect(page.getByRole("listbox")).toBeVisible();
 await capture(page, info, "faculty-open", true);
 await page.getByRole("option", { name: /^STEI -/ }).click();
 await expect(page.getByRole("combobox", { name: "Jurusan atau program studi" })).not.toContainText("Matematika");
 await page.getByRole("combobox", { name: "Jurusan atau program studi" }).click();
 await page.getByRole("option", { name: "Teknik Informatika", exact: true }).click();
 await page.getByRole("combobox", { name: "Tahun masuk ITB (angkatan)" }).click();
 await page.getByRole("option", { name: "2025", exact: true }).click();
 await page.getByRole("tab", { name: "Privasi", exact: true }).click();
 await page.getByRole("tab", { name: "Akademis", exact: true }).click();
 await expect(page.getByRole("combobox", { name: "Jurusan atau program studi" })).toContainText("Teknik Informatika");
 await page.getByRole("button", { name: "Simpan profil", exact: true }).click();
 await expect(page.getByRole("alert").filter({ hasText: "Gagal menyimpan profil akademik" })).toBeVisible();
 await expect(page.getByRole("combobox", { name: "Fakultas atau sekolah ITB" })).toContainText("STEI");
 await expect(page.getByRole("combobox", { name: "Jurusan atau program studi" })).toContainText("Teknik Informatika");
 await expect(page.getByRole("combobox", { name: "Tahun masuk ITB (angkatan)" })).toContainText("2025");
 await capture(page, info, "academic-save-error");
 const saves = await page.evaluate(() => (window as any).__profileSaves);
 expect(saves).toEqual([{ kind: "academic", input: { faculty: "STEI", major: "Teknik Informatika", entryYear: "2025" } }]);
 await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete("fixtureAction"); history.replaceState(null, "", url); });
 await page.getByRole("button", { name: "Simpan profil", exact: true }).click();
 await expect(page).toHaveURL("http://profile-role.local/profile");
});

test("privacy draft, badge limit, pending, failure and retry", async ({ page }, info) => {
 await page.goto("http://profile-role.local/profile/edit?role=student&populated=1&section=privacy&fixtureAction=pending");
 await page.locator("html").evaluate(element => element.classList.add("dark"));
 const name = page.getByRole("textbox", { name: "Nama tampilan" });
 await expect(name).toHaveAttribute("placeholder", "Alya Putri Maharani Kusumawardhani");
 await name.fill("  Alya Baru  ");
 await page.getByRole("combobox", { name: "Visibilitas profil" }).click();
 await page.getByRole("option", { name: "Anggota", exact: true }).click();
 await page.getByRole("checkbox", { name: "Tampilkan jurusan", exact: true }).check();
 for (const family of ["Warrior Reader", "Practice Knight", "Memory Guardian"]) await page.getByRole("checkbox", { name: family, exact: true }).check();
 await expect(page.getByRole("checkbox", { name: "Steady Scholar", exact: true })).toBeDisabled();
 await page.getByRole("tab", { name: "Tampilan", exact: true }).click();
 await page.getByRole("tab", { name: "Privasi", exact: true }).click();
 await expect(name).toHaveValue("  Alya Baru  ");
 await capture(page, info, "privacy-draft");
 await name.press("Enter");
 await expect(page.getByRole("button", { name: /^Menyimpan/ })).toBeDisabled();
 await expect(name).toBeDisabled();
 await capture(page, info, "privacy-pending");
 await page.evaluate(() => (window as any).__finishProfileSave());
 await expect(page.getByRole("status").filter({ hasText: "Preferensi profil berhasil disimpan." })).toBeVisible();
 const saves = await page.evaluate(() => (window as any).__profileSaves);
 expect(saves).toHaveLength(1);
 expect(saves[0]).toMatchObject({ kind: "privacy", input: { displayName: "Alya Baru", visibility: "members", showMajor: true, featuredBadgeIds: ["warrior_reader", "practice_knight", "memory_guardian"] } });
 await name.fill("");
 await page.evaluate(() => { const url = new URL(location.href); url.searchParams.set("fixtureAction", "error"); history.replaceState(null, "", url); });
 await page.getByRole("button", { name: "Simpan privasi", exact: true }).click();
 await expect(page.getByRole("alert")).toContainText("Profil tidak dapat disimpan");
 await capture(page, info, "privacy-error");
 await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete("fixtureAction"); history.replaceState(null, "", url); });
 await page.getByRole("button", { name: "Simpan privasi", exact: true }).click();
 await expect(page.getByRole("status").filter({ hasText: "Preferensi profil berhasil disimpan." })).toBeVisible();
 await capture(page, info, "privacy-saved");
 expect(await page.evaluate(() => (window as any).__profileSaves.at(-1).input.displayName)).toBeNull();
 await expect(page).toHaveURL("http://profile-role.local/profile/edit?role=student&populated=1&section=privacy");
});

test("appearance only equips owned cosmetics and can clear each slot", async ({ page }, info) => {
 await page.goto("http://profile-role.local/profile/edit?role=student&populated=1&section=appearance&fixtureAction=error");
 await page.locator("html").evaluate(element => element.classList.add("dark"));
 await page.getByRole("combobox", { name: "Bingkai", exact: true }).click();
 await expect(page.getByRole("option", { name: "Wayang Kencana", exact: true })).toHaveCount(0);
 await expect(page.getByRole("listbox")).toBeVisible();
 await capture(page, info, "frame-open", true);
 await page.getByRole("option", { name: "Samudra", exact: true }).click();
 await page.getByRole("combobox", { name: "Gelar", exact: true }).click();
 await page.getByRole("option", { name: "Gelar pelajar", exact: true }).click();
 await page.getByRole("combobox", { name: "Kulit chat Zyra", exact: true }).click();
 await page.getByRole("option", { name: "Samudra", exact: true }).click();
 await page.getByRole("combobox", { name: "Karakter Zyra", exact: true }).click();
 await page.getByRole("option", { name: "Jalak Bali ceria", exact: true }).click();
 await capture(page, info, "appearance-selected");
 await page.getByRole("button", { name: "Simpan tampilan", exact: true }).click();
 await expect(page.getByRole("alert")).toContainText("Profil tidak dapat disimpan");
 await capture(page, info, "appearance-error");
 await page.getByRole("combobox", { name: "Bingkai", exact: true }).click();
 await page.getByRole("option", { name: "Tidak ada", exact: true }).click();
 for (const label of ["Kulit chat Zyra", "Karakter Zyra"]) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: "Tidak ada", exact: true }).click();
 }
 await page.getByRole("combobox", { name: "Gelar", exact: true }).click();
 await page.getByRole("option", { name: "Tidak ada", exact: true }).click();
 await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete("fixtureAction"); history.replaceState(null, "", url); });
 await page.getByRole("button", { name: "Simpan tampilan", exact: true }).click();
 await expect(page.getByRole("status").filter({ hasText: "Preferensi profil berhasil disimpan." })).toBeVisible();
 await capture(page, info, "appearance-cleared");
 const saves = await page.evaluate(() => (window as any).__profileSaves);
 expect(saves.map((save: any) => save.kind)).toEqual(["appearance", "appearance"]);
 expect(Object.values(saves[1].input)).toEqual([null, null, null, null, null]);
 await expect(page).toHaveURL("http://profile-role.local/profile/edit?role=student&populated=1&section=appearance");
});

test("empty profile preferences explain name fallback and owned cosmetics", async ({ page }, info) => {
 await page.goto("http://profile-role.local/profile/edit?role=student&section=privacy");
 await expect(page.getByRole("textbox", { name: "Nama tampilan" })).toHaveValue("");
 await expect(page.getByText("Belum ada lencana yang diperoleh", { exact: true })).toBeVisible();
 await capture(page, info, "privacy-empty");
 await page.getByRole("tab", { name: "Tampilan", exact: true }).click();
 await page.getByRole("combobox", { name: "Bingkai", exact: true }).click();
 await expect(page.getByRole("option")).toHaveCount(1);
 await page.keyboard.press("Escape");
 await expect(page.getByRole("link", { name: "Koleksi kosmetik" })).toHaveAttribute("href", "/achievements?tab=rewards");
 await capture(page, info, "appearance-empty");
 await expect(page).toHaveURL("http://profile-role.local/profile/edit?role=student&section=appearance");
});

test("student navigation never starts the cross-surface logo animation", async ({ page }, info) => {
 await page.emulateMedia({ reducedMotion: "no-preference" });
 await page.goto("http://profile-role.local/dashboard?role=student&navigation=1");
 await page.evaluate(() => {
  (window as any).__logoOverlays = 0;
  new MutationObserver(records => {
   for (const record of records) for (const node of record.addedNodes) if (node instanceof Element && (node.matches('[class~="z-99999"]') || node.querySelector('[class~="z-99999"]'))) (window as any).__logoOverlays++;
  }).observe(document.body, { childList: true, subtree: true });
 });
 for (const route of ["/achievements", "/profile", "/achievements", "/students/fixture", "/dashboard"]) {
  await page.getByRole("link", { name: route, exact: true }).click();
  await expect(page.getByRole("heading", { name: route, exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("zyx_last_layout_group"))).toBe("student");
  expect(await page.evaluate(() => (window as any).__logoOverlays)).toBe(0);
 }
 await page.getByRole("link", { name: "/achievements", exact: true }).click();
 await expect(page.getByRole("heading", { name: "/achievements", exact: true })).toBeVisible();
 await capture(page, info, "achievements-no-overlay");
 await expect(page).toHaveURL("http://profile-role.local/achievements?role=student&navigation=1");
});
