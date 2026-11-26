import { parseReadingData, READING_ASSET_LIMIT, READING_BODY_LIMIT, READING_PACKAGE_LIMIT } from "../../../offline/reading-contract";
import { readingAssetDataUrl, type ReadingContent } from "../../../offline/reading-document";
import type { StudentRequest, StudentResponse } from "../contracts";

type Target = { courseId: string; materialId: string; kind: ReadingContent["kind"]; section?: string };

export class OnlineReadingError extends Error {
  constructor(readonly status: number) { super("Unable to read this material."); }
}

const path = "/api/native/student/reading";
function assertActive(signal: AbortSignal) {
  if (signal.aborted) throw new Error("Reading cancelled.");
}
const toMime = (response: StudentResponse) => response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
const isImage = (mime: string) => /^image\/(?:png|jpeg|webp|gif|avif|svg\+xml)$/.test(mime);
const safeReference = (source: unknown): source is string => typeof source === "string" && source.length <= 4096
  && /^(?:https?:\/\/|\/(?!\/))/i.test(source) && !/[\u0000-\u001f#]/.test(source);

async function bytes(response: StudentResponse, limit: number) {
  const declared = Number(response.headers.get("content-length"));
  if (declared > limit) throw new OnlineReadingError(413);
  // The host's authenticated origin serves a bounded representation.
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength > limit) throw new OnlineReadingError(413);
  return data;
}

export async function readOnlineMaterial(request: StudentRequest, target: Target, locale: ReadingContent["locale"], signal: AbortSignal): Promise<ReadingContent> {
  const { courseId, materialId, kind, section } = target;
  const query = { courseId, materialId };
  assertActive(signal);
  const response = await request(path + "?" + new URLSearchParams(query), { signal });
  let value: unknown;
  let remaining = READING_PACKAGE_LIMIT;
  try {
    if (!response.ok) throw new OnlineReadingError(response.status);
    if (toMime(response) !== "application/json") throw new OnlineReadingError(502);
    const body = await bytes(response, READING_BODY_LIMIT);
    remaining -= body.byteLength;
    value = JSON.parse(new TextDecoder().decode(body));
  } finally { response.dispose?.(); }
  assertActive(signal);
  if (!value || typeof value !== "object") throw new OnlineReadingError(502);
  const row = value as Record<string, unknown>;
  if (row.courseId !== courseId || row.id !== materialId || row.kind !== kind || typeof row.title !== "string"
    || typeof row.revision !== "string" || !/^[a-f0-9]{64}$/.test(row.revision)
    || !Array.isArray(row.assets) || row.assets.length > 80 || !row.assets.every(safeReference)) throw new OnlineReadingError(502);
  const data = parseReadingData(row.data, { kind, id: materialId, courseId });
  const sources = new Map<string, string>();
  for (const asset of new Set(row.assets as string[])) {
    if (remaining <= 0) break;
    assertActive(signal);
    const assetResponse = await request(path + "?" + new URLSearchParams({ ...query, asset, revision: row.revision }), { signal });
    try {
      if ([401, 403, 409].includes(assetResponse.status)) throw new OnlineReadingError(assetResponse.status);
      const mime = toMime(assetResponse);
      if (!assetResponse.ok || !isImage(mime)) continue;
      const content = await bytes(assetResponse, Math.min(remaining, READING_ASSET_LIMIT));
      remaining -= content.byteLength;
      const src = readingAssetDataUrl({ mime, bytes: content });
      if (src) sources.set(asset, src);
    } finally { assetResponse.dispose?.(); }
  }
  assertActive(signal);
  return { kind, title: row.title, data, locale, section, resolveImage: source => sources.get(source) };
}
