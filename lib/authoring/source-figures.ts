import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { courseMaterials } from "@/db/schema";
import { db } from "@/lib/db";
import { normalizeDate } from "@/lib/date-utils";
import { storage, type StorageProvider } from "@/lib/storage";
import { buildSourceFigureKey, isSafeKey, slugifySegment } from "@/lib/storage/keys";
import { inngest } from "@/jobs/client";
import { resolveStoredSourceFile } from "./mcp-source-files";
import { figureChecksum, normalizedCropSchema, renderSourceFigure, SOURCE_FIGURE_RENDERER, LEGACY_SOURCE_FIGURE_RENDERER } from "@/lib/compute/source-figure";
import { getSourcePackImport, readStoredSourcePack } from "@/lib/bundle/source-staging";
import type { ValidatedSourcePack } from "./source-pack";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const extractSourceFigureSchema = z.object({ fileKey: z.string().min(1), retry: z.boolean().default(false), pageNumber: z.number().int().positive(), crop: normalizedCropSchema,
  attribution: z.string().trim().min(1).max(2000), permission: z.enum(["unknown", "licensed", "public_domain", "owned"]), sourceVisualId: z.string().trim().min(1).max(200), sourcePackChecksum: hash, sourcePackImportId: z.string().min(1), sourceDocumentId: z.string().min(1) });
export const sourceFigureRefSchema = z.object({ fileKey: z.string().min(1), assetId: hash });
export const sourceFigureListSchema = z.object({ fileKey: z.string().min(1), cursor: hash.optional(), limit: z.number().int().min(1).max(50).default(20) });
type Auth = { actorId: string; sessionId: string };
const requestSchema = extractSourceFigureSchema.omit({ fileKey: true, retry: true }).extend({ assetId: hash, actorId: z.string().min(1), sessionId: z.string().min(1), courseId: z.string(), materialId: z.string(), storageKey: z.string().refine(key => isSafeKey(key) && !key.includes(":") && key.endsWith(".pdf")), sourceVersion: z.number(), sourceChecksum: hash, renderer: z.enum([SOURCE_FIGURE_RENDERER, LEGACY_SOURCE_FIGURE_RENDERER]) });
const identitySchema = requestSchema.omit({ assetId: true });
function validatedRequest(value: unknown) {
  const request = requestSchema.parse(value);
  if (figureChecksum(JSON.stringify(identitySchema.parse(request))) !== request.assetId) throw new Error("SOURCE_FIGURE_REQUEST_INVALID");
  return request;
}
const variantSchema = z.object({ name: z.enum(["preview", "print"]), key: z.string(), checksum: hash, width: z.number().int().positive(), height: z.number().int().positive() });
export const sourceFigureManifestSchema = requestSchema.omit({ actorId: true, sessionId: true, storageKey: true }).extend({ schemaVersion: z.literal("source-figure.v1"), variants: z.array(variantSchema).length(2).refine(variants => new Set(variants.map(variant => variant.name)).size === 2), pdfPointBbox: z.array(z.number().finite()).length(4), cropBox: z.array(z.number().finite()).length(4), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]), transform: z.array(z.number().finite()).length(6), rounding: z.literal("floor-start-ceil-end") });
type Store = Pick<StorageProvider, "download" | "upload" | "exists" | "list" | "getSignedUrl">;
type Dependencies = { store: Store; resolve: typeof resolveStoredSourceFile; enqueue: (request: z.infer<typeof requestSchema> & { attemptId?: string }) => Promise<unknown>; render: typeof renderSourceFigure; loadPack: (importId: string) => Promise<{ courseId: string | null; pack: ValidatedSourcePack }> };
const defaults: Dependencies = { store: storage, resolve: resolveStoredSourceFile, enqueue: request => inngest.send({ id: `source-figure-${request.assetId}-${request.attemptId ?? "initial"}`, name: "source.figure.requested", data: request }), render: renderSourceFigure,
  async loadPack(importId) { const row = await getSourcePackImport(importId); if (!row || row.id !== importId || !row.validationReport.valid) throw new Error("SOURCE_FIGURE_SOURCE_PACK_INVALID"); const pack = await readStoredSourcePack(row.sourceUriOrKey); if (pack.archive.checksum !== row.checksum) throw new Error("SOURCE_FIGURE_SOURCE_PACK_INVALID"); return { courseId: row.courseId, pack }; } };

