import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
function compile(source: unknown): { html: string; footer: string } {
  return JSON.parse(execFileSync("bun", ["-e", 'import {compileProductDiktatHtml,PRODUCT_DIKTAT_FOOTER_TEMPLATE} from "./lib/bundle/product-diktat-pdf";import {readFileSync} from "node:fs";console.log(JSON.stringify({html:compileProductDiktatHtml(JSON.parse(readFileSync(0,"utf8"))),footer:PRODUCT_DIKTAT_FOOTER_TEMPLATE}));'], { input: JSON.stringify(source), encoding: "utf8" }));
}
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { inspectDiktatPrintReadiness } from "@/lib/materials/diktat-print-readiness";

test("Admin Diktat uses the cheatsheet layout without losing content across pages", async ({ page }, testInfo) => {
  const markdown = String.raw`## Aljabar dan pertaksamaan
### Faktorisasi dan kuadrat
Untuk $ax^2+bx+c=0$, dengan $a\ne0$:
$$D=b^2-4ac,\qquad x_{1,2}=\frac{-b\pm\sqrt{D}}{2a}$$
Jika $D>0$, ada dua akar real; $D=0$, akar kembar; $D<0$, tidak ada akar real.

## Langkah cepat
1. Pindahkan semua suku ke satu ruas.
2. Faktorkan pembilang dan penyebut.
3. Tandai akar dan titik tak terdefinisi, lalu uji tanda tiap selang.
4. Sertakan batas sesuai tanda pertaksamaan dan buang akar penyebut.

## Contoh kilat
Contoh 1: Pertaksamaan rasional
Selesaikan $\frac{2x-1}{x+2}\le3$, dengan $x\ne-2$.
Penyelesaian:
$$\frac{-x-7}{x+2}\le0\quad\Longrightarrow\quad x\in(-\infty,-7]\cup(-2,\infty)$$

## Jebakan dan miskonsepsi
Miskonsepsi: Kalikan kedua ruas langsung dengan $x+2$.
Koreksi: Tanda $x+2$ bergantung pada $x$. Gunakan uji tanda per selang.

<!-- page-break -->

## Limit dan kekontinuan
### Memilih delta dari epsilon
Untuk $f(x)=2x$ di sekitar $c=0$ dan $L=0$:
$$|f(x)-L|=2|x|,\qquad\delta=\frac{\varepsilon}{2}$$
Syarat: $\varepsilon>0$ dan $0<|x|<\delta$. Nilai $x=0$ dikecualikan dari implikasi limit.

| Bentuk soal | Langkah utama |
|---|---|
| Limit bentuk tak tentu | Faktorkan, gunakan sekawan, atau identitas trigonometri. |
| Kekontinuan fungsi bersambung | Samakan limit kiri, limit kanan, dan nilai fungsi. |

## Cek ingatan
Mengapa nilai fungsi pada titik tidak menentukan nilai limitnya?
`;
  const document = JSON.parse(execFileSync("bun", ["-e", 'import {compileCanonicalDiktatHtml,PRODUCT_DIKTAT_FOOTER_TEMPLATE} from "./lib/bundle/product-diktat-pdf";import {readFileSync} from "node:fs";console.log(JSON.stringify({html:compileCanonicalDiktatHtml("Bab 2: Aljabar, pertaksamaan, fungsi dan limit",readFileSync(0,"utf8")),footer:PRODUCT_DIKTAT_FOOTER_TEMPLATE}));'], { input: markdown, encoding: "utf8" }));
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(String(response.status())); });
  await page.setContent(document.html);
  expect(await page.evaluate(inspectDiktatPrintReadiness)).toEqual([]);
  expect(await page.locator(".diktat").evaluate(element => getComputedStyle(element).columnCount)).toBe("1");
  expect(await page.locator(".diktat-watermark svg").count()).toBe(1);
  await expect(page.locator(".diktat-header")).toHaveText("Bab 2: Aljabar, pertaksamaan, fungsi dan limit");
  await expect(page.locator(".diktat-running-header")).toHaveText("Zyx Academy");
  await page.screenshot({ path: testInfo.outputPath("cheatsheet-admin.png"), fullPage: true });
  if (testInfo.project.name === "laptop-fhd-125") {
    mkdirSync("artifacts/visual-quality/diktat-v4", { recursive: true });
    await page.emulateMedia({ media: "print" });
    await page.setViewportSize({ width: 794, height: 1123 });
    expect(await page.evaluate(inspectDiktatPrintReadiness)).toEqual([]);
    await page.pdf({ path: "artifacts/visual-quality/diktat-v4/admin-cheatsheet.pdf", format: "A4", preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: document.footer });
  }
  expect(errors).toEqual([]);
});

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
      expect(await page.locator('.diktat').evaluate(element=>getComputedStyle(element).columnCount)).toBe('1');
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
