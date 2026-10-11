import assert from "node:assert/strict";
import { buildSelfContainedKatexCss, PRODUCT_DIKTAT_FOOTER_TEMPLATE } from "../../lib/bundle/product-diktat-pdf.ts";
const css = buildSelfContainedKatexCss();
assert(css.includes("font-family:KaTeX_Main"));
assert(!css.includes("url(fonts/"));
assert((css.match(/data:font\/woff2;base64,/g) ?? []).length > 10);
assert(PRODUCT_DIKTAT_FOOTER_TEMPLATE.includes("Instagram: zyx_academy"));
console.log("Diktat runtime font assets and footer verified");