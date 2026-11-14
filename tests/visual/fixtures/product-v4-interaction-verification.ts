import { createHash } from "node:crypto";
import sharp from "sharp";
import { buildLocalVerificationFixture } from "../../../scripts/authoring/local-verification-fixture";
import { formativeDocumentFields } from "@/lib/bundle/product-v4-verification";

export { executeFormativeDocumentCheck } from "@/lib/compute/product-v4-formative-verification";
export { exerciseProductV4VisualSmoke } from "@/lib/compute/product-v4-browser-runner";

export async function interactionFixture(mode: "noop" | "canvas" | "pressed" | "focus-svg" | "focus-canvas" | "focus-aria" | "delayed-reset") {
  const paint = "ctx.fillStyle = 'blue'; ctx.fillRect(0,0,64,64)";
  const handler = mode === "canvas" || mode === "delayed-reset" ? `setTimeout(() => { ${paint} }, 180)` : mode === "pressed" ? "button.setAttribute('aria-pressed','true')" : "";
  const focus = mode === "focus-svg" ? "document.querySelector('circle').setAttribute('r','8')" : mode === "focus-canvas" ? paint : mode === "focus-aria" ? "button.setAttribute('aria-pressed','true')" : "";
  const document = Buffer.from(`<!doctype html><html><body><button id="control" aria-pressed="false">Rotate</button><canvas id="drawing" width="64" height="64"></canvas><svg width="20" height="20"><circle cx="10" cy="10" r="4"/></svg><script>const button=document.getElementById('control'), ctx=document.getElementById('drawing').getContext('2d'); ctx.fillStyle='red'; ctx.fillRect(0,0,64,64); button.addEventListener('click',()=>{${handler}}); button.addEventListener('focus',()=>{${focus}}); ${mode === "delayed-reset" ? `if(window.name==='reset')setTimeout(()=>{${paint}},180);` : ""}</script></body></html>`);
  const print = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } }).png().toBuffer();
  const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const spec = { id: "interaction-fixture", kind: "interactive_document" as const, version: 1 as const, label: "Canvas visual", description: "Canvas visual", documentSha256: hash(document), documentBytes: document.length, printSha256: hash(print), printBytes: print.length, height: 300, staticFallback: { type: "text" as const, summary: "Fallback visual", content: "Fallback visual" }, printCaption: "Canvas visual" };
  const bundle = buildLocalVerificationFixture().bundle;
  const article = bundle.products.find(item => item.productType === "article");
  if (!article || article.productType !== "article") throw new Error("FIXTURE_ARTICLE_REQUIRED");
  const block = article.sections.flatMap(section => section.blocks).find(item => item.formativeCheckPayload && item.parts);
  if (!block?.parts) throw new Error("FIXTURE_FORMATIVE_REQUIRED");
  block.parts.push({ id: "interaction-part", kind: "markdown", markdown: `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\`` });
  const field = formativeDocumentFields(bundle.products).find(item => item.field === "prompt:interaction-part");
  if (!field) throw new Error("FIXTURE_FIELD_REQUIRED");
  return { spec, field, assets: { document, print } };
}
