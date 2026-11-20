import { storage } from "@/lib/storage";

export async function verifyStagingArtifact(
  key: string,
  restore: () => Promise<unknown>,
  verify: (bytes: Uint8Array) => void,
  errorCode: string,
): Promise<void> {
  try {
    if (!storage.download) throw new Error("Storage download unavailable");
    let bytes: Uint8Array;
    try {
      bytes = await storage.download(key);
    } catch (error) {
      if (await storage.exists(key)) throw error;
      await restore();
      bytes = await storage.download(key);
    }
    verify(bytes);
  } catch (cause) {
    throw new Error(errorCode, { cause });
  }
}
