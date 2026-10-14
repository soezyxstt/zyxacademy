import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BRAIN_DIR = "C:\\Users\\adiha\\.gemini\\antigravity\\brain\\bf64423a-6e3d-4d4f-8c25-9999c0d47251";
const RESULTS_DIR = path.resolve("artifacts/less-cards-plan/assets/results");

fs.mkdirSync(RESULTS_DIR, { recursive: true });
fs.mkdirSync(BRAIN_DIR, { recursive: true });

async function run() {
  console.log("Launching Chromium for screenshot capture...");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 380, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    locale: "id-ID",
  });

  const page = await context.newPage();

  for (let screenNum = 1; screenNum <= 9; screenNum++) {
    const url = `http://localhost:3117/visual-fixtures/less-cards?screen=${screenNum}`;
    console.log(`Capturing Screen ${screenNum} from ${url}...`);
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(1500);

    const sectionEl = await page.$(`#screen-${screenNum}`);
    const localTarget = path.join(RESULTS_DIR, `screen-${screenNum}.png`);
    const brainTarget = path.join(BRAIN_DIR, `screen-${screenNum}.png`);

    if (sectionEl) {
      await sectionEl.screenshot({ path: localTarget });
    } else {
      await page.screenshot({ path: localTarget, fullPage: true });
    }

    fs.copyFileSync(localTarget, brainTarget);
    console.log(`Saved: screen-${screenNum}.png`);
  }

  // Also capture full page overview
  console.log("Capturing full overview page...");
  await page.goto("http://localhost:3117/visual-fixtures/less-cards?screen=all", { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2000);
  const fullLocal = path.join(RESULTS_DIR, "overview-all-screens.png");
  const fullBrain = path.join(BRAIN_DIR, "overview-all-screens.png");
  await page.screenshot({ path: fullLocal, fullPage: true });
  fs.copyFileSync(fullLocal, fullBrain);

  console.log("All screenshots captured successfully!");
  await browser.close();
}

run().catch((err) => {
  console.error("Screenshot capture error:", err);
  process.exit(1);
});