async function assertSourceFigureMapping(input: z.infer<typeof requestSchema>, deps: Dependencies) {
  const { courseId, pack } = await deps.loadPack(input.sourcePackImportId);
  if (courseId !== input.courseId || pack.archive.checksum !== input.sourcePackChecksum) throw new Error("SOURCE_FIGURE_SOURCE_PACK_NOT_IN_SCOPE");
  const document = pack.manifest.documents.find(document => document.id === input.sourceDocumentId);
  if (!document || document.originalSha256 !== input.sourceChecksum || document.unitKind !== "page" || input.pageNumber > document.expectedUnits) throw new Error("SOURCE_FIGURE_SOURCE_DOCUMENT_MISMATCH");
  const bytes = pack.archive.files.get(document.markdownPath);
  if (!bytes) throw new Error("SOURCE_FIGURE_SOURCE_DOCUMENT_MISMATCH");
  const markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const matches = [...markdown.matchAll(/^:::visual-explanation\s*\n([\s\S]*?)^:::\s*$/gm)].filter(match => match[1].match(/^id:\s*(.+)$/m)?.[1].trim() === input.sourceVisualId);
  if (matches.length !== 1 || Number(matches[0][1].match(/^source-unit:\s*(\d+)\s*$/m)?.[1]) !== input.pageNumber) throw new Error("SOURCE_FIGURE_SOURCE_VISUAL_MISMATCH");
  const activeUnit = [...markdown.slice(0, matches[0].index).matchAll(/<!--\s*source-unit:\s*(\d+)\s*-->/g)].at(-1)?.[1];
  if (Number(activeUnit) !== input.pageNumber) throw new Error("SOURCE_FIGURE_SOURCE_VISUAL_MISMATCH");
}
const keyFor = (request: { courseId: string; materialId: string; assetId: string }, leaf: Parameters<typeof buildSourceFigureKey>[0]["leaf"]) => buildSourceFigureKey({ ...request, leaf });
async function readJson(store: Store, key: string) { if (!store.download) throw new Error("STORAGE_DOWNLOAD_UNSUPPORTED"); return JSON.parse(new TextDecoder().decode(await store.download(key))); }
async function writeJson(store: Store, key: string, value: unknown) { await store.upload(new TextEncoder().encode(JSON.stringify(value)), key.split("/").pop()!, "application/json", { key }); }
async function scoped(input: { fileKey: string; assetId: string }, deps: Dependencies) {
  const { row, token } = await deps.resolve(input.fileKey);
  const base = { courseId: row.courseId, materialId: row.id, assetId: input.assetId };
  const request = validatedRequest(await readJson(deps.store, keyFor(base, "request.json")));
  if (request.courseId !== row.courseId || request.materialId !== row.id || request.storageKey !== row.fileUrl || request.sourceVersion !== token.updatedAtMs || (row.checksum && request.sourceChecksum !== row.checksum)) throw new Error("SOURCE_FIGURE_NOT_IN_SCOPE");
  return request;
}

export async function extractSourceFigure(input: z.input<typeof extractSourceFigureSchema>, auth: Auth, deps = defaults) {
  const parsed = extractSourceFigureSchema.parse(input);
  const { row, token } = await deps.resolve(parsed.fileKey);
  if (!row.checksum || !hash.safeParse(row.checksum).success) throw new Error("SOURCE_FIGURE_SOURCE_CHECKSUM_REQUIRED");
  const { fileKey: _fileKey, retry, ...spec } = parsed;
  const content = { ...spec, ...auth, courseId: row.courseId, materialId: row.id, storageKey: row.fileUrl, sourceVersion: token.updatedAtMs, sourceChecksum: row.checksum, renderer: SOURCE_FIGURE_RENDERER };
  const request = validatedRequest({ ...content, assetId: figureChecksum(JSON.stringify(identitySchema.parse(content))) });
  await assertSourceFigureMapping(request, deps);
  const key = keyFor(request, "request.json");
  if (!await deps.store.exists(key)) await writeJson(deps.store, key, request);
  const complete = await deps.store.exists(keyFor(request, "manifest.json"));
  if (!complete && await deps.store.exists(keyFor(request, "state.json"))) {
    const state = await readJson(deps.store, keyFor(request, "state.json"));
    if (state.status === "failed") {
      if (!retry) return { jobId: request.assetId, assetId: request.assetId, status: "failed" };
      const attemptId = randomUUID();
      await writeJson(deps.store, keyFor(request, "state.json"), { status: "pending", attemptId });
      try { await deps.enqueue({ ...request, attemptId }); }
      catch { await writeJson(deps.store, keyFor(request, "state.json"), { status: "failed", error: "SOURCE_FIGURE_ENQUEUE_FAILED" }); throw new Error("SOURCE_FIGURE_ENQUEUE_FAILED"); }
      return { jobId: request.assetId, assetId: request.assetId, status: "pending" };
    }
  }
  if (!complete) await deps.enqueue(request);
  return { jobId: request.assetId, assetId: request.assetId, status: complete ? "complete" : "pending" };
}

