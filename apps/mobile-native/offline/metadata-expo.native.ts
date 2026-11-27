import { openExpoOfflineDatabase } from "./database-expo.native";
import { createOfflineMetadataStore, type NativeOfflineMetadataStore } from "./metadata-store";

let repository: Promise<NativeOfflineMetadataStore> | undefined;

export function openExpoOfflineMetadataStore(): Promise<NativeOfflineMetadataStore> {
  repository ??= openExpoOfflineDatabase()
    .then(createOfflineMetadataStore)
    .catch(error => {
      repository = undefined;
      throw error;
    });
  return repository;
}
