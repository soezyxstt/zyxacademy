import { expect, test } from "bun:test";
import { renderProductV4PrintArtifacts } from "@/lib/compute/product-v4-print-artifacts";

test("PDF counting and every page capture use the same bytes from one render", async () => {
  const pdf = Buffer.from("%PDF-1.7\nExact fixture bytes\n%%EOF");
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  let renders = 0, captures = 0;
  const result = await renderProductV4PrintArtifacts({
    renderPdf: async () => { renders++; return pdf; },
    pageCount: async bytes => { expect(bytes).toBe(pdf); return 2; },
    capturePages: async (bytes, pages) => {
      captures++;
      expect(bytes).toBe(pdf);
      expect(pages).toEqual([1, 2]);
      return [{ pageNumber: 2, png }, { pageNumber: 1, png }];
    },
  });
  expect(renders).toBe(1);
  expect(captures).toBe(1);
  expect(result.pageCount).toBe(2);
  expect(result.artifacts[0].bytes).toBe(pdf);
  expect(result.artifacts.map(artifact => artifact.pageNumber)).toEqual([undefined, 1, 2]);
});

test("invalid page counts fail before page capture", async () => {
  for (const count of [0, 5, 1.5, Number.NaN]) {
    let captures = 0;
    await expect(renderProductV4PrintArtifacts({
      renderPdf: async () => Buffer.from("%PDF-1.7"), pageCount: async () => count,
      capturePages: async () => { captures++; return []; },
    })).rejects.toThrow("VERIFICATION_PRINT_PAGE_COUNT_INVALID");
    expect(captures).toBe(0);
  }
});

test("missing, duplicate or extra pages cannot supply complete PDF evidence", async () => {
  for (const pageNumbers of [[1], [1, 1], [1, 3], [1, 2, 3]]) {
    await expect(renderProductV4PrintArtifacts({
      renderPdf: async () => Buffer.from("%PDF-1.7"), pageCount: async () => 2,
      capturePages: async () => pageNumbers.map(pageNumber => ({ pageNumber, png: new Uint8Array([1]) })),
    })).rejects.toThrow("VERIFICATION_PRINT_CAPTURE_MISSING");
  }
});

test("a capture failure cannot cache a PDF as completed evidence", async () => {
  let renders = 0;
  const failure = new Error("CAPTURE_FAILED");
  const ports = { renderPdf: async () => { renders++; return Buffer.from("%PDF-1.7"); }, pageCount: async () => 1, capturePages: async (): Promise<never> => { throw failure; } };
  await expect(renderProductV4PrintArtifacts(ports)).rejects.toBe(failure);
  await expect(renderProductV4PrintArtifacts(ports)).rejects.toBe(failure);
  expect(renders).toBe(2);
});
