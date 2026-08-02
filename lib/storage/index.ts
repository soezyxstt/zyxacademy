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
}

// Dynamically select the provider based on the environment flag
const providerMode = process.env.STORAGE_PROVIDER_MODE || "r2";
const useWranglerStagingStorage = process.env.STAGING_BUNDLE_WRANGLER_STORAGE === "1";

let activeProvider: StorageProvider;

if (useWranglerStagingStorage) {
  const { WranglerR2Provider } = require("./wrangler-r2");
  activeProvider = new WranglerR2Provider();
} else if (providerMode === "uploadthing") {
  // Use require dynamically to avoid loading S3 SDK/UploadThing unused packages in certain environments
  const { UploadThingProvider } = require("./uploadthing-provider");
  activeProvider = new UploadThingProvider();
} else {
  const { R2Provider } = require("./r2");
  activeProvider = new R2Provider();
}

export const storage = activeProvider;
export const STORAGE_PROVIDER_MODE = providerMode;
