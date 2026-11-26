import type { NativeOfflineMetadataStore } from "./metadata-store";

export async function openExpoOfflineMetadataStore(): Promise<NativeOfflineMetadataStore> {
  throw new Error("Offline metadata requires the native SQLite adapter.");
}
