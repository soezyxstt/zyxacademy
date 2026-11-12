import { validateProductBundleAdmission } from "@/lib/bundle/product-admission";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { zipSync } from "fflate";
import { computeProductBundleChecksum, deterministicProductSerialization, type ProductEntity } from "@/lib/bundle/product-validator";
import { interactiveDocumentSchema, type InteractiveDocumentSpec } from "@/lib/materials/interactive-document";
import { validateInteractiveDocumentArchive } from "@/lib/materials/interactive-document-assets";
import { validateQuestionVisualAssets } from "@/lib/authoring/question-visual-assets";
import { parseQuestionBankDraftJson } from "@/lib/authoring/question-bank-draft";
import { sourceHashes } from "./rich-documents/capture-match.mjs";

export const richDocumentCases = ["museum", "milk", "mechanics", "sampling", "brick", "annulus", "affine"] as const;
export type RichDocumentCase = typeof richDocumentCases[number];
export type RichDocumentPair = { spec: InteractiveDocumentSpec; document: Uint8Array; print: Uint8Array };
const root = resolve("tests/visual/fixtures/rich-documents");
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const encode = (value: unknown) => new TextEncoder().encode(deterministicProductSerialization(value));

export function pairEntries(pair: RichDocumentPair) {
  return [
    { path: `visuals/${pair.spec.documentSha256}.html`, sha256: pair.spec.documentSha256, bytes: pair.spec.documentBytes, data: pair.document },
    { path: `visuals/${pair.spec.printSha256}.png`, sha256: pair.spec.printSha256, bytes: pair.spec.printBytes, data: pair.print },
  ];
}

export async function validatePair(pair: RichDocumentPair) {
  const spec = interactiveDocumentSchema.parse(pair.spec);
  const entries = pairEntries({ ...pair, spec });
  await validateInteractiveDocumentArchive([spec], entries.map(({ data: _data, ...entry }) => entry), new Map(entries.map(entry => [entry.path, entry.data])));
  return { ...pair, spec };
}

// Refuse stale captures even if an older manifest and its sidecar still agree.
export async function readRichDocumentPair(id: RichDocumentCase): Promise<RichDocumentPair> {
  const built = resolve(root, "built");
  const manifest = JSON.parse(await readFile(resolve(built, "manifest.json"), "utf8"));
  const spec = interactiveDocumentSchema.parse(manifest[id]);
  if (spec.id !== id) throw new Error(`PAIR_ID_MISMATCH:${id}`);
  const [document, print, capture, recordedSources, currentSources] = await Promise.all([
    readFile(resolve(built, `${id}.html`)), readFile(resolve(built, `${id}.png`)),
    readFile(resolve(built, `${id}.capture.json`), "utf8").then(JSON.parse),
    readFile(resolve(built, "sources.json"), "utf8").then(JSON.parse), sourceHashes(root),
  ]);
  if (JSON.stringify(recordedSources) !== JSON.stringify(currentSources)) throw new Error(`PAIR_BUILD_STALE:${id}`);
  if (capture.documentSha256 !== spec.documentSha256 || capture.printSha256 !== spec.printSha256) throw new Error(`PAIR_CAPTURE_MISMATCH:${id}`);
  return validatePair({ spec, document, print });
}

export async function questionEnvelope(draft: unknown, pairs: RichDocumentPair[]) {
  const draftJson = JSON.stringify(draft);
  const parsed = parseQuestionBankDraftJson(draftJson);
  if (!parsed.success) throw new Error(`DRAFT_INVALID:${JSON.stringify(parsed.issues)}`);
  const entries = new Map<string, ReturnType<typeof pairEntries>[number]>();
  for (const pair of pairs) for (const entry of pairEntries(await validatePair(pair))) entries.set(entry.path, entry);
  const visualAssets = [...entries.values()].map(({ data, ...entry }) => ({ ...entry, base64: Buffer.from(data).toString("base64") }));
  await validateQuestionVisualAssets(parsed.data.questions.map(question => ({ prompt: question.prompt, options: question.options, explanation: question.explanation })), visualAssets);
  return { draftJson, visualAssets };
}

export async function productArchive(input: { manifest: Record<string, any>; products: ProductEntity[]; dependencies: unknown[]; pairs: RichDocumentPair[] }) {
  const files = new Map<string, Uint8Array>([["products.json", encode(input.products)], ["dependencies.json", encode(input.dependencies)]]);
  const entries = new Map<string, ReturnType<typeof pairEntries>[number]>();
  for (const pair of input.pairs) for (const entry of pairEntries(await validatePair(pair))) entries.set(entry.path, entry);
  for (const entry of entries.values()) files.set(entry.path, entry.data);
  const entityFiles = [
    { path: "products.json", entityType: "products", checksum: digest(files.get("products.json")!), stableIds: input.products.map(product => product.id) },
    { path: "dependencies.json", entityType: "dependencies", checksum: digest(files.get("dependencies.json")!), stableIds: input.dependencies.map((dependency: any) => dependency.id) },
  ];
  const visualAssets = [...entries.values()].map(({ data: _data, ...entry }) => entry);
  const base = { ...input.manifest, entityFiles, visualAssets, bundleChecksum: undefined };
  files.set("manifest.json", encode({ ...base, bundleChecksum: computeProductBundleChecksum(base as any, files) }));
  const zip = zipSync(Object.fromEntries(files));
  const result = await validateProductBundleAdmission(zip);
  if (!result.success) throw new Error(`PRODUCT_INVALID:${JSON.stringify(result.issues)}`);
  return { zip, bundle: result.data };
}
