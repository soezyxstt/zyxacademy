import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// Isolated real components + real GLBs. Authentication and purchases use separate SQL tests.
// PLAYWRIGHT_BASE_URL=http://mascot-fixture.test bun run test:visual tests/visual/mascot-glb-preview.spec.ts
const origin = "http://mascot-fixture.test";
let script = "", styles = "";
test.setTimeout(90_000);
test.beforeAll(async () => {
  const stylesheet = path.resolve("app/globals.css");
  styles = (await postcss([tailwind()]).process(readFileSync(stylesheet), { from: stylesheet })).css;
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from 'react';
      import { AnimationAction, Mesh } from 'three';
      // Observe real mixer starts and draw submissions inside the isolated fixture.
      const starts = new WeakMap();
      const play = AnimationAction.prototype.play;
      AnimationAction.prototype.play = function() {
        const mixer = this.getMixer();
        const history = starts.get(mixer) || [];
        history.push(this.time === 0 ? this.getClip().name : 'resume');
        if (history.length > 4) history.shift();
        starts.set(mixer, history);
        document.documentElement.dataset.clipStarts = history.join(',');
        return play.call(this);
      };
      const frames = new WeakMap();
      const beforeDraw = Mesh.prototype.onBeforeRender;
      Mesh.prototype.onBeforeRender = function(renderer, scene, ...args) {
        const canvas = renderer.domElement;
        if (this.name.startsWith('Outfit_Graduation_Mesh')) canvas.dataset.drewGraduationGown = 'true';
        if (canvas.dataset.mascotAnimation === 'cycle') {
          const frame = renderer.info.render.frame;
          let draws = frames.get(renderer);
          if (!draws || draws.frame !== frame || draws.scene !== scene) {
            draws = {frame, scene, kit:false, bike:false};
            frames.set(renderer, draws);
          }
          if (this.name === 'Outfit_Sport') draws.kit = true;
          if (this.name.startsWith('Prop_cycle_')) draws.bike = true;
          if (draws.kit && draws.bike) canvas.dataset.drewCyclingKit = 'true';
        }
        return beforeDraw.call(this, renderer, scene, ...args);
      };
      import {createRoot} from 'react-dom/client';
      import {NextIntlClientProvider} from 'next-intl';
      import student from './messages/id/student.json';
      import common from './messages/id/common.json';
      import ui from './messages/id/ui.json';
      import {CosmeticsStudio} from './components/gamification/cosmetics-studio';
      import {RewardList} from './components/gamification/reward-list';
      import {StudentPetStudio} from './components/gamification/student-pet-studio';
      import {ApplicationPage} from './components/application-page';
      import {ProfileMascot} from './components/gamification/profile-mascot';
      import {COSMETIC_CATALOG} from './lib/gamification/catalog';
      const view = new URLSearchParams(location.search).get('view');
      const rewards = COSMETIC_CATALOG.map(item=>({...item,owned:["pet-action-cycle","pet-suit-itb-sport-outfit"].includes(item.id),equipped:false}));
      createRoot(document.getElementById('root')).render(
        <NextIntlClientProvider locale="id" messages={{student,common,ui}}>
          {view==='pet-responsive' ? <div className="flex min-h-screen flex-col overflow-x-clip md:flex-row">
            <aside aria-label="Sidebar" className="hidden w-[248px] shrink-0 border-r md:block" />
            <div className="min-w-0 flex-1">
              <nav data-mobile-navbar="" className="sticky top-0 z-30 flex h-13 items-center border-b bg-background px-3 md:hidden">Pet</nav>
              <main><ApplicationPage><StudentPetStudio rewards={new URLSearchParams(location.search).has('empty') ? [] : rewards.filter(item=>item.active)} balance={0} /></ApplicationPage></main>
            </div>
          </div> : <main className="mx-auto max-w-6xl p-4">
            {view==='rewards' ? <RewardList rewards={rewards} balance={5000} appearance={{name:'Alya'}} />
             : view==='pet' ? <StudentPetStudio rewards={rewards} balance={800} />
             : view==='default-profile' ? <ProfileMascot /> : view==='profile' ? <ProfileMascot cosmeticId="zyra-avatar-studio-crocodile" />
             : <CosmeticsStudio appearance={{name:'Alya'}} />}
          </main>}
        </NextIntlClientProvider>);
    ` },
    bundle: true, write: false, outfile: "mascot-fixture.js", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "mascot-fixture-boundaries", setup(builder) {
      const modules: Record<string, string> = {
        "next/navigation": "export const useRouter=()=>({refresh(){}}); export const usePathname=()=>location.pathname",
        "next/link": "import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}",
        "@/components/providers/locale-provider": "export const useAppLocale=()=>({locale:'id'})",
        "@/app/(student)/achievements/actions": "export const changeReward=async()=>({ok:true})",
      };
      builder.onResolve({ filter: /.*/ }, args => {
        if (args.path === "next/image") return { path: path.resolve("tests/visual/gamification-harness/shims.image.tsx") };
        if (Object.hasOwn(modules, args.path)) return { path: args.path, namespace: "fixture" };
      });
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: modules[args.path], loader: "js", resolveDir: process.cwd() }));
    } }],
  });
  script = result.outputFiles.find(file => file.path.endsWith(".js"))?.text ?? result.outputFiles[0].text;
  styles += "\n" + (result.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "");
});

const errors = new WeakMap<Page, string[]>();
const modelRequests = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const failures: string[] = [], requests: string[] = [];
  errors.set(page, failures); modelRequests.set(page, requests);
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  page.on("request", request => { if (request.url().endsWith(".glb")) requests.push(request.url()); });
  await page.route(`${origin}/**`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith("/gamification/")) {
      const file = path.resolve("public", `.${pathname}`);
      if (!file.startsWith(path.resolve("public/gamification") + path.sep) || !existsSync(file)) return route.fulfill({ status: 404 });
      return route.fulfill({ path: file });
    }
    if (pathname === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: script });
    if (pathname === "/styles.css") return route.fulfill({ contentType: "text/css", body: styles });
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>' });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.evaluate(() => Array.from(document.images).filter(image => !image.complete || !image.naturalWidth).map(image => image.src))).toEqual([]);
  await page.screenshot({ path: info.outputPath(`screenshots/${name}.png`), fullPage: true, animations: "disabled" });
  expect(errors.get(page)).toEqual([]);
}

test("four GLBs and seven actions reuse the selected viewer", async ({ page }, info) => {
  await page.goto(origin);
  const viewer = page.getByTestId("selected-mascot");
  await viewer.scrollIntoViewIfNeeded();
  await expect(viewer.locator('[data-mascot-renderer="webgl"]')).toBeVisible();
  expect(modelRequests.get(page)?.map(url => new URL(url).pathname.split("/").pop())).toEqual(["base-full.glb"]);
  await viewer.locator("canvas").evaluate(canvas => canvas.setAttribute("data-test-identity", "shared"));
  for (const character of ["cat", "tiger", "rhino", "crocodile"]) {
    await page.locator(`[data-mascot-id="zyra-avatar-studio-${character}"]`).click();
    await viewer.scrollIntoViewIfNeeded();
    await expect(viewer.locator('[data-mascot-renderer="webgl"]')).toBeVisible({ timeout: 30_000 });
    await expect(viewer.locator("canvas")).toHaveAttribute("data-mascot-model", `studio-${character}`);
    await expect(viewer.locator("canvas")).toHaveAttribute("data-test-identity", "shared");
    await expect(page.locator("canvas")).toHaveCount(1);
    await capture(page, info, character);
  }
  const actions = ["Diam", "Senang", "Berpikir", "Menunggu", "Menjelaskan", "Meminta maaf", "Jempol"];
  const names = ["idle", "happy", "thinking", "waiting", "explaining", "apologizing", "thumbsUp"];
  for (let index = 0; index < actions.length; index++) {
    await page.getByTestId("mascot-animation-select").click();
    await page.getByRole("option", { name: actions[index], exact: true }).click();
    await expect(viewer.locator("canvas")).toHaveAttribute("data-mascot-animation", names[index]);
  }
  await capture(page, info, "crocodile-action");
  await page.locator("#studio-motion").click();
  await expect(page.getByTestId("mascot-animation-select")).toBeDisabled();
  await capture(page, info, "motion-off");
  await page.locator('[data-mascot-id="zyra-avatar-komodo"]').click();
  await viewer.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("mascot-animation-select")).toHaveCount(0);
  await expect(viewer.locator("canvas")).toHaveAttribute("data-mascot-model", "komodo");
  await capture(page, info, "legacy-selection");
  expect(modelRequests.get(page)?.length).toBe(4);
});

test("shop thumbnails stay images until the selected preview opens", async ({ page }, info) => {
  await page.goto(`${origin}/?view=rewards`);
  await page.getByRole("button", { name: "Maskot Zyra", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(modelRequests.get(page)).toEqual([]);
  await capture(page, info, "shop-posters");
  const trigger = page.getByRole("button", { name: "Lihat Buaya", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('[data-mascot-renderer="webgl"]')).toBeVisible({ timeout: 30_000 });
  await capture(page, info, "shop-selected-preview");
  await page.keyboard.press("Escape");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("the shop lists all 15 suits and their LP prices", async ({ page }, info) => {
  await page.goto(`${origin}/?view=rewards`);
  const trigger = page.getByRole("button", { name: "Pakaian maskot studio", exact: true });
  await trigger.click();
  const suits = page.locator(`[id="${await trigger.getAttribute("aria-controls")}"]`).getByRole("listitem");
  await expect(suits).toHaveCount(15);
  const gown = suits.filter({ hasText: "Toga wisuda" });
  await expect(gown).toContainText("900 LP");
  await expect(gown.getByRole("button", { name: "Beli" })).toBeEnabled();
  expect(modelRequests.get(page)).toEqual([]);
  await capture(page, info, "shop-suits");
});

test("pet studio previews a new suit even when the balance is too low to buy it", async ({ page }, info) => {
  await page.goto(`${origin}/?view=pet`);
  await page.getByRole("tab", { name: "Pakaian" }).click();
  const suits = page.getByRole("tabpanel").getByRole("listitem");
  await expect(suits).toHaveCount(15);
  const gown = suits.filter({ hasText: "Toga wisuda" });
  await expect(gown.getByRole("button", { name: "Beli" })).toBeDisabled();
  await gown.scrollIntoViewIfNeeded();
  await capture(page, info, "pet-suits");
  const trigger = gown.getByRole("button", { name: "Coba Toga wisuda" });
  await trigger.click();
  const preview = page.getByRole("dialog");
  await expect(preview.locator("canvas")).toHaveAttribute("data-drew-graduation-gown", "true", { timeout: 30_000 });
  await capture(page, info, "pet-graduation-preview");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("pet studio keeps collection tabs in their panel across screen sizes", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-380";
  const widths = mobile ? [380, 768, 820] : [1536];
  await page.goto(`${origin}/?view=pet-responsive`);
  const collection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Koleksi pet" }) });
  const tabs = collection.getByRole("tablist");
  const activePet = page.getByRole("region", { name: "Pet aktif" });
  for (const width of widths) {
    await page.setViewportSize({ width, height: mobile ? 844 : 864 });
    const panel = await collection.boundingBox();
    const tabBar = await collection.locator('[data-slot="tabs-list"]').boundingBox();
    const viewer = await activePet.boundingBox();
    expect(tabBar!.x).toBeGreaterThanOrEqual(panel!.x);
    expect(tabBar!.x + tabBar!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 1);
    if (width < 1000) {
      expect(panel!.y).toBeGreaterThanOrEqual(viewer!.y + viewer!.height);
    } else {
      expect(panel!.x).toBeGreaterThanOrEqual(viewer!.x + viewer!.width);
    }
    for (const [tab, count] of [["Maskot", 4], ["Pakaian", 15], ["Aksi", 5]] as const) {
      await tabs.getByRole("tab", { name: tab, exact: true }).click();
      await expect(collection.getByRole("tabpanel").getByRole("listitem")).toHaveCount(count);
      await capture(page, info, `pet-${width}-${tab.toLowerCase()}`);
    }
  }
});

test("pet studio shows free Zyra and explains empty tabs before the catalog is seeded", async ({ page }, info) => {
  await page.goto(`${origin}/?view=pet-responsive&empty=1`);
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await expect(panel.getByRole("button", { name: "Coba Zyra" })).toBeEnabled();
  await capture(page, info, "pet-unseeded-zyra");
  for (const tab of ["Pakaian", "Aksi"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(panel.getByText("Belum ada item yang tersedia.")).toBeVisible();
    await capture(page, info, `pet-unseeded-${tab.toLowerCase()}`);
  }
});

test("profile loads its equipped character", async ({ page }, info) => {
  await page.goto(`${origin}/?view=profile`);
  await expect(page.locator('[data-mascot-renderer="webgl"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("canvas")).toHaveAttribute("data-mascot-model", "studio-crocodile");
  await capture(page, info, "profile");
});

test("bad asset keeps the poster and lets the same selection retry", async ({ page }, info) => {
  await page.route("**/crocodile-full.glb", route => route.fulfill({ status: 200, contentType: "model/gltf-binary", body: "invalid GLB" }), { times: 1 });
  await page.goto(`${origin}/?view=profile`);
  await expect(page.getByRole("status")).toHaveText("3D tidak tersedia");
  await capture(page, info, "asset-fallback");
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(page.locator('[data-mascot-renderer="webgl"]')).toBeVisible({ timeout: 30_000 });
  await capture(page, info, "asset-retry");
});

