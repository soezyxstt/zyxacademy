const assert = require("node:assert/strict");
const { chromium } = require(process.argv[2] + "/node_modules/playwright");
const base = process.argv[3] ?? "http://127.0.0.1:3197";

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 380, height: 844 } });
    const rsc = [];
    let phase = "initial";
    page.on("request", request => {
      const headers = request.headers();
      if (headers.rsc !== "1") return;
      rsc.push({ phase, path: new URL(request.url()).pathname, prefetch: headers["next-router-prefetch"] ?? null, segment: headers["next-router-segment-prefetch"] ?? null });
    });
    const link = (name) => page.locator("[data-mobile-bottom-nav]").getByRole("link", { name, exact: true });
    const mounted = (name) => page.locator(`[data-fixture-page="${name}"]`);
    await page.goto(base + "/dashboard/discussions");
    await mounted("discussion").waitFor();
    // Let Next settle the initial default shell prefetch before testing the click.
    await page.waitForTimeout(800);
    phase = "cold click";
    await link("Beranda").click();
    await page.getByRole("status", { name: "Memuat" }).waitFor({ state: "attached", timeout: 2500 });
    await mounted("dashboard").waitFor();
    assert.ok(rsc.some(row => row.phase === phase && row.path === "/dashboard" && row.prefetch === null));

    phase = "away and prefetch";
    await link("Diskusi").click();
    await mounted("discussion").waitFor();
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      window.fixtureSawLoading = false;
      const observer = new MutationObserver(() => {
        if (document.querySelector('[aria-label="Memuat"]')) window.fixtureSawLoading = true;
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    phase = "warm click";
    await link("Beranda").click();
    await mounted("dashboard").waitFor();
    assert.equal(await page.evaluate(() => window.fixtureSawLoading), false);
    assert.deepEqual(rsc.filter(row => row.phase === phase && row.path === "/dashboard"), []);

    phase = "catalog first visit";
    await link("Kelas").click();
    await mounted("courses").waitFor();
    phase = "catalog away";
    await link("Diskusi").click();
    await mounted("discussion").waitFor();
    await page.waitForTimeout(1000);
    phase = "catalog warm click";
    await link("Kelas").click();
    await mounted("courses").waitFor();
    assert.deepEqual(rsc.filter(row => row.phase === phase && row.path === "/courses"), []);

    phase = "account transition";
    await page.getByRole("button", { name: "Begin transition" }).click();
    await link("Beranda").click();
    assert.equal(new URL(page.url()).pathname, "/courses");
    assert.deepEqual(rsc.filter(row => row.phase === phase && row.path === "/dashboard"), []);
    await page.getByRole("button", { name: "Cancel transition" }).click();

    phase = "invalidation";
    await link("Diskusi").click();
    await mounted("discussion").waitFor();
    const action = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/dashboard/discussions");
    await page.getByRole("button", { name: "Invalidate dashboard" }).click();
    await (await action).finished();
    await page.waitForTimeout(1000);
    await link("Beranda").click();
    await page.getByRole("heading", { name: "Dashboard 2" }).waitFor();
    console.log(JSON.stringify(rsc, null, 2));
    const direct = await browser.newPage({ viewport: { width: 380, height: 844 } });
    const directRequests = [];
    direct.on("request", request => {
      if (request.headers().rsc === "1" && new URL(request.url()).pathname === "/dashboard") {
        directRequests.push(request.url());
      }
    });
    await direct.goto(base + "/dashboard");
    await direct.locator('[data-fixture-page="dashboard"]').waitFor();
    await direct.locator("[data-mobile-bottom-nav]").getByRole("link", { name: "Diskusi" }).click();
    await direct.locator('[data-fixture-page="discussion"]').waitFor();
    // A direct document load may need a background full prefetch when leaving.
    await direct.waitForTimeout(1400);
    const beforeReturn = directRequests.length;
    await direct.locator("[data-mobile-bottom-nav]").getByRole("link", { name: "Beranda" }).click();
    await direct.locator('[data-fixture-page="dashboard"]').waitFor();
    assert.equal(directRequests.length, beforeReturn);
    console.log("Direct dashboard entry: %d background RSC requests, zero on return click", beforeReturn);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
