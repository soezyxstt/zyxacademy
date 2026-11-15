import { expect, test } from "@playwright/test";
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
 export const student = new URLSearchParams(location.search).get('role') === 'student';
 export const user = { id:'fixture-account', name:'Alya Putri Maharani Kusumawardhani', email:'alya@example.test', faculty:'FMIPA', major:'Matematika', entryYear:2024 };
 export const auth = { api:{ getSession:async()=>({user}) } };
 export const getStudentGamificationAccess = async()=>student?{user}:null;
 export const headers = async()=>new Headers();
 export const db = { select:()=>({from:()=>({where:()=>({limit:async()=>[user]})})}) };
 export const createMetadata=()=>({}); export const pageTitle=x=>x;
 const guard = value => async()=>{if(!student)throw Error('Forbidden');return value;};
 export const getStudentSocialSettings=guard({publicId:null,displayName:null,visibility:'private',showMajor:false,showFaculty:false,allowFollows:false,leaderboardOptIn:false,avatarBadgeId:null,avatarMode:'photo',badgeTier:null,featuredBadgeIds:[]});
 export const getAchievementBadges=guard([]), getGamificationRewards=guard([]);
 export const getGamificationSummary=guard({rankKey:'rakyat',baseXpMicro:0,bonusXpMicro:0,lpBalance:0});
 export const listStudentEnrollments=guard([]);
 export const getPrivateProfileAggregates=guard({completedCount:0,submissionCount:0,averageScore:null});
`;

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
  (async()=>{const page=location.pathname.endsWith('/edit')?await Edit():location.pathname==='/dashboard'?await GamificationDashboardSummary({userId:'fixture-account'}):await Profile();
   createRoot(document.getElementById('root')).render(<main>{page}</main>);document.documentElement.dataset.ready='true';})();
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
   contents: args.path === "schema" ? "export const user={id:'fixture-account'};" : args.path === "mascot-scene" ? "export default function Scene(){return null;}" : serverFixture,
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
   const errors: string[] = [];
   page.on("pageerror", error => errors.push(error.message));
   page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
   page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
   await page.route("http://profile-role.local/**", async request => {
    const pathname = new URL(request.request().url()).pathname;
    if (pathname === "/fixture.js") return request.fulfill({ contentType: "application/javascript", body: Buffer.from(bundle) });
    if (pathname === "/styles.css") return request.fulfill({ contentType: "text/css", body: styles });
    if (pathname.startsWith("/gamification/")) {
     const file = path.resolve(root, "public", `.${pathname}`);
     if (!file.startsWith(path.join(root, "public/gamification") + path.sep)) throw Error("INVALID_FIXTURE_ASSET");
     return request.fulfill({ path: file });
    }
    return request.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>' });
   });
   await page.emulateMedia({ reducedMotion: "reduce" });
   await page.goto(`http://profile-role.local${route}?role=${role}`);
   await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
   await expect(page).toHaveURL(`http://profile-role.local${route}?role=${role}`);
   if (route === "/profile") {
    await expect(page.getByRole("heading", { name: "Alya Putri Maharani Kusumawardhani" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit Profil" })).toBeVisible();
    await expect(page.getByText("rakyat", { exact: true })).toHaveCount(role === "student" ? 1 : 0);
   } else if (route === "/profile/edit") {
    await expect(page.getByRole("button", { name: "Simpan Profil" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Identitas dan privasi" })).toHaveCount(role === "student" ? 1 : 0);
   } else {
    await expect(page.locator('a[href="/achievements"]')).toHaveCount(role === "student" ? 1 : 0);
   }
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
   await page.screenshot({ path: info.outputPath("account.png"), fullPage: true, animations: "disabled" });
   expect(errors).toEqual([]);
  });
 }
}
