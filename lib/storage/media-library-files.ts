import "server-only";
import { storage } from "@/lib/storage";
import { assertSafeKey, buildMediaKey, existingMediaFolderPath, leafFilename, isMediaKey, INVALID_OBJECT_KEY } from "@/lib/storage/keys";

export async function uploadMediaLibraryFile(file: File, folderPath: string | null) {
  const folder = existingMediaFolderPath(folderPath);
  const key = buildMediaKey({ folderPath: folder, filename: file.name, preserveFolderPath: true });
  const uploaded = await storage.upload(file, file.name, file.type, { key });
  return { key: uploaded.key, url: storage.getUrl(uploaded.key), size: uploaded.size, folderPath: folder };
}

export async function replaceMediaLibraryFile(file: File, key: string) {
  assertSafeKey(key);
  if (!isMediaKey(key)) throw new Error(INVALID_OBJECT_KEY);
  await storage.upload(file, leafFilename(key), file.type, { key });
  return { key };
}
