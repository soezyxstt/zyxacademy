import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { localStudentCookie } from "./session";

const origin = new URL(process.env.BETTER_AUTH_URL ?? "").origin;
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Local product origin required");
const out = process.env.STUDENT_CAPTURE_DIR ?? "artifacts/student-evidence/product";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
const results: Record<string, unknown>[] = [];
const routes = [
  ["/dashboard", "dashboard"], ["/courses", "catalog"], ["/courses/matematika-1", "course"],
  ["/courses/matematika-1/material", "material-list"], ["/courses/matematika-1/material/dokumen-4", "material-detail"],
];
try {
  for (const scenario of ["enrolled", "unenrolled", "revoked"] as const) {
    const context = await browser.newContext({ viewport: {width: 380, height: 820}, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true, locale: "id-ID", timezoneId: "Asia/Jakarta", colorScheme: "light" });
    await context.addCookies([{ ...await localStudentCookie(scenario), url: origin, httpOnly: true, sameSite: "Lax" }]);
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      return url.protocol === "data:" || url.origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    for (const [path, view] of routes) {
      const id = "student-" + scenario + "-" + view;
      try {
        const response = await page.goto(origin + path, { timeout: 240000, waitUntil: "domcontentloaded" });
        const rendered = new URL(page.url()).pathname;
        if (!response?.ok() || rendered !== path) throw new Error("HTTP " + response?.status() + " at " + rendered);
        await page.locator("main").last().waitFor({ state: "visible", timeout: 30000 });
        await page.locator("main h1:visible, main h2:visible").first().waitFor({ state: "visible", timeout: 45000 });
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({content:"nextjs-portal { display:none !important }"});
        const heading = (await page.locator("main h1:visible, main h2:visible").allTextContents()).slice(0, 4);
        if (!heading.length || await page.getByText("Application error", {exact:false}).count()) throw new Error("Expected product headings");
        await page.screenshot({ path: out + "/" + id + ".png", animations: "disabled" });
        results.push({id,path,status:response.status(),heading});
      } catch (error) { results.push({id,path,error: String(error).slice(0, 280)}); }
      console.log(id, results.at(-1)?.status ?? "capture unavailable");
      await writeFile(out + "/web.json", JSON.stringify({ serverSha: process.env.STUDENT_SERVER_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], {encoding:"utf8"}).trim(),
        browser:browser.version(),theme:"light",locale:"id-ID",width:380,height:820,dpr:1,results }, null, 2));
    }
    await context.close();
  }
} finally { await browser.close(); }
if (results.some(item => item.error)) process.exitCode = 1;
