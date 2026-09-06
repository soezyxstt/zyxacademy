export interface StorageProvider {
  upload(
    file: File | Buffer | Uint8Array,
    filename: string,
    mimeType: string,
    options?: any
  ): Promise<{ url: string; key: string; size: number }>;
  
  delete(key: string): Promise<void>;
  
  getUrl(key: string): string;
  
  exists(key: string): Promise<boolean>;

  download?(key: string): Promise<Uint8Array>;
  
  copy(sourceKey: string, destKey: string): Promise<{ url: string; key: string }>;

  getSignedUrl?(
    key: string,
    operation: "get" | "put",
    mimeType?: string,
    expiresIn?: number
  ): Promise<string>;

  rename?(key: string, newName: string): Promise<void>;

  /**
   * Lists objects under a key prefix (used by the Media Library browser).
   * Folders are derived from key segments; only leaf objects are returned.
   */
  list?(prefix: string): Promise<{ key: string; size: number; lastModified: Date }[]>;
}

import { R2Provider } from "./r2";
import { WranglerR2Provider } from "./wrangler-r2";

// Cloudflare R2 is the default storage provider
const providerMode = "r2";
const useWranglerStagingStorage = process.env.STAGING_BUNDLE_WRANGLER_STORAGE === "1";

let activeProvider: StorageProvider;

if (useWranglerStagingStorage) {
  activeProvider = new WranglerR2Provider();
} else {
  activeProvider = new R2Provider();
}

export const storage = activeProvider;
export const STORAGE_PROVIDER_MODE = providerMode;
