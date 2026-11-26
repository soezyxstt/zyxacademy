import { openDatabaseAsync } from "expo-sqlite";
import { createOfflineMetadataStore, type NativeOfflineMetadataStore } from "./metadata-store";

let repository: Promise<NativeOfflineMetadataStore> | undefined;

export function openExpoOfflineMetadataStore(): Promise<NativeOfflineMetadataStore> {
  repository ??= openDatabaseAsync("zyx-offline-reading-metadata.db")
    .then(createOfflineMetadataStore)
    .catch(error => {
      repository = undefined;
      throw error;
    });
  return repository;
}
