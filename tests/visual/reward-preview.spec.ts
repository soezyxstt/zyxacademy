import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";
import { build } from "esbuild";

let script: string;
let styles: string;
test.beforeAll(async () => {
  const stylesheet = resolve("app/globals.css");
  styles = (await postcss([tailwind()]).process(readFileSync(stylesheet), { from: stylesheet })).css;
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider } from 'next-intl';
      import student from './messages/id/student.json';
      import { RewardList } from './components/gamification/reward-list';
      const params = new URLSearchParams(location.search);
      const rewards = [
        {id:'frame-classic',name:'Frame',slot:'frame',priceLp:10,owned:true,equipped:true},
        {id:'frame-detailed',name:'Frame',slot:'frame',priceLp:20,owned:true,equipped:false},
        {id:'theme-academy',name:'Theme',slot:'theme',priceLp:100,owned:false,equipped:false},
        {id:'title-scholar',name:'Title',slot:'title',priceLp:5,owned:false,equipped:false},
        {id:'unknown-frame',name:'Bingkai lain',slot:'frame',priceLp:5,owned:false,equipped:false},
      ];
      const appearance = {name:'Nara',image:params.get('mode') === 'photo' ? '/photo.png' : null,mode:params.get('mode') === 'photo' ? 'photo' : 'badge',badge:{family:'warrior_reader',tier:2},frameId:'frame-classic',themeId:'theme-academy'};
      createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale="id" messages={{student}}><main className="p-4"><RewardList rewards={params.has('empty') ? [] : rewards} balance={50} appearance={appearance} /></main></NextIntlClientProvider>);
    ` }, bundle: true, write: false, format: "iife", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{
      name: "reward-boundaries", setup(builder) {
        const modules: Record<string, string> = {
          "next/navigation": "export const useRouter=()=>({refresh(){}})",
          "next/link": "import React from 'react'; export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}",
          "next/image": "import React from 'react'; export default function Image(props){return React.createElement('img',props)}",
          "@/app/(student)/achievements/actions": "export const changeReward=()=>new Promise(resolve=>{window.finishReward=resolve})",
          "@/components/providers/locale-provider": "export const useAppLocale=()=>({locale:'id'})",
        };
        builder.onResolve({ filter: /^(next\/(navigation|link|image)|@\/app\/\(student\)\/achievements\/actions|@\/components\/providers\/locale-provider)$/ }, args => ({ path: args.path, namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: modules[args.path], loader: "js" }));
      },
    }] });
  script = bundle.outputFiles[0].text;
});

for (const mode of ["photo", "badge", "empty"]) {
  test(`reward preview ${mode}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/gamification/**", route => {
      const path = new URL(route.request().url()).pathname;
      const contentType = path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".webp") ? "image/webp" : "image/png";
      return route.fulfill({ contentType, body: readFileSync(`public${path}`) });
    });
    await page.route("**/photo.png", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="teal"/></svg>' }));
    await page.route(/^http:\/\/fixture\.test\/\?/, route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>' }));
    await page.goto(`http://fixture.test/?${mode === "empty" ? "empty=1" : `mode=${mode}`}`);
    await page.addStyleTag({ content: styles });
    await page.addScriptTag({ content: script });
    const capture = async (state: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${mode}-${state}.png`), fullPage: true, animations: "disabled" });
    };
    if (mode === "empty") await expect(page.getByText("Belum ada hadiah")).toBeVisible();
    else {
      await expect(page.getByRole("button", { name: "Dipakai" })).toBeDisabled();
      await expect(page.getByText("Dimiliki")).toBeVisible();
      await page.getByRole("button", { name: "Tema profil" }).click();
      await expect(page.getByText("Saldo tidak cukup")).toBeVisible();
      await capture("initial");
      await page.getByRole("button", { name: "Pakai", exact: true }).click();
      await expect(page.getByRole("button", { name: "Tunggu" })).toBeDisabled();
      await capture("pending");
      await page.evaluate(() => (window as any).finishReward({ ok: false }));
      await expect(page.getByRole("alert")).toHaveText("Hadiah belum dapat diperbarui. Coba lagi.");
      await capture("error");
      await page.getByRole("button", { name: "Pakai", exact: true }).click();
      await page.evaluate(() => (window as any).finishReward({ ok: true }));
      await expect(page.getByRole("status")).toHaveText("Hadiah diperbarui");
    }
    await capture(mode === "empty" ? "empty" : "success");
    expect(errors).toEqual([]);
  });
}