export async function getSourceFigureJob(input: z.input<typeof sourceFigureRefSchema>, auth: Auth, deps = defaults) {
  const request = await scoped(sourceFigureRefSchema.parse(input), deps);
  if (request.actorId !== auth.actorId || request.sessionId !== auth.sessionId) throw new Error("SOURCE_FIGURE_JOB_NOT_IN_SCOPE");
  if (await deps.store.exists(keyFor(request, "manifest.json"))) return { jobId: request.assetId, status: "complete", assetId: request.assetId };
  return { jobId: request.assetId, ...await (deps.store.exists(keyFor(request, "state.json")).then(exists => exists ? readJson(deps.store, keyFor(request, "state.json")) : { status: "pending" })) };
}

export async function getSourceFigure(input: z.input<typeof sourceFigureRefSchema>, deps = defaults) {
  const request = await scoped(sourceFigureRefSchema.parse(input), deps);
  return verifiedFigure(request, deps);
}

async function verifiedFigure(request: z.infer<typeof requestSchema>, deps: Dependencies) {
  const manifest = sourceFigureManifestSchema.parse(await readJson(deps.store, keyFor(request, "manifest.json")));
  const { actorId: _actor, sessionId: _session, storageKey: _storage, ...provenance } = request;
  if (Object.entries(provenance).some(([key, value]) => JSON.stringify(manifest[key as keyof typeof manifest]) !== JSON.stringify(value))) throw new Error("SOURCE_FIGURE_MANIFEST_INVALID");
  await assertSourceFigureMapping(request, deps);
  if (!deps.store.download) throw new Error("STORAGE_DOWNLOAD_UNSUPPORTED");
  const variants = await Promise.all(manifest.variants.map(async variant => {
    if (variant.key !== keyFor(request, `${variant.name}.png`)) throw new Error("SOURCE_FIGURE_VARIANT_INVALID");
    if (figureChecksum(await deps.store.download!(variant.key)) !== variant.checksum) throw new Error("SOURCE_FIGURE_CHECKSUM_MISMATCH");
    return { ...variant, ...(deps.store.getSignedUrl ? { deliveryUrl: await deps.store.getSignedUrl(variant.key, "get", undefined, 300) } : {}) };
  }));
  return { ...manifest, variants, publicationAllowed: manifest.permission !== "unknown" };
}

/** Server callers must authorize the learner/operator for this legacy course before resolving. */
export async function resolveSourceFigureForCourse(input: { courseId: string; materialId: string; assetId: string }, deps = defaults) {
  hash.parse(input.assetId);
  const [row] = await db.select({ id: courseMaterials.id, courseId: courseMaterials.courseId, fileUrl: courseMaterials.fileUrl, checksum: courseMaterials.checksum, updatedAt: courseMaterials.updatedAt })
    .from(courseMaterials).where(and(eq(courseMaterials.id, input.materialId), eq(courseMaterials.courseId, input.courseId))).limit(1);
  if (!row) throw new Error("SOURCE_FIGURE_NOT_IN_SCOPE");
  const request = validatedRequest(await readJson(deps.store, keyFor(input, "request.json")));
  if (request.courseId !== row.courseId || request.materialId !== row.id || request.storageKey !== row.fileUrl || request.sourceVersion !== normalizeDate(row.updatedAt).getTime() || (row.checksum && row.checksum !== request.sourceChecksum)) throw new Error("SOURCE_FIGURE_NOT_IN_SCOPE");
  return verifiedFigure(request, deps);
}

