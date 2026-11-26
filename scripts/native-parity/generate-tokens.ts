import { readFileSync, writeFileSync } from "node:fs";
import { formatHex8 } from "culori";
import postcss from "postcss";

const cssFile = new URL("../../app/globals.css", import.meta.url);
const outputFile = new URL("../../packages/design-tokens/native-colors.ts", import.meta.url);
const colorProperties = {
  background: "background", border: "border", muted: "muted", foreground: "foreground",
  popover: "popover", popoverForeground: "popover-foreground",
  input: "input", mutedForeground: "muted-foreground", primary: "primary",
  primaryForeground: "primary-foreground", primaryHover: "primary-hover", secondary: "secondary",
  secondaryForeground: "secondary-foreground", secondaryHover: "secondary-hover",
  brandPrimary: "brand-primary", destructive: "destructive", marketingNavy: "marketing-navy", accent: "zx-accent", ring: "ring",
};
const themeSelectors = { light: ":root", dark: ".dark" } as const;
const stylesheet = postcss.parse(readFileSync(cssFile, "utf8"), { from: cssFile.pathname });

function readProperty(selector: string, property: string) {
  let value: string | undefined;
  stylesheet.each((node) => {
    if ((node.type === "rule" && node.selector === selector) ||
        (node.type === "atrule" && `@${node.name} ${node.params}` === selector)) {
      node.each((child) => {
        if (child.type === "decl" && child.prop === property) value = child.value;
      });
    }
  });
  if (!value) throw new Error(`Missing ${selector} ${property}`);
  return value;
}

function readColor(selector: string, name: string) {
  const property = `--${name}`;
  const color: string | undefined = formatHex8(readProperty(selector, property));
  if (!color) throw new Error(`Expected an sRGB-convertible color for ${selector} ${property}`);
  return color.endsWith("ff") ? color.slice(0, 7) : color;
}

const themes = Object.fromEntries(
  Object.entries(themeSelectors).map(([theme, selector]) => [
    theme,
    Object.fromEntries(Object.entries(colorProperties).map(([name, property]) => [name, readColor(selector, property)])),
  ]),
);
const base = /^(\d*\.?\d+)rem$/.exec(readProperty(":root", "--radius"));
const smallFactor = /^calc\(var\(--radius\) \* (\d*\.?\d+)\)$/.exec(readProperty("@theme inline", "--radius-sm"));
const factor = /^calc\(var\(--radius\) \* (\d*\.?\d+)\)$/.exec(readProperty("@theme inline", "--radius-md"));
if (!base || !smallFactor || !factor || readProperty("@theme inline", "--radius-lg") !== "var(--radius)") throw new Error("Unsupported radius expression");
const mediumRadius = Number(base[1]) * 16 * Number(factor[1]);
const output = [
  "// Generated from app/globals.css by scripts/native-parity/generate-tokens.ts.",
  `export const nativeColors = ${JSON.stringify(themes, null, 2)} as const;`,
  `export const nativeLinkInks = ${JSON.stringify(Object.fromEntries(["brand-secondary", "tertiary-1", "tertiary-2", "tertiary-3", "success", "info", "warning", "error"].map(key => {
    const token = ["success", "info", "warning", "error"].includes(key) ? "status-" + key : key;
    return [key, readColor("@theme inline", "color-" + token)];
  })), null, 2)} as const;`,
  `export const nativeRadii = { sm: ${Number(base[1]) * 16 * Number(smallFactor[1])}, md: ${mediumRadius}, lg: ${Number(base[1]) * 16} } as const;`,
  "",
].join("\n");

if (process.argv.includes("--check")) {
  if (readFileSync(outputFile, "utf8") !== output) {
    throw new Error("Native colors are out of date. Run bun scripts/native-parity/generate-tokens.ts");
  }
} else {
  writeFileSync(outputFile, output);
}
