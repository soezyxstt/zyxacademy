import { expect, test } from "@playwright/test";
import { buildFixture } from "./fixtures/interactive-document-build";
import {readFileSync} from "node:fs";
const snapshot=process.env.ARTICLE_STRESS_SNAPSHOT;
test.use({actionTimeout:15_000});
test.skip(!snapshot,"Set ARTICLE_STRESS_SNAPSHOT to an authorized public reader snapshot");
let fixture: Awaited<ReturnType<typeof buildFixture>>;
test.beforeAll(async () => {
 test.setTimeout(180_000);
 if (!snapshot) return;
 fixture = await buildFixture("tests/visual/fixtures/article-math1-production.tsx", "", {
  "@/tests/fixtures/product-learning/article-production-data": `export const article=${readFileSync(snapshot,"utf8")};`,
  "@/hooks/use-query-account": "export const useQueryAccountCurrent=()=>true; export const useSyncQueryAccount=()=>true;",
  "@/hooks/use-article-reading-progress": "import {useRef} from 'react'; export function useArticleReadingProgress(){return {contentContainerRef:useRef(null),sectionProgressMap:{},completeRemaining(){}}}",
  "@/components/course/tutor-drawer": "export const useTutor=()=>({isOpen:false,openExplain(){},openChatWithQuestion(){}});",
  "@/app/actions/tutor": "export async function quickExplainSnippetAction(){throw new Error('Outside visual fixture');}",
 });
});

