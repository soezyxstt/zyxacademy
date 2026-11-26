import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { getSeparatorPosition, separatorCases, separatorFrame } from "../../../packages/ui-parity/separator-cases";

const url = process.env.PARITY_WEB_URL ?? "http://localhost:3210";
const dpr = Number(process.env.PARITY_DPR ?? "1");
if (dpr !== 1 && dpr !== 3) throw new Error("PARITY_DPR must be 1 or 3");

const outputDirectory = new URL(`../../../artifacts/native-parity/web/dpr${dpr}/`, import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  args: ["--force-color-profile=srgb"],
  executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE,
});

try {
  const page = await browser.newPage({
    viewport: { width: 380, height: 844 },
    deviceScaleFactor: dpr,
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const response = await page.goto(url, { timeout: 60_000 });
  if (!response?.ok()) throw new Error(`Fixture returned HTTP ${response?.status() ?? "unknown"}`);

  for (const { id, orientation } of separatorCases) {
    const frame = page.locator(`[data-parity-case="${id}"]`);
    const separator = frame.locator(`[data-orientation="${orientation}"]`);
    const position = getSeparatorPosition(orientation);
    await expect(frame).toHaveCSS("width", `${separatorFrame.width}px`);
    await expect(frame).toHaveCSS("height", `${separatorFrame.height}px`);
    await expect(separator).toHaveCSS("width", `${position.width}px`);
    await expect(separator).toHaveCSS("height", `${position.height}px`);
    await frame.screenshot({
      path: fileURLToPath(new URL(`${id}.png`, outputDirectory)),
      animations: "disabled",
      scale: "device",
    });
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
}
