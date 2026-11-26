import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { parityFrame } from "../../../packages/ui-parity/frame";
import { getSeparatorPosition, separatorCases } from "../../../packages/ui-parity/separator-cases";
import { skeletonCases } from "../../../packages/ui-parity/skeleton-cases";

const skeletonSelector = '[data-slot="skeleton"]';
const cases = [
  ...separatorCases.map(({ id, orientation }) => ({
    id,
    selector: `[data-orientation="${orientation}"]`,
    size: getSeparatorPosition(orientation),
  })),
  ...skeletonCases.map(({ id, width, height }) => ({
    id,
    selector: skeletonSelector,
    size: { width, height },
  })),
];

const url = process.env.PARITY_WEB_URL ?? "http://localhost:3210";
const dpr = Number(process.env.PARITY_DPR ?? "1");
if (dpr !== 1 && dpr !== 3) throw new Error("PARITY_DPR must be 1 or 3");

const outputDirectory = new URL(`../../../artifacts/native-parity/web/dpr${dpr}/`, import.meta.url);
const manifest = new URL("cases.json", outputDirectory);
await mkdir(outputDirectory, { recursive: true });
await rm(manifest, { force: true });

const browser = await chromium.launch({
  args: ["--force-color-profile=srgb"],
  executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE,
});

try {
  const page = await browser.newPage({
    viewport: { width: 380, height: 844 },
    deviceScaleFactor: dpr,
    reducedMotion: "no-preference",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const response = await page.goto(url, { timeout: 60_000 });
  if (!response?.ok()) throw new Error(`Fixture returned HTTP ${response?.status() ?? "unknown"}`);

  const skeleton = page.locator(skeletonSelector).first();
  await expect(skeleton).toHaveCSS("animation-name", "pulse");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(skeleton).toHaveCSS("animation-name", "none");
  await expect(skeleton).toHaveCSS("opacity", "0.65");

  for (const { id, selector, size } of cases) {
    const frame = page.locator(`[data-parity-case="${id}"]`);
    const specimen = frame.locator(selector);
    await expect(frame).toHaveCSS("width", `${parityFrame.width}px`);
    await expect(frame).toHaveCSS("height", `${parityFrame.height}px`);
    await expect(specimen).toHaveCSS("width", `${size.width}px`);
    await expect(specimen).toHaveCSS("height", `${size.height}px`);
    await frame.screenshot({
      path: fileURLToPath(new URL(`${id}.png`, outputDirectory)),
      animations: "disabled",
      scale: "device",
    });
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
  await writeFile(manifest, `${JSON.stringify(cases.map(({ id }) => id), null, 2)}\n`);
} finally {
  await browser.close();
}