test("production Math 1 chapter renders all sections locally",async({page},info)=>{
 test.setTimeout(1_800_000);
 const errors:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.emulateMedia({reducedMotion:"reduce",colorScheme:"dark"});
 await page.route("**/*",route=>{
  const url=new URL(route.request().url());
  if(url.origin!=="http://reader.test")return route.abort();
  if(url.pathname==="/fixture.js")return route.fulfill({contentType:"application/javascript",body:fixture.script});
  if(url.pathname==="/fixture.css")return route.fulfill({contentType:"text/css",body:fixture.styles});
  return route.fulfill({contentType:"text/html",body:'<!doctype html><html lang="id" class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'});
 });
 await page.goto("http://reader.test/");
 const sections=page.locator("article[id^=section-]");
 await expect(sections).toHaveCount(16);
 await page.evaluate(async()=>{
  await Promise.all(Array.from(document.fonts).map(font=>font.load()));
  await document.fonts.ready;
 });
 await page.screenshot({path:info.outputPath("screenshots/math1-start.png"),animations:"disabled"});
 const pair=sections.nth(1).locator('[data-math-pair="compact"]').first();
 await expect(pair).toHaveCSS("display","grid");
 const positions=await pair.evaluate(el=>Array.from(el.children).map(child=>child.getBoundingClientRect().x));
 if(page.viewportSize()!.width < 640) expect(positions[1]).toBe(positions[0]);
 else expect(positions[1]).toBeGreaterThan(positions[0]);
 await expect(page.locator("header:visible").first().getByText("0%",{exact:true})).toHaveCount(0);
 const observations=[];
 for(let i=0;i<16;i++){

  const section=sections.nth(i);
  await section.evaluate(el=>el.scrollIntoView({block:"start"}));
  await expect(section).toBeVisible();
  const title=(await section.locator("h2").first().innerText()).trim();
  const headingVisible = await section.locator("h2").first().evaluate(el => el.getBoundingClientRect().bottom > (document.querySelector("header:not([data-mobile-navbar])")?.getBoundingClientRect().bottom ?? 52));
  if (headingVisible) await expect(page.locator("header:visible").first()).not.toContainText(title);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(i===2) await expect(section.locator('[data-block-type="worked_example"]').first().getByRole("heading",{name:"Contoh",exact:true})).toHaveCount(1);
  observations.push(await section.evaluate(el=>({id:el.id,height:el.scrollHeight,width:el.scrollWidth})));
  await page.screenshot({path:info.outputPath(`screenshots/math1-section-${String(i+1).padStart(2,"0")}.png`),animations:"disabled"});
  if (i === 12) {
   const formulaUnit=section.locator('[data-part-kind="math_unit"]').filter({hasText:"h(x)"}).first();
   await expect(formulaUnit).not.toHaveAttribute("data-math-pair","compact");
   const symbolToggle=formulaUnit.getByRole("button",{name:"Keterangan simbol (7)",exact:true});
   await expect(symbolToggle).toBeVisible();
   await expect(symbolToggle).toHaveAttribute("aria-expanded","false");
   await expect(formulaUnit.locator('[data-math-symbols]')).toBeHidden();
   const disclosure=formulaUnit.locator('[data-slot="collapsible-content"]');
   await expect(disclosure).toHaveAttribute("hidden","until-found");
   await formulaUnit.locator('[data-symbol-id]').last().evaluate(el=>el.id="symbol-find-target");
   await page.evaluate(()=>location.hash="symbol-find-target");
   await expect(symbolToggle).toHaveAttribute("aria-expanded","true");
   await symbolToggle.click();
   await symbolToggle.click();
   await expect(symbolToggle).toHaveAttribute("aria-expanded","true");
   await expect(formulaUnit.locator('[data-math-symbols]')).toBeVisible();
   await section.evaluate(el=>el.scrollIntoView({block:"start"}));
   expect((await formulaUnit.locator('[data-math-symbols]').boundingBox())!.y).toBeGreaterThan((await formulaUnit.locator('[data-math-scroll]').first().boundingBox())!.y);
   await page.screenshot({path:info.outputPath("screenshots/math1-section-13-symbols-expanded.png"),animations:"disabled"});
   await symbolToggle.click();
   await expect(symbolToggle).toHaveAttribute("aria-expanded","false");
  }
  await section.locator("h2").first().evaluate(el=>window.scrollBy(0,el.getBoundingClientRect().bottom));
  const passedHeading = await section.locator("h2").first().evaluate(el => el.getBoundingClientRect().bottom <= (document.querySelector("header:not([data-mobile-navbar])")?.getBoundingClientRect().bottom ?? 52));
  if (passedHeading) await expect(page.locator("header:visible").first()).toContainText(title);
  if([4,5,12].includes(i)) {
   await page.screenshot({path:info.outputPath(`screenshots/math1-context-${i+1}.png`),animations:"disabled"});
   const visual=section.locator('[data-part-kind="visual_ref"]').first();
   if(await visual.count()) {
    await visual.scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath(`screenshots/math1-graph-${i+1}.png`),animations:"disabled"});
    if(i===12) {
     const parameters=visual.getByRole("button",{name:"Parameter",exact:true});
     const interaction=visual.getByRole("button",{name:"Interaksi grafik",exact:true});
     expect(await parameters.evaluate(el=>getComputedStyle(el).color)).toBe(await interaction.evaluate(el=>getComputedStyle(el).color));
     const plot=visual.locator('svg[role="img"]');
     const plotTop=await plot.evaluate(el=>el.getBoundingClientRect().top+scrollY);
     await parameters.click();
     await expect.poll(()=>plot.evaluate(el=>el.getBoundingClientRect().top+scrollY)).toBeCloseTo(plotTop,0);
     await expect(parameters).toHaveAttribute("aria-expanded","true");
     const paramLabelFont=await visual.getByText("Geser", {exact:false}).first().evaluate(el=>getComputedStyle(el).fontFamily);
     expect(paramLabelFont).toMatch(/sans-serif/i);
     expect(paramLabelFont).not.toMatch(/(?<!-)serif|\btimes\b|katex|mono/i);
     const slider=visual.getByRole("slider").first();
     const before=await slider.inputValue();
     await slider.focus(); await slider.press("ArrowRight");
     await expect(slider).not.toHaveValue(before);
     const sliders=visual.getByRole("slider");
     await expect(sliders).toHaveCount(3);
     expect(await sliders.first().getAttribute("aria-label")).toContain("k");
     expect(await sliders.nth(1).getAttribute("aria-label")).toContain("a");
     expect(await sliders.nth(2).getAttribute("aria-label")).toContain("c");
     const plotBottom=await plot.evaluate(el=>el.getBoundingClientRect().bottom);
     expect((await sliders.first().boundingBox())!.y).toBeGreaterThan(plotBottom);
     await plot.evaluate(el=>scrollBy(0,el.getBoundingClientRect().top-64));
     expect((await sliders.last().boundingBox())!.y+24).toBeLessThan(page.viewportSize()!.height);
     await page.screenshot({path:info.outputPath("screenshots/math1-parameters.png"),animations:"disabled"});
     await visual.getByRole("button",{name:"Reset parameter",exact:true}).click();
     await expect(slider).toHaveValue(before);
     const table=visual.getByRole("button",{name:"Tabel nilai",exact:true});
     await table.click();
     await interaction.click();
     await expect(visual.locator('[id^="graph-values-"]')).toBeVisible();
     await expect(plot).toHaveAttribute("tabindex","0");
     await plot.evaluate(el=>scrollBy(0,el.getBoundingClientRect().top-64));
     await page.screenshot({path:info.outputPath("screenshots/math1-graph-all-expanded.png"),animations:"disabled"});
     await visual.getByRole("button",{name:"Selesai",exact:true}).click();
     await table.click();
     await parameters.click();
    }
   }
   const example=section.locator('[data-part-kind="worked_example"], [data-block-type="worked_example"]').first();
   if(await example.count()) {
    if(i===4) {
    const formula=example.locator('[data-step-id]').nth(1).locator('[data-content-kind="formula"]');
    await expect(formula).toHaveCount(1);
    await expect(formula.locator('.katex-display > .katex')).toHaveCSS("white-space","nowrap");
    await expect(formula).toHaveCSS("overflow-x","auto");
    await expect(formula).toHaveCSS("padding-right","16px");
    await formula.evaluate(el=>el.style.width="100px");
    await expect(formula).toHaveAttribute("data-math-overflow-right","true");
    await formula.evaluate(el=>el.scrollLeft=el.scrollWidth);
    await expect(formula).not.toHaveAttribute("data-math-overflow-right","true");
    await formula.evaluate(el=>{el.style.width="";el.scrollLeft=0;});

    const lineCenter=await example.locator('ol').first().evaluate(el=>el.getBoundingClientRect().x+parseFloat(getComputedStyle(el,'::before').left)+0.5);
    const marker=await example.locator('[data-step-id] > div:first-child > span').first().boundingBox();
    expect(Math.abs(lineCenter-marker!.x-marker!.width/2)).toBeLessThan(1);
   }
   await example.scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath(`screenshots/math1-example-${i+1}.png`),animations:"disabled"});
   }
   const check=section.locator('[data-article-exercise]').first();
   if(await check.count()) {
    await check.getByRole("button",{name:"Kerjakan",exact:true}).click();
    await check.scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath(`screenshots/math1-check-${i+1}.png`),animations:"disabled"});
   }
  }
 }
 const overflowAudit = await page.locator('[data-math-scroll]').evaluateAll(elements => elements.flatMap(el => {
   const overflowing = el.scrollWidth > el.clientWidth + 2;
   return overflowing && (getComputedStyle(el).overflowX !== "auto" || el.getAttribute("data-math-overflow-right") !== "true") ? [el.textContent?.slice(0,100)] : [];
 }));
 expect(overflowAudit).toEqual([]);
 await expect(page.locator(".katex-error")).toHaveCount(0);
 await expect(page.getByRole("progressbar",{name:"Posisi baca"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Akhir bab",exact:true})).toHaveCount(1);
 await expect(page.getByText("Kamu telah menyelesaikan seluruh materi",{exact:false})).toHaveCount(0);
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
 await page.screenshot({path:info.outputPath("screenshots/math1-end.png"),animations:"disabled"});
 await page.getByRole("button",{name:"Fokus baca",exact:true}).click();
 await expect(page.getByRole("button",{name:"Kerjakan",exact:true})).toHaveCount(0);
 await page.keyboard.press("Escape");
 await expect(page.getByRole("button",{name:"Fokus baca",exact:true})).toBeVisible();
 await info.attach("section-measurements",{body:JSON.stringify(observations,null,2),contentType:"application/json"});
 expect(errors).toEqual([]);
});
