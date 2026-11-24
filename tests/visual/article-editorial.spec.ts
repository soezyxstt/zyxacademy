import { expect, test } from "@playwright/test";
import { buildFixture } from "./fixtures/interactive-document-build";
let fixture: Awaited<ReturnType<typeof buildFixture>>;
test.beforeAll(async () => {
 test.setTimeout(180_000);
 fixture = await buildFixture("tests/visual/fixtures/article-editorial.tsx", "", {
  "@/hooks/use-query-account": "export const useQueryAccountCurrent=()=>true; export const useSyncQueryAccount=()=>true;",
  "@/hooks/use-article-reading-progress": "import {useRef} from 'react'; export function useArticleReadingProgress(){return {contentContainerRef:useRef(null),sectionProgressMap:{},completeRemaining(){}}}",
  "@/components/course/tutor-drawer": "export const useTutor=()=>({isOpen:false,openExplain(){},openChatWithQuestion(){}});",
  "@/app/actions/tutor": "export async function quickExplainSnippetAction(){throw new Error('Outside visual fixture');}",
 });
});

test("editorial reader preserves answers across disclosure and reading focus", async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.route("**/api/auth/get-session*", route => route.fulfill({ json: null }));

  await page.route("http://reader.test/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: fixture.styles });
    if (path === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: fixture.script });
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id" class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>' });
  });
  let finishReveal: (() => Promise<void>) | undefined;
  let revealAttempts = 0;
  await page.route("**/api/materials/formative-check/reveal", route => {
    if (++revealAttempts === 1) return route.fulfill({json:null});
    finishReveal = () => route.fulfill({json:{answer:"Rasional dan irasional",explanation:"Penyebut harus bukan nol."}});
  });
  let attempts = 0;
  let finishEvaluation: (() => Promise<void>) | undefined;
  await page.route("**/api/materials/formative-check/evaluate", route => {
    if (++attempts === 1) return route.fulfill({ json: { ok: false, error: "Pemeriksaan belum tersedia. Coba lagi." } });
    if (attempts === 2) return route.fulfill({ json: { ok: true, result: { verdict: "incorrect", feedback: "Akar dua bukan bilangan rasional.", canRetry: true, revealAllowed: true } } });
    finishEvaluation = () => route.fulfill({ json: { ok: true, result: { verdict: "correct", feedback: "Klasifikasi tepat.", canRetry: true, revealAllowed: true } } });
  });
  await page.goto("http://reader.test/");
  const check = page.locator("#block-real-4");
  await expect(check.getByRole("button", { name: "Kerjakan" })).toBeVisible();
  await expect(check.getByRole("textbox")).toBeHidden();
  await expect(page.locator("[data-part-kind=visual_ref] svg[role=img]")).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  const capture = async (name: string) => {
    await page.mouse.move(0, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (name !== "editorial-context") {
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator("header").first()).toContainText("Bilangan dan fungsi");
      await expect(page.locator("header").first()).not.toContainText("01 Bilangan real");
    }
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: info.outputPath(`screenshots/${name}.png`), fullPage: name !== "editorial-context", animations: "disabled" });
  };
  const proseFont = await page.locator("#article-reading-content p").first().evaluate(el => getComputedStyle(el).fontFamily);
  expect(proseFont).toMatch(/sans-serif/i);
  expect(proseFont).not.toMatch(/(?<!-)serif|\btimes\b|katex/i);
  if (page.viewportSize()!.width >= 1024) {
    const navTitle = await page.locator("header h1").first().boundingBox();
    const content = await page.locator("#article-reading-content").boundingBox();
    expect(Math.abs(navTitle!.x - content!.x)).toBeLessThanOrEqual(2);
  }
  await expect(page.getByRole("button", { name: "Tampilkan tabel nilai", exact: true })).toHaveCount(0);
  const tableToggle = page.getByRole("button", { name: "Tabel nilai", exact: true });
  const plot = page.locator("[data-part-kind=visual_ref] svg[role=img]");
  const plotTop = await plot.evaluate(el => el.getBoundingClientRect().top + scrollY);
  await tableToggle.click();
  expect(await plot.evaluate(el => el.getBoundingClientRect().top + scrollY)).toBeCloseTo(plotTop, 0);
  const panel = page.locator("[id^=graph-values-]");
  expect(await panel.evaluate(el => el.getBoundingClientRect().top + scrollY)).toBeGreaterThan(plotTop);
  await expect(panel.locator("table").last().locator("tbody tr")).toHaveCount(5);
  await expect(panel.locator("table").last().locator("tbody tr").first()).toContainText(/[?-]2/);
  await expect(tableToggle).toHaveText("TabelTabel nilai");
  await expect(page.locator("[id^=graph-values-] table")).toHaveCount(2);
  await expect(page.locator("[id^=graph-values-] table").first()).toBeVisible();
  const tables = panel.locator("table");
  for (const table of await tables.all()) {
    await expect(table).toHaveCSS("table-layout", "fixed");
    await expect(table.locator("th").first()).toHaveCSS("text-align", "left");
    await expect(table.locator("td").first()).toHaveCSS("text-align", "left");
  }
  const topColumn = await tables.first().locator("th").last().boundingBox();
  const bottomColumn = await tables.last().locator("th").last().boundingBox();
  expect(topColumn!.x).toBeCloseTo(bottomColumn!.x, 0);
  expect(topColumn!.width).toBeCloseTo(bottomColumn!.width, 0);
  await capture("editorial-values");
  await tableToggle.click();
  await expect(page.getByRole("link", { name: "Jelajahi materi berikutnya" })).toHaveAttribute("href", "/courses/math/material");
  await expect(page.locator("aside").getByRole("button", { name: "Jangan hilangkan syarat" })).toHaveCount(0);
  await expect(page.locator('[data-math-layout="comparison"] .katex-display').first()).toHaveCSS("text-align", "left");
  await expect(page.locator('#block-example-0 .katex-display').first()).toHaveCSS("text-align", "left");
  const graphMode = page.getByRole("button", { name: "Interaksi grafik", exact: true });
  await graphMode.click();
  await expect(page.getByRole("button", { name: "Selesai", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(graphMode).toBeFocused();
  const quizAction = check.getByRole("button", { name: "Kerjakan", exact: true });
  const headingBox = await check.getByRole("heading").boundingBox();
  const actionBox = await quizAction.boundingBox();
  expect(actionBox!.x).toBeGreaterThan(headingBox!.x + headingBox!.width);
  expect(actionBox!.y).toBeLessThan(headingBox!.y + headingBox!.height);
  await expect(page.getByRole("progressbar", { name: "Posisi baca" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Jelajahi materi berikutnya" })).toHaveAttribute("data-variant", "default");
  await expect(page.getByRole("button", { name: "Tandai selesai", exact: true })).toHaveAttribute("data-variant", "outline");
  await capture("editorial-collapsed");
  await check.getByRole("button", { name: "Kerjakan" }).focus();
  await page.keyboard.press("Enter");
  await check.getByRole("textbox").fill("Rasional dan irasional");
  await expect(page.locator("header").first()).toContainText("01 Bilangan real");
  await capture("editorial-open");
  const extra = page.getByRole("button", { name: /(?:Lihat|Sembunyikan) contoh tambahan/ });
  await extra.click();
  await expect(page.locator("#block-example-1 ol")).toBeVisible();
  await expect(extra).toHaveAccessibleName("Sembunyikan contoh tambahan");
  await expect(extra).toHaveCSS("padding-right", "12px");
  await expect(page.locator("#block-example-1 [data-slot=collapsible-content]")).toHaveCSS("border-left-width", "0px");
  await capture("editorial-extra");
  await tableToggle.click();
  await expect(page.locator("[id^=graph-values-] table").first()).toBeVisible();
  await expect(check.getByRole("textbox")).toBeVisible();
  await expect(page.locator("#block-example-1 ol")).toBeVisible();
  const modeBox = await graphMode.boundingBox();
  const tableBox = await tableToggle.boundingBox();
  expect(Math.abs(modeBox!.y - tableBox!.y)).toBeLessThan(2);
  await capture("editorial-all-expanded");
  await tableToggle.click();
  await extra.click();
  await check.getByRole("button", { name: "Tutup latihan" }).click();
  await check.getByRole("button", { name: "Kerjakan" }).click();
  await expect(check.getByRole("textbox")).toHaveValue("Rasional dan irasional");
  await page.getByRole("button", { name: "Fokus baca", exact: true }).click();
  await expect(check).toBeHidden();
  await capture("editorial-focus");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Fokus baca", exact: true })).toBeFocused();
  await expect(check.getByRole("textbox")).toHaveValue("Rasional dan irasional");
  await check.getByRole("button", { name: /Periksa|Kirim/ }).click();
  await expect(check.getByRole("alert")).toContainText("Coba lagi.");
  await capture("editorial-error");
  await check.getByRole("button", { name: "Tutup latihan" }).click();
  await check.getByRole("button", { name: "Kerjakan" }).click();
  await expect(check.getByRole("textbox")).toHaveValue("Rasional dan irasional");
  await check.getByRole("button", { name: /Periksa|Kirim/ }).click();
  await expect(check.getByText("Akar dua bukan bilangan rasional.")).toBeVisible();
  await graphMode.click();
  const interactivePlot = page.locator("[data-part-kind=visual_ref] svg[role=img]");
  await expect(interactivePlot).toHaveAttribute("tabindex", "0");
  await interactivePlot.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Selesai", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  await expect(check.getByRole("button", { name: "Periksa jawaban", exact: true })).toHaveCount(0);
  const answerBounds = await check.getByRole("textbox").boundingBox();
  const resultBounds = await check.getByRole("status").boundingBox();
  const retryBounds = await check.getByRole("button", { name: "Coba lagi", exact: true }).boundingBox();
  expect(resultBounds!.y).toBeGreaterThan(answerBounds!.y + answerBounds!.height);
  expect(resultBounds!.y + resultBounds!.height).toBeLessThan(retryBounds!.y);
  await expect(page.getByText("Geser untuk eksplorasi", {exact:true})).toBeVisible();
  await capture("editorial-interaction-incorrect");
  await check.getByRole("button",{name:"Buka jawaban dan pembahasan",exact:true}).click();
  await expect(check.getByRole("alert")).toContainText("Pembahasan tidak dapat dibuka.");
  await capture("editorial-reveal-error");
  await check.getByRole("button",{name:"Buka jawaban dan pembahasan",exact:true}).click();
  await expect(check.getByRole("button",{name:"Coba lagi",exact:true})).toBeDisabled();
  await capture("editorial-revealing");
  await expect.poll(()=>Boolean(finishReveal)).toBe(true);
  await finishReveal!();
  await expect(check.getByText("Penyebut harus bukan nol.",{exact:true})).toBeVisible();
  await capture("editorial-revealed");
  await check.getByRole("button",{name:"Sembunyikan pembahasan",exact:true}).click();

  await check.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await check.getByRole("textbox").fill("1/2 rasional, akar dua irasional");
  await check.getByRole("button", { name: /Periksa|Kirim/ }).click();
  await expect(check.getByRole("button", { name: "Tutup latihan" })).toBeDisabled();
  await capture("editorial-submitting");
  await expect.poll(() => Boolean(finishEvaluation)).toBe(true);
  await finishEvaluation!();
  await expect(check.getByText("Klasifikasi tepat.")).toBeVisible();
  await expect(check.getByText("Benar", { exact: true })).toHaveCount(0);
  await capture("editorial-correct");
  await expect(page.getByRole("button", { name: "Selesai", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  await capture("editorial-interaction-correct");
  await check.getByRole("button", { name: "Tutup latihan" }).click();
  await expect(check.getByText("Benar", { exact: true })).toBeVisible();
  await expect(check.getByRole("button", { name: "Lihat hasil" })).toBeVisible();
  await capture("editorial-completed");
  await page.locator("#section-functions").evaluate(element => element.scrollIntoView({ block: "start" }));
  await page.locator("#section-functions h2").evaluate(el => window.scrollBy(0, el.getBoundingClientRect().bottom));
  const passedSection2 = await page.locator("#section-functions h2").evaluate(el => el.getBoundingClientRect().bottom <= (document.querySelector("header")?.getBoundingClientRect().bottom ?? 52));
  if (passedSection2) await expect(page.locator("header").first()).toContainText("02 Fungsi dan domain");
  else await expect(page.locator("header").first()).toContainText("Bilangan dan fungsi");

  await expect(page.locator("aside").getByRole("button", { name: "Menyederhanakan pecahan", exact: true })).toHaveCount(0);
  await expect.poll(async () => Number(await page.getByRole("progressbar", { name: "Posisi baca" }).getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  await capture("editorial-context");
  await expect(page.locator(".katex-error")).toHaveCount(0);
  await page.getByRole("button",{name:"Tandai selesai",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Bab selesai",exact:true})).toBeVisible();
  await capture("editorial-chapter-complete");
  expect(errors).toEqual([]);
});
