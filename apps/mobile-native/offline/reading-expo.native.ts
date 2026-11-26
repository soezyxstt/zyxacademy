import { CryptoDigestAlgorithm, digest } from "expo-crypto";
import { openDatabaseAsync } from "expo-sqlite";

import { EXPO_OFFLINE_DATABASE_NAME } from "./metadata-store";
import { createOfflineReadingStore, type NativeOfflineReadingStore } from "./reading-store";

let repository: Promise<NativeOfflineReadingStore> | undefined;

export function openExpoOfflineReadingStore(): Promise<NativeOfflineReadingStore> {
  repository ??= openDatabaseAsync(EXPO_OFFLINE_DATABASE_NAME)
    .then(db => createOfflineReadingStore(db))
    .catch(error => {
      repository = undefined;
      throw error;
    });
  return repository;
}

export async function verifyExpoOfflineReadingAsset(bytes: Uint8Array<ArrayBuffer>, expected: string) {
  const result = new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, bytes));
  return Array.from(result, byte => byte.toString(16).padStart(2, "0")).join("") === expected;
}