test("WebGL unavailable leaves a usable poster", async ({ page }, info) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto(`${origin}/?view=profile`);
  await expect(page.getByRole("status")).toHaveText("3D tidak tersedia");
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(modelRequests.get(page)).toEqual([]);
  await capture(page, info, "webgl-fallback");
});

test("free profile cat uses the full-body poster", async ({page}) => {
  await page.goto(origin + "/?view=default-profile");
  await expect(page.locator("img")).toHaveAttribute("src", /posters\/cat\.webp/);
  expect(modelRequests.get(page)).toEqual([]);
});

test("practice combines independently owned kit and cycling", async ({page}, info) => {
  await page.clock.install({time: new Date("2026-01-01T00:00:00Z")});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto(origin + "/?view=rewards");
  const play = page.getByRole("button", {name: "Latihan berhitung"});
  await play.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", {name:"Pakaian maskot studio"}).click();
  await expect(page.getByRole("option", {name:"Baju astronaut"})).toHaveCount(0);
  await page.getByRole("option", {name:"Seragam olahraga"}).click();
  await dialog.getByRole("combobox", {name:"Aksi"}).click();
  await expect(page.getByRole("option", {name:"Lompat"})).toHaveCount(0);
  await page.getByRole("option", {name:"Bersepeda"}).click();
  const canvas = dialog.locator("canvas");
  await expect(canvas).toHaveAttribute("data-mascot-animation", "cycle", {timeout:30000});
  const trace = page.locator("html");
  await expect(canvas).toHaveAttribute("data-drew-cycling-kit", "true");
  await capture(page, info, "practice-cycle-kit");
  const prompt = dialog.locator('p[aria-live="polite"]');
  const [left, right] = (await prompt.innerText()).match(/\d+/g)!.map(Number);
  const answer = String(left * right);
  const choices = dialog.getByRole("group").getByRole("button");
  const wrong = (await choices.allTextContents()).find(choice => choice !== answer)!;
  await dialog.getByRole("button", {name:wrong, exact:true}).click();
  await expect(dialog.getByRole("status")).toContainText("Benar 0");
  await page.clock.pauseAt(new Date("2026-01-02T00:00:00Z"));
  await dialog.getByRole("button", {name:answer, exact:true}).dispatchEvent("click");
  await expect(canvas).toHaveAttribute("data-mascot-animation", "happy");
  await expect(trace).toHaveAttribute("data-clip-starts", /cycle,happy$/);
  const [nextLeft, nextRight] = (await prompt.innerText()).match(/\d+/g)!.map(Number);
  await dialog.getByRole("button", {name:String(nextLeft * nextRight), exact:true}).dispatchEvent("click");
  await expect(trace).toHaveAttribute("data-clip-starts", /cycle,happy,happy$/);
  await expect(dialog.getByRole("status")).toContainText("Benar 2");
  await page.clock.fastForward(1500);
  await expect(canvas).toHaveAttribute("data-mascot-animation", "cycle");
  await page.clock.resume();
  await page.keyboard.press("Escape");
  await expect(play).toBeFocused();
});
