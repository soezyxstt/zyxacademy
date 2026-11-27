import { openDatabaseAsync } from "expo-sqlite";
import { EXPO_OFFLINE_DATABASE_NAME } from "./metadata-store";

type ExpoOfflineDatabase = Awaited<ReturnType<typeof openDatabaseAsync>>;

let database: Promise<ExpoOfflineDatabase> | undefined;

export function openExpoOfflineDatabase(): Promise<ExpoOfflineDatabase> {
  database ??= openDatabaseAsync(EXPO_OFFLINE_DATABASE_NAME)
    .then(async db => {
      await db.execAsync("PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;");
      return db;
    })
    .catch(error => {
      database = undefined;
      throw error;
    });
  return database;
}
