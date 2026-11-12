import { z } from "zod";

const base64 = z.string().min(4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
export const productV4DocumentWireSchema = z.record(z.string().regex(/^[a-f0-9]{64}$/), z.object({
  document: base64.max(Math.ceil(6 * 1024 * 1024 / 3) * 4),
  print: base64.max(Math.ceil(2 * 1024 * 1024 / 3) * 4),
}).strict()).superRefine((assets, ctx) => {
  const pairs = Object.values(assets);
  if (pairs.length > 8 || pairs.reduce((sum, pair) => sum + pair.document.length + pair.print.length, 0) > Math.ceil(16 * 1024 * 1024 / 3) * 4 + 32) ctx.addIssue({ code: "custom", message: "VERIFICATION_DOCUMENT_TOTAL_LIMIT" });
});

export function decodeProductV4DocumentWire(value: unknown): Record<string, { document: Uint8Array; print: Uint8Array }> {
  const wire = productV4DocumentWireSchema.parse(value);
  let total = 0;
  const result: Record<string, { document: Uint8Array; print: Uint8Array }> = {};
  for (const [hash, pair] of Object.entries(wire)) {
    const document = Buffer.from(pair.document, "base64"), print = Buffer.from(pair.print, "base64");
    if (document.toString("base64") !== pair.document || print.toString("base64") !== pair.print || document.length > 6 * 1024 * 1024 || print.length > 2 * 1024 * 1024) throw new Error("VERIFICATION_DOCUMENT_WIRE_INVALID");
    total += document.length + print.length;
    if (total > 16 * 1024 * 1024) throw new Error("VERIFICATION_DOCUMENT_TOTAL_LIMIT");
    result[hash] = { document: new Uint8Array(document), print: new Uint8Array(print) };
  }
  return result;
}

export function encodeProductV4DocumentWire(assets: Readonly<Record<string, { document: Uint8Array; print: Uint8Array }>>) {
  const pairs = Object.values(assets);
  if (pairs.length > 8 || pairs.some(pair => !pair.document.length || !pair.print.length || pair.document.length > 6 * 1024 * 1024 || pair.print.length > 2 * 1024 * 1024) || pairs.reduce((sum, pair) => sum + pair.document.length + pair.print.length, 0) > 16 * 1024 * 1024) throw new Error("VERIFICATION_DOCUMENT_TOTAL_LIMIT");
  const wire = Object.fromEntries(Object.entries(assets).map(([hash, pair]) => [hash, { document: Buffer.from(pair.document).toString("base64"), print: Buffer.from(pair.print).toString("base64") }]));
  productV4DocumentWireSchema.parse(wire);
  return wire;
}