export async function listSourceFigures(input: z.input<typeof sourceFigureListSchema>, deps = defaults) {
  const parsed = sourceFigureListSchema.parse(input);
  const { row } = await deps.resolve(parsed.fileKey);
  if (!deps.store.list) throw new Error("STORAGE_LIST_UNSUPPORTED");
  const prefix = keyFor({ courseId: row.courseId, materialId: row.id, assetId: "0".repeat(64) }, "manifest.json").split("/").slice(0, -2).join("/") + "/";
  const ids = (await deps.store.list(prefix)).filter(item => item.key.endsWith("/manifest.json")).map(item => item.key.split("/").at(-2)!).filter(id => hash.safeParse(id).success && (!parsed.cursor || id > parsed.cursor)).sort();
  const selected = ids.slice(0, parsed.limit);
  const figures: Array<Awaited<ReturnType<typeof getSourceFigure>>> = [];
  for (const assetId of selected) { try { figures.push(await getSourceFigure({ fileKey: parsed.fileKey, assetId }, deps)); } catch { /* Stale or incomplete versions are not usable assets. */ } }
  return { figures, nextCursor: ids.length > selected.length ? selected.at(-1) : null };
}

export async function sourceFigureVariantBytes(input: z.input<typeof sourceFigureRefSchema> & { variant: "preview" | "print" }, deps = defaults) {
  const manifest = await getSourceFigure(input, deps);
  const variant = manifest.variants.find(item => item.name === input.variant);
  if (!variant || !deps.store.download) throw new Error("SOURCE_FIGURE_VARIANT_UNAVAILABLE");
  const bytes = await deps.store.download(variant.key);
  if (figureChecksum(bytes) !== variant.checksum) throw new Error("SOURCE_FIGURE_CHECKSUM_MISMATCH");
  return { bytes, mimeType: "image/png" as const, checksum: variant.checksum, width: variant.width, height: variant.height };
}

export async function processSourceFigure(data: unknown, deps = defaults) {
  const request = validatedRequest(data);
  if (!request.storageKey.startsWith(`courses/${slugifySegment(request.courseId)}/materials/`)) throw new Error("SOURCE_FIGURE_NOT_IN_SCOPE");
  if (request.renderer !== SOURCE_FIGURE_RENDERER) {
    if (!await deps.store.exists(keyFor(request, "manifest.json"))) throw new Error("SOURCE_FIGURE_RENDERER_CHANGED");
    await verifiedFigure(request, deps);
    return { status: "complete", assetId: request.assetId };
  }
  await assertSourceFigureMapping(request, deps);
  if (!deps.store.download) throw new Error("STORAGE_DOWNLOAD_UNSUPPORTED");
  await writeJson(deps.store, keyFor(request, "state.json"), { status: "running" });
  const bytes = await deps.store.download(request.storageKey);
  if (figureChecksum(bytes) !== request.sourceChecksum) throw new Error("SOURCE_FIGURE_SOURCE_CHANGED");
  const rendered = await deps.render(bytes, request.pageNumber, request.crop);
  const variants: z.infer<typeof sourceFigureManifestSchema>["variants"] = [];
  for (const variant of rendered.variants) {
    const key = keyFor(request, `${variant.name}.png`);
    await deps.store.upload(variant.png, `${variant.name}.png`, "image/png", { key });
    if (figureChecksum(await deps.store.download(key)) !== variant.checksum) throw new Error("SOURCE_FIGURE_UPLOAD_INCOMPLETE");
    variants.push({ name: variant.name, key, checksum: variant.checksum, width: variant.width, height: variant.height });
  }
  const { actorId: _actor, sessionId: _session, storageKey: _storage, ...provenance } = request;
  const { variants: _renderedVariants, ...geometry } = rendered;
  const manifest = sourceFigureManifestSchema.parse({ ...provenance, ...geometry, schemaVersion: "source-figure.v1", variants });
  // The manifest is the commit marker; partial variant uploads never become usable figures.
  await writeJson(deps.store, keyFor(request, "manifest.json"), manifest);
  return { status: "complete", assetId: request.assetId };
}

export async function failSourceFigure(data: unknown) {
  const request = validatedRequest(data);
  await writeJson(storage, keyFor(request, "state.json"), { status: "failed", error: "SOURCE_FIGURE_EXTRACTION_FAILED" });
}

