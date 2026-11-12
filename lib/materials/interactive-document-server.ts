import sharp from "sharp";
import type { InteractiveDocumentSpec } from "./interactive-document";
import { verifyAdmittedInteractiveDocumentAsset } from "./interactive-document-verified";
export { interactiveDocumentResponse, INTERACTIVE_DOCUMENT_CSP } from "./interactive-document-verified";

export async function verifyInteractiveDocumentAsset(spec: InteractiveDocumentSpec, kind: "document" | "print", bytes: Uint8Array): Promise<void> {
  verifyAdmittedInteractiveDocumentAsset(spec, kind, bytes);
  if (kind === "document") return;
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
