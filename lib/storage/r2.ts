import { 
  S3Client, 
  PutObjectCommand, 
  DeleteObjectCommand, 
  HeadObjectCommand, 
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  type _Object
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider } from "./index";
import { assertSafeKey, INVALID_OBJECT_KEY } from "./keys";

export class R2Provider implements StorageProvider {
  private s3: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET || "zyx";
    this.publicUrl = process.env.R2_PUBLIC_URL || "";
    
    this.s3 = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    });
  }

  async upload(
    file: File | Buffer | Uint8Array,
    filename: string,
    mimeType: string,
    options?: any
  ): Promise<{ url: string; key: string; size: number }> {
    // Keys are structured (`{domain}/{entity-slug}/{subfolder...}/{leaf}`); the
    // caller must always pass an explicit safe key.
    const key = options?.key;
    if (!key) throw new Error(INVALID_OBJECT_KEY);
    assertSafeKey(key);
    
    let body: Uint8Array;
    let size: number;
    
    if (file instanceof Uint8Array) {
      body = file;
      size = file.byteLength;
    } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
      body = new Uint8Array(file);
      size = file.byteLength;
    } else {
      const f = file as File;
      const arrayBuffer = await f.arrayBuffer();
      body = new Uint8Array(arrayBuffer);
      size = f.size;
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
      Metadata: options?.metadata || {},
    });

    await this.s3.send(command);

    // Condition: only return/store the key in the database!
    // Storing key as the url so ufsUrl / fileUrl holds only the key.
    return {
      url: key,
      key,
      size,
    };
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.s3.send(command);
  }

  getUrl(key: string): string {
    if (!key) return "";
    // If it's already a full URL (starts with http), return it as-is (legacy compatibility)
    if (key.startsWith("http://") || key.startsWith("https://")) {
      return key;
    }
    // Use relative path for Next.js to dynamically resolve to the active origin
    return `/api/storage/file/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.s3.send(command);
      return true;
    } catch (err: any) {
      // Check if it's a 404/Not Found
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  async download(key: string): Promise<Uint8Array> {
    assertSafeKey(key);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const response = await this.s3.send(command);
      if (!response.Body) throw new Error("R2 object has no body");
      return response.Body.transformToByteArray();
    } catch {
      if (!this.publicUrl) throw new Error("R2_DOWNLOAD_FAILED");

      try {
        const publicKey = key.split("/").map(encodeURIComponent).join("/");
        const response = await fetch(`${this.publicUrl.replace(/\/+$/, "")}/${publicKey}`, { cache: "no-store" });
        if (!response.ok) throw new Error("R2_DOWNLOAD_FAILED");
        return new Uint8Array(await response.arrayBuffer());
      } catch {
        throw new Error("R2_DOWNLOAD_FAILED");
      }
    }
  }

  async copy(sourceKey: string, destKey: string): Promise<{ url: string; key: string }> {
    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      Key: destKey,
      CopySource: `${this.bucket}/${sourceKey}`,
    });
    
    await this.s3.send(command);
    
    return {
      url: destKey,
      key: destKey,
    };
  }

  // Helper method for generating presigned URLs (Signed URL requirement)
  async getSignedUrl(
    key: string,
    operation: "get" | "put",
    mimeType?: string,
    expiresIn = 3600
  ): Promise<string> {
    if (operation === "get") {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      return getSignedUrl(this.s3, command, { expiresIn });
    } else {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
      });
      return getSignedUrl(this.s3, command, { expiresIn });
    }
  }

  async list(prefix: string): Promise<{ key: string; size: number; lastModified: Date }[]> {
    const objects: _Object[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      const response = await this.s3.send(command);
      objects.push(...(response.Contents || []));
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return objects
      .filter((obj) => obj.Key && !obj.Key.endsWith("/"))
      .map((obj) => ({
        key: obj.Key as string,
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(0),
      }));
  }
}
