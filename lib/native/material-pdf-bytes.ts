import { OfflineHttpError } from "@/lib/offline/server-auth";
import { storage } from "@/lib/storage";
import { MATERIAL_PDF_MAX_BYTES } from "@/packages/native-parity/student/courses/pdf";
import type { MaterialPdfSource } from "@/lib/native/material-pdf-source";

async function downloadBounded(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", redirect: "error", headers: { Accept: "application/pdf" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]) });
  if (!response.ok || !response.body) throw new OfflineHttpError(503, "PDF_UNAVAILABLE");
  const declared = Number(response.headers.get("Content-Length"));
  if (declared > MATERIAL_PDF_MAX_BYTES) {
    await response.body.cancel();
    throw new OfflineHttpError(413, "PDF_TOO_LARGE");
  }
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MATERIAL_PDF_MAX_BYTES) throw new OfflineHttpError(413, "PDF_TOO_LARGE");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export async function readNativeMaterialPdf(source: MaterialPdfSource, signal: AbortSignal) {
  const bytes = "hostedUrl" in source ? await downloadBounded(source.hostedUrl, signal)
    : storage.getSignedUrl ? await downloadBounded(await storage.getSignedUrl(source.storageKey, "get", undefined, 60), signal)
    : await storage.download?.(source.storageKey);
  if (!bytes) throw new OfflineHttpError(503, "PDF_UNAVAILABLE");
  if (bytes.byteLength > MATERIAL_PDF_MAX_BYTES) throw new OfflineHttpError(413, "PDF_TOO_LARGE");
  if (!/%PDF-\d\.\d/.test(new TextDecoder().decode(bytes.subarray(0, 1024)))) throw new OfflineHttpError(422, "PDF_INVALID");
  return bytes;
}
