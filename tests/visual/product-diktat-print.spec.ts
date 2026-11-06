import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
function compile(source: unknown): { html: string; footer: string } {
  return JSON.parse(execFileSync("bun", ["-e", 'import {compileProductDiktatHtml,PRODUCT_DIKTAT_FOOTER_TEMPLATE} from "./lib/bundle/product-diktat-pdf";import {readFileSync} from "node:fs";console.log(JSON.stringify({html:compileProductDiktatHtml(JSON.parse(readFileSync(0,"utf8"))),footer:PRODUCT_DIKTAT_FOOTER_TEMPLATE}));'], { input: JSON.stringify(source), encoding: "utf8" }));
}
import { readFileSync, writeFileSync } from "node:fs";

test("Diktat math uses embedded KaTeX fonts and bounded radicals", async ({page}, testInfo) => {
  const errors: string[]=[];
  page.on("pageerror", error=>errors.push(error.message));
  page.on("console", message=>{if(message.type()==="error")errors.push(message.text());});
  page.on("response", response=>{if(response.status()>=400)errors.push(String(response.status()));});
  const article={id:"article",version:1,generationHash:"a".repeat(64)};
  const diktat={title:"Rumus matematika",sourceArticleId:article.id,sourceArticleVersion:1,sourceArticleHash:article.generationHash,contentMarkdown:"## Akar, pecahan, dan pangkat\n\n$$\\sqrt{2} \\notin \\mathbb{Q}$$\n\n$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$\n\n$$d(P,Q)=\\sqrt{(\\Delta x)^2+(\\Delta y)^2}$$\n\n$$\\mathbb{N}\\subset\\mathbb{Z}\\subset\\mathbb{Q}\\subset\\mathbb{R}$$"};
  await page.setContent(compile({article,diktat}).html.replace("<head>", '<head><meta name="viewport" content="width=device-width,initial-scale=1">'));
  await page.evaluate(()=>document.fonts.ready);
  const bodyFont = await page.locator('body').evaluate(element=>parseFloat(getComputedStyle(element).fontSize));
  const mathFonts = await page.locator('.katex').evaluateAll(elements=>elements.map(element=>parseFloat(getComputedStyle(element).fontSize)));
  expect(bodyFont).toBeGreaterThanOrEqual(14);
  expect(Math.min(...mathFonts)).toBeGreaterThanOrEqual(bodyFont);
  expect(await page.evaluate(()=>document.fonts.check('16px "KaTeX_Main"'))).toBe(true);
  const radicalWidths=await page.locator('.sqrt').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().width));
  expect(radicalWidths.length).toBeGreaterThan(0);
  expect(Math.max(...radicalWidths)).toBeLessThan(160);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("math-fonts.png"),fullPage:true});
  if(testInfo.project.name==="laptop-fhd-125") {
    for (const width of [600, 601]) {
      await page.setViewportSize({width,height:864});
      expect(await page.locator('.diktat').evaluate(element=>getComputedStyle(element).columnCount)).toBe(width===600 ? '1' : '2');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({path:testInfo.outputPath(`breakpoint-${width}.png`),fullPage:true});
    }
    const sourcePath=process.env.DIKTAT_PRINT_SOURCE;
    if(sourcePath){
      const compiledDocument = compile(JSON.parse(readFileSync(sourcePath,"utf8")));
      await page.setContent(compiledDocument.html);
      await page.evaluate(()=>document.fonts.ready);
      const pdf=await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:"<span></span>",footerTemplate:compiledDocument.footer,margin:{top:"9mm",bottom:"15mm",left:"12mm",right:"12mm"}});
      writeFileSync("artifacts/diktat-print/corrected-local.pdf",pdf);
    }
  }
});
