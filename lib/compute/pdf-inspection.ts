export async function inspectPdfText(bytes: Uint8Array): Promise<{ pageCount: number; text: string }> {
  if (process.env.ZYX_COMPUTE_RUNTIME === "neon") {
    const { inspectBrowserPdf } = await import("./browser-pdf");
    return inspectBrowserPdf(bytes);
  } else {
  const { PDFParse } = await import("pdf-parse");
  const { setupPdfWorker } = await import("./pdf-worker");
  await setupPdfWorker(PDFParse);
  const parser = new PDFParse({ data: bytes.slice() });
  try { return { pageCount: (await parser.getInfo()).total, text: (await parser.getText()).text }; }
  finally { await parser.destroy(); }
  }
}
