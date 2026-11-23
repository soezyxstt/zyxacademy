import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Match the app's Inter body and Lexend heading fonts without network requests.
// Original Google Fonts files and their SIL licenses are in fixtures/fonts/.
export function fixtureFontStyles() {
  const fonts: Array<[string, string]> = [["Inter", "400 700"], ["Lexend", "700"]];
  return fonts.map(([family, weight]) => {
    const data = readFileSync(resolve(`tests/visual/fixtures/fonts/${family.toLowerCase()}-latin.woff2`)).toString("base64");
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format('woff2')}`;
  }).join("") + ":root{--font-inter:'Inter';--font-lexend:'Lexend'}";
}
