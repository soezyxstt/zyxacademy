import type { NativeOfflineReadingStore } from "./reading-store";

export async function openExpoOfflineReadingStore(): Promise<NativeOfflineReadingStore> {
  throw new Error("Offline reading requires the native SQLite adapter.");
}

export async function verifyExpoOfflineReadingAsset(_bytes: Uint8Array<ArrayBuffer>, _expected: string): Promise<boolean> {
  return false;
}
