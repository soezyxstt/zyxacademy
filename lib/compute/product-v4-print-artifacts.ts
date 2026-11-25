import type { ProductV4ObservedArtifact } from "@/lib/bundle/product-v4-verification";

interface ProductV4PrintArtifactPorts {
  renderPdf(): Promise<Uint8Array>;
  pageCount(pdf: Uint8Array): Promise<number>;
  capturePages(pdf: Uint8Array, pageNumbers: number[]): Promise<readonly { pageNumber: number; png: Uint8Array }[]>;
}

/** One render supplies the deliverable PDF and the page evidence, within one execution. */
export async function renderProductV4PrintArtifacts(ports: ProductV4PrintArtifactPorts): Promise<{ pageCount: number; artifacts: ProductV4ObservedArtifact[] }> {
  const pdf = await ports.renderPdf();
  const pageCount = await ports.pageCount(pdf);
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 4) throw new Error("VERIFICATION_PRINT_PAGE_COUNT_INVALID");
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = await ports.capturePages(pdf, pageNumbers);
  if (pages.length !== pageCount || !pageNumbers.every(pageNumber => pages.some(page => page.pageNumber === pageNumber))) throw new Error("VERIFICATION_PRINT_CAPTURE_MISSING");
  return { pageCount, artifacts: [
    { id: "diktat.pdf", mediaType: "application/pdf", bytes: pdf },
    ...[...pages].sort((left, right) => left.pageNumber - right.pageNumber).map(page => ({ id: `page-${page.pageNumber}.png`, mediaType: "image/png" as const, pageNumber: page.pageNumber, bytes: page.png })),
  ] };
}
