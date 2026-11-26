import { openDatabaseAsync } from "expo-sqlite";
import { createOfflineMetadataStore, EXPO_OFFLINE_DATABASE_NAME, type NativeOfflineMetadataStore } from "./metadata-store";

let repository: Promise<NativeOfflineMetadataStore> | undefined;

export function openExpoOfflineMetadataStore(): Promise<NativeOfflineMetadataStore> {
  repository ??= openDatabaseAsync(EXPO_OFFLINE_DATABASE_NAME)
    .then(createOfflineMetadataStore)
    .catch(error => {
      repository = undefined;
      throw error;
    });
  return repository;
}
