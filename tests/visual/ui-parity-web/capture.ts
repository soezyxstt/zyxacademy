import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { avatarPosition } from "../../../packages/ui-parity/avatar-cases";
import { directoryCases, directoryFrame } from "../../../packages/public-links/fixtures";
import { parityFrame } from "../../../packages/ui-parity/frame";
import { getProgressPosition } from "../../../packages/ui-parity/progress-cases";
import { getSeparatorPosition } from "../../../packages/ui-parity/separator-cases";
import { galleryCases, type GalleryCase } from "../../../packages/ui-parity/gallery";

const skeletonSelector = '[data-slot="skeleton"]';
const avatarSelector = '[data-slot="avatar"]';
const avatarImageSelector = '[data-slot="avatar-image"]';
const avatarFallbackSelector = '[data-slot="avatar-fallback"]';

function specimenCapture(item: GalleryCase) {
  switch (item.family) {
    case "separator":
      return {
        selector: `[data-orientation="${item.orientation}"]`,
        size: getSeparatorPosition(item.orientation),
      };
    case "skeleton":
      return { selector: skeletonSelector, size: { width: item.width, height: item.height } };
    case "avatar":
      return { selector: avatarSelector, size: avatarPosition };
    case "badge":
      return { selector: "[data-parity-badge]", size: null };
    case "beta-badge":
      return { selector: "[data-parity-beta] > span:last-child", size: null };
    case "progress":
      return { selector: '[data-slot="progress"]', size: getProgressPosition() };
    case "formatted-date":
      return { selector: "[data-parity-formatted-date] > span", size: null };
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
const directoryManifestPath = new URL("directory.json", outputDirectory);
await mkdir(outputDirectory, { recursive: true });
await rm(manifest, { force: true });
await rm(directoryManifestPath, { force: true });

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
  // Hold the bundled portrait until the production primitive exposes its loading fallback.
  let releasePortrait!: () => void;
  const portraitReady = new Promise<void>(resolve => { releasePortrait = resolve; });
  await page.route(/\/_next\/static\/media\/adi[.\w-]*\.jpeg(?:\?.*)?$/, async route => {
    await portraitReady;
    await route.continue();
  });
  try {
    const response = await page.goto(url, { timeout: 60_000, waitUntil: "domcontentloaded" });
    if (!response?.ok()) throw new Error(`Fixture returned HTTP ${response?.status() ?? "unknown"}`);
    const loadingAvatar = page.locator('[data-parity-case="avatar-image-light"]').locator(avatarSelector);
    await expect(loadingAvatar).toHaveAttribute("data-parity-image-status", "loading");
    await expect(loadingAvatar.locator(avatarFallbackSelector)).toHaveText("A");
    await expect(loadingAvatar.locator(avatarImageSelector)).toHaveCount(0);
  } finally {
    releasePortrait();
  }

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
    if (item.family === "formatted-date" && item.expected === null) {
      await expect(specimen).toHaveCount(0);
      await expect(frame).toHaveText(item.prefix);
    } else {
      await expect(specimen).toBeVisible();
    }
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
    if (item.family === "avatar") {
      await expect(frame.getByRole("img", { name: item.label })).toBeVisible();
      await expect(specimen).toHaveAttribute("data-parity-image-status", item.status);
      if (item.status === "loaded") {
        await expect(specimen.locator(avatarImageSelector)).toBeVisible();
        await expect(specimen.locator(avatarFallbackSelector)).toHaveCount(0);
      } else {
        await expect(specimen.locator(avatarFallbackSelector)).toHaveText(item.initials);
        await expect(specimen.locator(avatarImageSelector)).toHaveCount(0);
      }
    }
    if (item.family === "badge") {
      await expect(specimen).toHaveText(item.label);
      await expect(specimen).toHaveCSS("font-size", "12px");
      await expect(specimen).toHaveCSS("font-weight", "500");
      await expect(specimen).toHaveCSS("height", "24px");
      await expect(frame.getByRole("button")).toHaveCount(0);
      await expect(frame.getByRole("link")).toHaveCount(0);
    }
    if (item.family === "formatted-date" && item.expected !== null) {
      await expect(specimen).toHaveText(item.expected);
    }
    if (item.family === "beta-badge") {
      const evaluation = frame.getByRole("tab", { name: /^Evaluasi AI Beta$/i });
      const questions = frame.getByRole("tab", { name: "Analisis soal" });
      await expect(evaluation).toHaveAttribute("aria-selected", String(item.selected === "ai-insights"));
      await expect(questions).toHaveAttribute("aria-selected", String(item.selected === "questions"));
      await expect(specimen).toHaveText("Beta");
      await expect(specimen).toHaveCSS("font-size", "10px");
      await expect(specimen).toHaveCSS("font-weight", "600");
      await expect(specimen).toHaveCSS("letter-spacing", "0.5px");
      await expect(specimen).toHaveCSS("height", "16px");
      await expect(specimen).toHaveCSS("text-transform", "uppercase");
    }
    await frame.screenshot({
      path: fileURLToPath(new URL(`${item.id}.png`, outputDirectory)),
      animations: "disabled",
      scale: "device",
    });
  }

  await expect(page.getByRole("separator", { name: "Pemisah bagian" })).toBeVisible();
  const betaTabs = page.locator('[data-parity-case="beta-badge-inactive-light"]');
  const evaluation = betaTabs.getByRole("tab", { name: /^Evaluasi AI Beta$/i });
  await evaluation.click();
  await expect(evaluation).toHaveAttribute("aria-selected", "true");
  await expect(evaluation.getByText("Beta", { exact: true })).toBeVisible();
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
  await page.setViewportSize(directoryFrame);
  const directoryManifest = { ...directoryFrame, route: "/tautan", cases: Object.keys(directoryCases),
    commit: process.env.PARITY_HEAD_SHA, buildCommit: process.env.GITHUB_SHA };
  for (const [caseId, item] of Object.entries(directoryCases)) {
    const response = await page.goto(`${url}/tautan/${caseId}`);
    if (!response?.ok()) throw new Error(`Public directory fixture returned HTTP ${response?.status()}`);
    const main = page.getByRole("main");
    await expect(main.getByRole("link")).toHaveCount(item.links.length);
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => main.locator("img:visible").evaluateAll(images =>
      images.length === 1 && images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: fileURLToPath(new URL(`directory-${caseId}.png`, outputDirectory)), scale: "device" });
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  await writeFile(directoryManifestPath, JSON.stringify(directoryManifest));
  const cases = galleryCases.map(({ id, component }) => ({ id, component }));
  await writeFile(manifest, `${JSON.stringify(cases, null, 2)}\n`);
} finally {
  await browser.close();
}
