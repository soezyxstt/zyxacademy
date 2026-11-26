/** Lightweight database/domain types. Keep validation and reader graphs out of
 * the schema dependency graph; the API validates these fields at its boundary. */
export interface OfflinePolicySettings {
  metadataMaxAgeMs: number;
  contentMaxAgeMs: number;
  retentionMs: number;
  accessLeaseMs: number;
  activeCheckIntervalMs: number;
  maxBytes: number;
  maxEntries: number;
  autoCache: boolean;
  wifiOnly: boolean;
  schedule: {
    frequency: "daily" | "weekly";
    weekday: number;
    hour: number;
    timeZone: "Asia/Jakarta";
  };
}

export interface OfflinePolicy extends OfflinePolicySettings {
  revision: number;
  updatedAt: number;
}
