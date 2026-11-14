import { z } from "zod";

const base64 = z.string().min(4).regex(/^[A-Za-z0-9+/]+={0,2}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const pairKey = z.string().regex(/^[a-f0-9]{64}:[a-f0-9]{64}$/);
export const productV4DocumentPairKey = (spec: { documentSha256: string; printSha256: string }) => `${spec.documentSha256}:${spec.printSha256}`;
export const productV4DocumentWireSchema = z.object({
  documents: z.record(hash, base64.max(Math.ceil(6 * 1024 * 1024 / 3) * 4)),
  prints: z.record(hash, base64.max(Math.ceil(2 * 1024 * 1024 / 3) * 4)),
  pairs: z.array(pairKey).max(8),
}).strict().superRefine((assets, ctx) => {
  const documents = new Set<string>(), prints = new Set<string>();
  for (const pair of assets.pairs) {
    const [document, print] = pair.split(":");
    documents.add(document); prints.add(print);
    if (!assets.documents[document] || !assets.prints[print]) ctx.addIssue({ code: "custom", message: "VERIFICATION_DOCUMENT_WIRE_INVALID" });
  }
  if (new Set(assets.pairs).size !== assets.pairs.length || documents.size !== Object.keys(assets.documents).length || prints.size !== Object.keys(assets.prints).length) ctx.addIssue({ code: "custom", message: "VERIFICATION_DOCUMENT_WIRE_INVALID" });
  // Each of the at most 16 assets rounds its base64 length independently.
  if ([...Object.values(assets.documents), ...Object.values(assets.prints)].reduce((sum, value) => sum + value.length, 0) > Math.ceil(16 * 1024 * 1024 / 3) * 4 + 64) ctx.addIssue({ code: "custom", message: "VERIFICATION_DOCUMENT_TOTAL_LIMIT" });
});

export function decodeProductV4DocumentWire(value: unknown): Record<string, { document: Uint8Array; print: Uint8Array }> {
  const wire = productV4DocumentWireSchema.parse(value);
  let total = 0;
  const decode = (items: Record<string, string>, limit: number) => Object.fromEntries(Object.entries(items).map(([key, value]) => {
    const bytes = Buffer.from(value, "base64");
    if (bytes.toString("base64") !== value || bytes.length > limit) throw new Error("VERIFICATION_DOCUMENT_WIRE_INVALID");
    total += bytes.length;
    if (total > 16 * 1024 * 1024) throw new Error("VERIFICATION_DOCUMENT_TOTAL_LIMIT");
    return [key, new Uint8Array(bytes)];
  }));
  const documents = decode(wire.documents, 6 * 1024 * 1024), prints = decode(wire.prints, 2 * 1024 * 1024);
  return Object.fromEntries(wire.pairs.map(key => {
    const [document, print] = key.split(":");
    return [key, { document: documents[document], print: prints[print] }];
  }));
}

export function encodeProductV4DocumentWire(assets: Readonly<Record<string, { document: Uint8Array; print: Uint8Array }>>) {
  const documents: Record<string, string> = {}, prints: Record<string, string> = {};
  const pairs = Object.keys(assets);
  for (const [key, pair] of Object.entries(assets)) {
    if (!/^[a-f0-9]{64}:[a-f0-9]{64}$/.test(key) || !pair.document.length || !pair.print.length || pair.document.length > 6 * 1024 * 1024 || pair.print.length > 2 * 1024 * 1024) throw new Error("VERIFICATION_DOCUMENT_WIRE_INVALID");
    const [document, print] = key.split(":");
    const documentBase64 = Buffer.from(pair.document).toString("base64"), printBase64 = Buffer.from(pair.print).toString("base64");
    if ((documents[document] && documents[document] !== documentBase64) || (prints[print] && prints[print] !== printBase64)) throw new Error("VERIFICATION_DOCUMENT_WIRE_INVALID");
    documents[document] = documentBase64; prints[print] = printBase64;
  }
  const wire = productV4DocumentWireSchema.parse({ documents, prints, pairs });
  let total = 0;
  for (const value of [...Object.values(documents), ...Object.values(prints)]) total += Buffer.from(value, "base64").length;
  if (total > 16 * 1024 * 1024) throw new Error("VERIFICATION_DOCUMENT_TOTAL_LIMIT");
  return wire;
}
