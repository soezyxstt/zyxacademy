import { execFile } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { StorageProvider } from "./index";

const execFileAsync = promisify(execFile);

function objectPath(bucket: string, key: string): string {
  if (!key || key.startsWith("/") || key.includes("\\") || key.includes("..")) {
    throw new Error("WRANGLER_R2_INVALID_OBJECT_KEY");
  }
  return `${bucket}/${key}`;
}

function temporaryRoot(): string {
  return process.env.STAGING_BUNDLE_WRANGLER_TMP || join(/* turbopackIgnore: true */ tmpdir(), "zyx-staging-r2");
}

async function asBytes(file: File | Buffer | Uint8Array): Promise<Uint8Array> {
  if (file instanceof Uint8Array) return file;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) return new Uint8Array(file);
  return new Uint8Array(await (file as File).arrayBuffer());
}

export class WranglerR2Provider implements StorageProvider {
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET || "zyx-staging";
    if (this.bucket !== "zyx-staging") throw new Error("WRANGLER_R2_STAGING_BUCKET_REQUIRED");
  }

  private async run(args: string[]): Promise<void> {
    try {
      await execFileAsync(process.platform === "win32" ? "bunx.exe" : "bunx", ["wrangler", ...args], {
        cwd: process.cwd(),
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      });
    } catch (error) {
      const detail = error as { stdout?: string; stderr?: string; message?: string };
      const output = `${detail.stderr || ""}\n${detail.stdout || ""}`.trim().replace(/\s+/g, " ").slice(0, 500);
      throw new Error(`WRANGLER_R2_COMMAND_FAILED:${output || detail.message || "unknown"}`);
    }
  }

  private async withTempFile<T>(suffix: string, action: (filePath: string) => Promise<T>): Promise<T> {
    const root = temporaryRoot();
    await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
    const filePath = join(/* turbopackIgnore: true */ root, `${randomUUID()}${suffix}`);
    try {
      return await action(filePath);
    } finally {
      await unlink(/* turbopackIgnore: true */ filePath).catch(() => undefined);
    }
  }

  async upload(
    file: File | Buffer | Uint8Array,
    filename: string,
    mimeType: string,
    options?: any
  ): Promise<{ url: string; key: string; size: number }> {
    const bytes = await asBytes(file);
    const key = options?.key || `${randomUUID()}-${filename.replace(/\s+/g, "_")}`;
    const target = objectPath(this.bucket, key);
    await this.withTempFile(".upload", async (filePath) => {
      await writeFile(/* turbopackIgnore: true */ filePath, bytes);
      await this.run([
        "r2",
        "object",
        "put",
        target,
        "--file",
        filePath,
        "--remote",
        "-y",
        ...(mimeType ? ["--content-type", mimeType] : []),
      ]);
    });
    return { url: key, key, size: bytes.byteLength };
  }

  async delete(key: string): Promise<void> {
    await this.run(["r2", "object", "delete", objectPath(this.bucket, key), "--remote", "-y"]);
  }

  getUrl(key: string): string {
    return key;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.download(key);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Object not found")) return false;
      throw error;
    }
  }

  async download(key: string): Promise<Uint8Array> {
    return this.withTempFile(".download", async (filePath) => {
      await this.run(["r2", "object", "get", objectPath(this.bucket, key), "--file", filePath, "--remote"]);
      return new Uint8Array(await readFile(/* turbopackIgnore: true */ filePath));
    });
  }

  async copy(sourceKey: string, destKey: string): Promise<{ url: string; key: string }> {
    const bytes = await this.download(sourceKey);
    return this.upload(bytes, destKey, "application/octet-stream", { key: destKey });
  }

  async getSignedUrl(): Promise<string> {
    throw new Error("WRANGLER_R2_SIGNED_URL_UNSUPPORTED");
  }

  async rename(key: string, newName: string): Promise<void> {
    await this.copy(key, newName);
    await this.delete(key);
  }
}
