import { pathToFileURL } from "node:url";

/** Resolve the worker shipped alongside the installed pdf-parse package. */
export async function getPdfWorkerSrc(): Promise<string> {
  const { getPath } = await import("pdf-parse/worker");
  return pathToFileURL(getPath()).href;
}

export async function setupPdfWorker(PDFParseClass: { setWorker(src: string): void }): Promise<void> {
  PDFParseClass.setWorker(await getPdfWorkerSrc());
}
