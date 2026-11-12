import "server-only";
import { storage } from "@/lib/storage";
import { buildInteractiveDocumentAssetKey } from "@/lib/storage/keys";
import { interactiveDocumentSchema, MAX_INTERACTIVE_DOCUMENT_SPECS, type InteractiveDocumentSpec } from "./interactive-document";
import { verifyInteractiveDocumentAsset } from "./interactive-document-server";

export type InteractiveDocumentAssetPair = {
  spec: InteractiveDocumentSpec;
  document: Uint8Array;
  print: Uint8Array;
};

export type InteractiveDocumentAssetManifestEntry = { path: string; sha256: string; bytes: number };

const MAX_TOTAL_BYTES = 16 * 1024 * 1024;

/** Match the complete manifest to metadata and ZIP bytes before staging or publication. */
export async function validateInteractiveDocumentArchive(
  specs: readonly InteractiveDocumentSpec[],
  manifest: readonly InteractiveDocumentAssetManifestEntry[],
  files: ReadonlyMap<string, Uint8Array>,
): Promise<InteractiveDocumentAssetPair[]> {
  if (specs.length > MAX_INTERACTIVE_DOCUMENT_SPECS) throw new Error("INTERACTIVE_DOCUMENT_COUNT_LIMIT");
  const expected = new Map<string, { sha256: string; bytes: number }>();
  const pairs: InteractiveDocumentAssetPair[] = [];
  for (const input of specs) {
    const spec = interactiveDocumentSchema.parse(input);
    const documentPath = `visuals/${spec.documentSha256}.html`;
    const printPath = `visuals/${spec.printSha256}.png`;
    const document = files.get(documentPath), print = files.get(printPath);
    if (!document || !print) throw new Error("INTERACTIVE_DOCUMENT_ASSET_MISSING");
    expected.set(documentPath, { sha256: spec.documentSha256, bytes: spec.documentBytes });
    expected.set(printPath, { sha256: spec.printSha256, bytes: spec.printBytes });
    pairs.push({ spec, document, print });
  }
  if ([...expected.values()].reduce((sum, entry) => sum + entry.bytes, 0) > MAX_TOTAL_BYTES) throw new Error("INTERACTIVE_DOCUMENT_TOTAL_LIMIT");
  if (manifest.length !== expected.size || new Set(manifest.map(entry => entry.path)).size !== manifest.length) throw new Error("INTERACTIVE_DOCUMENT_MANIFEST_MISMATCH");
  for (const entry of manifest) {
    const target = expected.get(entry.path);
    if (!target || Object.keys(entry).length !== 3 || entry.sha256 !== target.sha256 || entry.bytes !== target.bytes) throw new Error("INTERACTIVE_DOCUMENT_MANIFEST_MISMATCH");
  }
  if ([...files.keys()].some(path => path.startsWith("visuals/") && !expected.has(path))) throw new Error("INTERACTIVE_DOCUMENT_ORPHAN_ASSET");
  for (const pair of pairs) {
    await verifyInteractiveDocumentAsset(pair.spec, "document", pair.document);
    await verifyInteractiveDocumentAsset(pair.spec, "print", pair.print);
  }
  return pairs;
}

/** The caller must authorize the exact immutable content version and field before reading. */
export async function readInteractiveDocumentAsset(spec: InteractiveDocumentSpec, kind: "document" | "print"): Promise<Uint8Array> {
  const checked = interactiveDocumentSchema.parse(spec);
  if (!storage.download) throw new Error("INTERACTIVE_DOCUMENT_STORAGE_UNAVAILABLE");
  const bytes = await storage.download(buildInteractiveDocumentAssetKey(kind === "document" ? checked.documentSha256 : checked.printSha256, kind));
  await verifyInteractiveDocumentAsset(checked, kind, bytes);
  return bytes;
}

/** Validate the complete authorized submission before persisting any immutable asset. */
export async function stageInteractiveDocumentAssets(pairs: readonly InteractiveDocumentAssetPair[]): Promise<void> {
  if (pairs.length > MAX_INTERACTIVE_DOCUMENT_SPECS) throw new Error("INTERACTIVE_DOCUMENT_COUNT_LIMIT");
  const unique = new Map<string, { spec: InteractiveDocumentSpec; kind: "document" | "print"; bytes: Uint8Array }>();
  for (const pair of pairs) {
    const spec = interactiveDocumentSchema.parse(pair.spec);
    for (const kind of ["document", "print"] as const) {
      const bytes = pair[kind];
      await verifyInteractiveDocumentAsset(spec, kind, bytes);
      const key = buildInteractiveDocumentAssetKey(kind === "document" ? spec.documentSha256 : spec.printSha256, kind);
      unique.set(key, { spec, kind, bytes });
    }
  }
  if ([...unique.values()].reduce((sum, asset) => sum + asset.bytes.byteLength, 0) > MAX_TOTAL_BYTES) throw new Error("INTERACTIVE_DOCUMENT_TOTAL_LIMIT");
  if (!storage.download) throw new Error("INTERACTIVE_DOCUMENT_STORAGE_UNAVAILABLE");
  for (const [key, asset] of unique) {
    if (!await storage.exists(key)) await storage.upload(asset.bytes, key.split("/").pop()!, asset.kind === "document" ? "text/html; charset=utf-8" : "image/png", { key });
    await verifyInteractiveDocumentAsset(asset.spec, asset.kind, await storage.download(key));
  }
}
