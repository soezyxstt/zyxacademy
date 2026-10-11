import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectProductDiktatPdf } from "@/lib/compute/product-diktat-inspector";
import { uploadProductDiktatPdf } from "@/lib/compute/product-diktat-storage";
import type { StorageProvider } from "@/lib/storage";

function pdfFixture(): Uint8Array {
  const stream = "BT /F1 12 Tf 30 100 Td (Diktat buffer regression) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(source.length);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = source.length;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(source);
}

test("PDF inspection preserves the original bytes for the subsequent storage upload", async () => {
  const bytes = pdfFixture();
  const original = bytes.slice();
  const result = await inspectProductDiktatPdf(bytes);
  assert.equal(result.pageCount, 1);
  assert.match(result.text, /Diktat buffer regression/);
  assert.equal(bytes.byteLength, original.byteLength);
  assert.deepEqual(bytes, original);
  let uploaded = false;
  const provider = { upload: async (data: Uint8Array) => {
    assert.deepEqual(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), original);
    uploaded = true;
    return { key: "test.pdf", url: "test.pdf", size: data.byteLength };
  } } as unknown as StorageProvider;
  await uploadProductDiktatPdf({ provider, bytes, filename: "test.pdf", key: "overhaul/test/diktat-pdf/test.pdf", metadata: {} });
  assert.equal(uploaded, true);
});
