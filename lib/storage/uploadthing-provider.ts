import { UTApi } from "uploadthing/server";
import type { StorageProvider } from "./index";

export class UploadThingProvider implements StorageProvider {
  private utapi = new UTApi();

  async upload(
    file: File | Buffer | Uint8Array,
    filename: string,
    mimeType: string,
    _options?: any
  ): Promise<{ url: string; key: string; size: number }> {
    let uploadFile: File;
    
    if (Buffer.isBuffer(file) || file instanceof Uint8Array) {
      uploadFile = new File([new Uint8Array(file)], filename, { type: mimeType });
    } else {
      uploadFile = file as File;
    }

    const response = await this.utapi.uploadFiles([uploadFile]);
    const data = response[0]?.data;
    const error = response[0]?.error;

    if (error || !data) {
      throw new Error(`UploadThing upload failed: ${error?.message || "empty response"}`);
    }

    // Condition: only return/store the key in the database!
    // But since the provider's `upload` is expected to return the URL for retrieval and key for deletion,
    // we return key as the URL to save space in db, and key as key.
    // When getUrl(key) is called, it will resolve it to the full URL!
    return {
      url: data.key,
      key: data.key,
      size: data.size,
    };
  }

  async delete(key: string): Promise<void> {
    await this.utapi.deleteFiles(key);
  }

  getUrl(key: string): string {
    if (!key) return "";
    // If it's already a full URL (starts with http), return it as-is (for legacy data compatibility)
    if (key.startsWith("http://") || key.startsWith("https://")) {
      return key;
    }
    // UploadThing base URL prefix
    return `https://utfs.io/f/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      const url = this.getUrl(key);
      const res = await fetch(url, { method: "HEAD" });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async copy(sourceKey: string, destKey: string): Promise<{ url: string; key: string }> {
    // Download source file
    const url = this.getUrl(sourceKey);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download source file for copying: ${sourceKey}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const mimeType = res.headers.get("content-type") || "application/octet-stream";
    
    return this.upload(buffer, destKey, mimeType);
  }

  async getSignedUrl(
    key: string,
    operation: "get" | "put",
    mimeType?: string,
    _expiresIn = 3600
  ): Promise<string> {
    // UploadThing doesn't natively support S3-like presigning via UTAPI directly here,
    // so we return the standard public URL or throw for PUT since it's client-direct.
    if (operation === "get") {
      return this.getUrl(key);
    }
    throw new Error("Presigned PUT uploads are not supported directly in UploadThingProvider wrapper.");
  }

  async rename(key: string, newName: string): Promise<void> {
    const res = await this.utapi.renameFiles({ fileKey: key, newName });
    if (!res.success) {
      throw new Error(`UploadThing rename failed for key ${key}`);
    }
  }
}
