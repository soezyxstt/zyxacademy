import { readFileSync, writeFileSync } from "node:fs";
import { formatHex8 } from "culori";
import postcss from "postcss";

const cssFile = new URL("../../app/globals.css", import.meta.url);
const outputFile = new URL("../../packages/design-tokens/native-colors.ts", import.meta.url);
const tokenNames = ["background", "border"] as const;
const themeSelectors = { light: ":root", dark: ".dark" } as const;
const stylesheet = postcss.parse(readFileSync(cssFile, "utf8"), { from: cssFile.pathname });

function readColor(selector: string, name: (typeof tokenNames)[number]) {
  const property = `--${name}`;
  let value: string | undefined;
  stylesheet.each((node) => {
    if (node.type === "rule" && node.selector === selector) {
      node.each((child) => {
        if (child.type === "decl" && child.prop === property) value = child.value;
      });
    }
  });
  const color: string | undefined = formatHex8(value);
  if (!color) throw new Error(`Expected an sRGB-convertible color for ${selector} ${property}`);
  return color.endsWith("ff") ? color.slice(0, 7) : color;
}

const themes = Object.fromEntries(
  Object.entries(themeSelectors).map(([theme, selector]) => [
    theme,
    Object.fromEntries(tokenNames.map((name) => [name, readColor(selector, name)])),
  ]),
);
const output = [
  "// Generated from app/globals.css by scripts/native-parity/generate-tokens.ts.",
  `export const nativeColors = ${JSON.stringify(themes, null, 2)} as const;`,
  "",
].join("\n");

if (process.argv.includes("--check")) {
  if (readFileSync(outputFile, "utf8") !== output) {
    throw new Error("Native colors are out of date. Run bun scripts/native-parity/generate-tokens.ts");
  }
} else {
  writeFileSync(outputFile, output);
}
