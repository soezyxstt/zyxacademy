import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { parityFrame } from "../../../packages/ui-parity/frame";
import { getProgressPosition } from "../../../packages/ui-parity/progress-cases";
import { getSeparatorPosition } from "../../../packages/ui-parity/separator-cases";
import { galleryCases, type GalleryCase } from "../../../packages/ui-parity/gallery";

const skeletonSelector = '[data-slot="skeleton"]';

function specimenCapture(item: GalleryCase) {
  switch (item.family) {
    case "separator":
      return {
        selector: `[data-orientation="${item.orientation}"]`,
        size: getSeparatorPosition(item.orientation),
      };
    case "skeleton":
      return { selector: skeletonSelector, size: { width: item.width, height: item.height } };
    case "progress":
      return { selector: '[data-slot="progress"]', size: getProgressPosition() };
    case "control":
    case "radio":
    case "choice":
      return { selector: "[data-parity-control]", size: null };
  }
}

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

  await page.evaluate(() => document.fonts.ready);
  for (const item of galleryCases) {
    const { selector, size } = specimenCapture(item);
    const frame = page.locator(`[data-parity-case="${item.id}"]`);
    const specimen = frame.locator(selector);
    await expect(frame).toHaveCSS("width", `${parityFrame.width}px`);
    await expect(frame).toHaveCSS("height", `${parityFrame.height}px`);
    await expect(specimen).toBeVisible();
    if (size) {
      await expect(specimen).toHaveCSS("width", `${size.width}px`);
      await expect(specimen).toHaveCSS("height", `${size.height}px`);
    }
    if (item.family === "progress") {
      const bar = frame.getByRole("progressbar", { name: item.label });
      await expect(bar).toHaveAttribute("aria-valuemin", "0");
      await expect(bar).toHaveAttribute("aria-valuemax", String(item.max));
      await expect(bar).toHaveAttribute("aria-valuenow", String(item.value));
      await expect(bar.locator('[data-slot="progress-indicator"]')).toHaveCSS(
        "width",
        `${getProgressPosition().width * item.value / item.max}px`,
      );
    }
    await frame.screenshot({
      path: fileURLToPath(new URL(`${item.id}.png`, outputDirectory)),
      animations: "disabled",
      scale: "device",
    });
  }

  await expect(page.getByRole("separator", { name: "Pemisah bagian" })).toBeVisible();
  const control = (id: string) => page.locator(`[data-parity-case="${id}"] [data-parity-control]`);
  await control("button-default-light").click();
  await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
  await expect(control("button-disabled-dark")).toBeDisabled();
  await expect(control("button-icon-light")).toHaveAccessibleName("Tambah");
  await control("button-icon-light").click();
  await expect(page.getByText("Ditambahkan", { exact: true })).toBeVisible();
  await control("label-empty-light").click();
  await expect(page.locator("#label-empty-light-input")).toBeFocused();
  await control("input-empty-light").fill("Preset baru");
  await expect(control("input-empty-light")).toHaveValue("Preset baru");
  await expect(control("input-disabled-light")).toBeDisabled();
  const textarea = control("textarea-empty-light");
  await expect(textarea).toHaveAccessibleName("Catatan sesi");
  await textarea.fill("Baris pertama\nBaris kedua");
  await expect(textarea).toHaveValue("Baris pertama\nBaris kedua");
  await expect(control("textarea-multiline-dark")).toHaveValue("Fungsi kuadrat\nDiskusikan titik puncak dan akar.");
  await expect(control("textarea-disabled-light")).toBeDisabled();
  for (const component of ["checkbox", "switch"]) {
    const toggle = control(`${component}-unchecked-light`);
    await toggle.click();
    await expect(toggle).toBeChecked();
    await toggle.press("Space");
    await expect(toggle).not.toBeChecked();
    await expect(control(`${component}-disabled-dark`)).toBeDisabled();
  }

  const radioGroup = control("radio-group-unchecked-light");
  const standard = radioGroup.getByRole("radio", { name: "Standar" });
  const exam = radioGroup.getByRole("radio", { name: "Ketik jawaban" });
  await standard.click();
  await expect(standard).toBeChecked();
  await expect(standard).toBeFocused();
  // Radix moves focus asynchronously and selects the radio while the arrow key is held.
  await page.keyboard.down("ArrowRight");
  try {
    await expect(exam).toBeFocused();
    await expect(exam).toBeChecked();
  } finally {
    await page.keyboard.up("ArrowRight");
  }
  await expect(standard).not.toBeChecked();
  await expect(control("radio-group-disabled-dark").getByRole("radio").first()).toBeDisabled();
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const cases = galleryCases.map(({ id, component }) => ({ id, component }));
  await writeFile(manifest, `${JSON.stringify(cases, null, 2)}\n`);
} finally {
  await browser.close();
}
