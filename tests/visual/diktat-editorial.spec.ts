import { expect, test } from "@playwright/test";
import { buildFixture } from "./fixtures/interactive-document-build";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
let fixture: Awaited<ReturnType<typeof buildFixture>>;
test.beforeAll(async () => {
  test.setTimeout(180_000);
  const { bundle } = buildLocalVerificationFixture();
  const diktat = bundle.products.find(product => product.productType === "diktat");
  if (diktat?.productType !== "diktat") throw new Error("DIKTAT_REQUIRED");
  fixture = await buildFixture("tests/visual/fixtures/diktat-editorial.tsx", "", {
    "@/tests/fixtures/product-learning/diktat-editorial-data": `export const bundleBody=${JSON.stringify(diktat.contentMarkdown)};`,
    "@/components/student-experience-provider": "export const useStudentExperience=()=>({mode:'full',baseline:[],ready:true,href:path=>path});",
    "@/hooks/use-query-account": "export const useQueryAccountCurrent=()=>true;export const useSyncQueryAccount=()=>true;",
    "@/hooks/use-material-reading-progress": "import {useState} from 'react';export function useMaterialReadingProgress(){const [done,setDone]=useState(false);return {done,markDone:()=>setDone(true),markingDone:false};}",
    "@/components/course/tutor-drawer": "const tutor={openExplain(){},openChatWithQuestion(){}};export const useTutor=()=>tutor;",
    "@/app/actions/tutor": "export async function quickExplainSnippetAction(){throw new Error('Outside fixture');}",
    "@/lib/learning-context-actions": "export async function getConceptPopover(){throw new Error('Outside fixture');}",
    "next/navigation": "const params=new URLSearchParams();export const useSearchParams=()=>params;export const usePathname=()=>location.pathname;export const useRouter=()=>({push(){},replace(){}});",
  });
});
for (const source of ["layout", "bundle"]) test(`Diktat editorial ${source} preserves reading and navigation`, async ({page}, info) => {
  const errors: string[]=[];
  page.on("pageerror", error=>errors.push(error.message));
  page.on("console", message=>{if(message.type()==="error")errors.push(message.text());});
  await page.emulateMedia({reducedMotion:"reduce",colorScheme:"dark"});
  await page.route("http://diktat.test/**",route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==="/fixture.js")return route.fulfill({contentType:"application/javascript",body:fixture.script});
    if(path==="/fixture.css")return route.fulfill({contentType:"text/css",body:fixture.styles});
    return route.fulfill({contentType:"text/html",body:'<!doctype html><html lang="id" class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'});
  });
  await page.goto(`http://diktat.test/${source}`);
  const paper=page.locator("#article-paper-content");
  await expect(paper).toBeVisible();
  await expect(paper.getByRole("heading",{name:"Bab 2: Fungsi dan Limit",exact:true})).toBeVisible();
  await expect(paper.getByText("Diktat materi",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("progressbar",{name:"Posisi baca"})).toBeVisible();
  await expect(page.getByRole("button",{name:/Unduh/})).toHaveCount(0);
  await expect(paper.getByText("Selesai Bagian",{exact:false})).toHaveCount(0);
  await expect(paper.locator(".formula-focus .katex-display").first()).toHaveCSS("text-align", "left");
  await expect(paper.locator(".formula-focus .katex-display > .katex").first()).toHaveCSS("text-align", "left");
  const proseFont = await paper.locator("p").first().evaluate(el => getComputedStyle(el).fontFamily);
  expect(proseFont).toMatch(/sans-serif/i);
  expect(proseFont).not.toMatch(/(?<!-)serif|\btimes\b|katex/i);
  if (page.viewportSize()!.width >= 1024) {
    const navTitle = await page.locator("header h1").first().boundingBox();
    const docTitle = await paper.locator("h1").first().boundingBox();
    expect(Math.abs(navTitle!.x - docTitle!.x)).toBeLessThanOrEqual(2);
  }
  if(source==="bundle") {
    await expect(paper.getByRole("heading",{name:"Menghubungkan toleransi input dan keluaran",exact:true})).toBeVisible();
    await expect(paper).toContainText("Jarak keluaran selalu dua kali jarak input.");
    await expect(paper).toContainText("Nilai pusat dikecualikan dalam implikasi limit.");
  } else await expect(paper.locator("[data-section-idx]")).toHaveCount(14);
  await page.evaluate(async()=>document.fonts.ready);
  const capture=async(state:string)=>{
    await page.mouse.move(0,0);
    expect(await paper.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`screenshots/diktat-${source}-${state}.png`),animations:"disabled"});
  };
  await capture("start");
  const canScroll = await paper.evaluate(el=>el.scrollHeight > el.clientHeight);
  await paper.evaluate(el=>el.scrollTo(0,el.scrollHeight));
  await expect.poll(async()=>Number(await page.getByRole("progressbar").getAttribute("aria-valuenow"))).toBe(canScroll ? 100 : 0);
  if(source==="layout") {
    const heading=paper.locator("[data-section-idx]").last().locator("h2");
    const passed=await heading.evaluate(el=>el.getBoundingClientRect().bottom <= document.getElementById("article-paper-content")!.getBoundingClientRect().top);
    if(passed) await expect(page.locator("header").first()).toContainText("14. Ringkasan bab");
    else await expect(page.locator("header").first()).not.toContainText("14. Ringkasan bab");
  }
  await expect(paper.getByRole("link",{name:"Jelajahi materi berikutnya"})).toHaveAttribute("href","/courses/math/material");
  await expect(paper.getByRole("heading",{name:"Akhir bab",exact:true})).toBeVisible();
  await capture("end");
  await paper.getByRole("button",{name:/Tandai|Simpan/}).click();
  await expect(paper.getByRole("heading",{name:"Akhir bab",exact:true})).toHaveCount(0);
  await capture("completed");
  await expect(page.locator(".katex-error")).toHaveCount(0);
  expect(errors).toEqual([]);
});
