import { createHash } from "node:crypto";
import { z } from "zod";
import { storage, type StorageProvider } from "@/lib/storage";
import { buildSourceFileMetadataKey } from "@/lib/storage/keys";

type SourceVersion = { storageKey: string; updatedAtMs: number; checksum: string | null };
const metadataSchema = z.object({ checksum: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().positive().max(50 * 1024 * 1024) });
type Metadata = z.infer<typeof metadataSchema>;

function metadataKey(source: SourceVersion) {
  const fingerprint = createHash("sha256").update(JSON.stringify([source.storageKey, source.updatedAtMs, source.checksum])).digest("hex");
  return buildSourceFileMetadataKey(fingerprint);
}

export async function readSourceFileMetadata(source: SourceVersion, store: Pick<StorageProvider, "exists" | "download"> = storage): Promise<Metadata | null> {
  if (!store.download) throw new Error("STORAGE_DOWNLOAD_UNSUPPORTED");
  const key = metadataKey(source);
  if (!await store.exists(key)) return null;
  const bytes = await store.download(key);
  try {
    const result = metadataSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return result.success ? result.data : null;
  } catch { return null; }
}

export async function writeSourceFileMetadata(source: SourceVersion, value: Metadata, store: Pick<StorageProvider, "upload"> = storage) {
  const key = metadataKey(source);
  const data = metadataSchema.parse(value);
  if (source.checksum && source.checksum !== data.checksum) throw new Error("AUTHORING_MCP_SOURCE_FILE_CHECKSUM_MISMATCH");
  await store.upload(new TextEncoder().encode(JSON.stringify(data)), "metadata.json", "application/json", { key });
}
