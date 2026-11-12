import { createHash } from "node:crypto";
import sharp from "sharp";
import type { InteractiveDocumentSpec } from "./interactive-document";

export const INTERACTIVE_DOCUMENT_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

const READY_BOOTSTRAP = `<script>document.addEventListener("DOMContentLoaded",function(){parent.postMessage({type:"zyx:ready"},"*")},{once:true})</script>`;

export async function verifyInteractiveDocumentAsset(spec: InteractiveDocumentSpec, kind: "document" | "print", bytes: Uint8Array): Promise<void> {
  const size = kind === "document" ? spec.documentBytes : spec.printBytes;
  const hash = kind === "document" ? spec.documentSha256 : spec.printSha256;
  if (bytes.byteLength !== size || createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error("INTERACTIVE_DOCUMENT_INTEGRITY");
  if (kind === "document") {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (source.includes("\0")) throw new Error("INTERACTIVE_DOCUMENT_ENCODING");
    return;
  }
  const pngEnd = Buffer.from("0000000049454e44ae426082", "hex");
  if (bytes.length < 20 || !Buffer.from(bytes.subarray(-12)).equals(pngEnd)) throw new Error("INTERACTIVE_DOCUMENT_PRINT_INVALID");
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: 16_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || metadata.pages && metadata.pages !== 1) throw new Error("INTERACTIVE_DOCUMENT_PRINT_INVALID");
    await image.raw().toBuffer();
  } catch {
    throw new Error("INTERACTIVE_DOCUMENT_PRINT_INVALID");
  }
}

// Call only after the exact content version and field have been authorized and verified.
export function interactiveDocumentResponse(bytes: Uint8Array, kind: "document" | "print"): Response {
  const body = kind === "document" ? new Blob([bytes as BlobPart, READY_BOOTSTRAP]) : bytes as unknown as BodyInit;
  return new Response(body, { headers: {
    "Content-Type": kind === "document" ? "text/html; charset=utf-8" : "image/png",
    "Content-Security-Policy": INTERACTIVE_DOCUMENT_CSP,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  } });
}
