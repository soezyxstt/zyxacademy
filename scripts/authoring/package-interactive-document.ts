// From the repository root, after workflow.get_contract and independent content review:
// bun scripts/authoring/package-interactive-document.ts reviewed.html reviewed.png metadata.json new-output-dir
// metadata.json: {"id":"visual-1","label":"...","description":"...","height":400,
//   "staticFallback":{"type":"text","summary":"...","content":"..."},"printCaption":"..."}
// Fill these fields with authored content. This prepares one pair, not a complete Product or review.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { interactiveDocumentSchema } from "@/lib/materials/interactive-document";
import { verifyInteractiveDocumentAsset } from "@/lib/materials/interactive-document-server";

const [htmlPath, pngPath, metadataPath, output] = process.argv.slice(2);
if (!htmlPath || !pngPath || !metadataPath || !output || process.argv.length !== 6) {
  throw new Error("Usage: bun scripts/authoring/package-interactive-document.ts reviewed.html reviewed.png metadata.json new-output-dir");
}
const [document, print, metadataText] = await Promise.all([
  readFile(htmlPath), readFile(pngPath), readFile(metadataPath, "utf8"),
]);
const metadata = JSON.parse(metadataText);
if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) ||
  ["kind", "version", "documentSha256", "documentBytes", "printSha256", "printBytes"].some(key => Object.hasOwn(metadata, key))) {
  throw new Error("Metadata must contain only author-provided fields; hashes and sizes are calculated.");
}
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const spec = interactiveDocumentSchema.parse({
  ...metadata, kind: "interactive_document", version: 1,
  documentSha256: hash(document), documentBytes: document.length,
  printSha256: hash(print), printBytes: print.length,
});
await verifyInteractiveDocumentAsset(spec, "document", document);
await verifyInteractiveDocumentAsset(spec, "print", print);
const entries = [
  { path: `visuals/${spec.documentSha256}.html`, sha256: spec.documentSha256, bytes: document.length, data: document },
  { path: `visuals/${spec.printSha256}.png`, sha256: spec.printSha256, bytes: print.length, data: print },
];
const payload = {
  articleVisual: spec,
  orderedPart: { id: `${spec.id}-ref`, kind: "visual_ref", visualId: spec.id },
  manifestVisualAssets: entries.map(({ data: _data, ...entry }) => entry),
  questionFence: `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``,
  visualAssets: entries.map(({ data, ...entry }) => ({ ...entry, base64: data.toString("base64") })),
};
// Require a new directory so an existing author's files are never overwritten.
await mkdir(output);
await mkdir(join(output, "visuals"));
for (const { path, data } of entries) await writeFile(join(output, path), data, { flag: "wx" });
await writeFile(join(output, "payload.json"), `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
console.log(`Prepared ${output}: visuals/ and payload.json`);
