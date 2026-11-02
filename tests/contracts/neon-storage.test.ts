import { afterEach, describe, expect, mock, test } from "bun:test";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getS3StorageConfig, R2Provider } from "@/lib/storage/r2";

const names = ["NEON_STORAGE_BUCKET", "AWS_ENDPOINT_URL_S3", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  mock.restore();
  for (const name of names) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
});

function configureNeon() {
  process.env.NEON_STORAGE_BUCKET = "private-files";
  process.env.AWS_ENDPOINT_URL_S3 = "https://storage.example.test";
  process.env.AWS_REGION = "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = "test-key";
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
}

describe("Neon S3 storage", () => {
  test("requires explicit credentials and uses path-style private storage", () => {
    for (const name of names) delete process.env[name];
    expect(() => getS3StorageConfig("neon")).toThrow("NEON_STORAGE_CONFIG_REQUIRED");
    configureNeon();
    const config = getS3StorageConfig("neon");
    expect(config.bucket).toBe("private-files");
    expect(config.publicUrl).toBe("");
    expect(config.client.forcePathStyle).toBe(true);
    expect(config.client.endpoint).toBe("https://storage.example.test");
  });

  test("uses the configured bucket and keeps upload keys and downloads private", async () => {
    configureNeon();
    const send = mock(async (command: any) => command instanceof GetObjectCommand
      ? { Body: { transformToByteArray: async () => new Uint8Array([1, 2]) } }
      : {});
    const provider = new R2Provider("neon");
    (provider as any).s3.send = send;
    await expect(provider.upload(new Uint8Array([1]), "x", "text/plain", { key: "../x" })).rejects.toThrow("INVALID_OBJECT_KEY");
    expect(send).not.toHaveBeenCalled();
    expect(await provider.upload(new Uint8Array([1]), "x", "text/plain", { key: "files/x" })).toEqual({ url: "files/x", key: "files/x", size: 1 });
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[0][0].input.Bucket).toBe("private-files");
    expect(provider.getUrl("files/x")).toBe("/api/storage/file/files/x");
    expect(await provider.download("files/x")).toEqual(new Uint8Array([1, 2]));
    await provider.delete("files/x");
    expect(send.mock.calls[2][0]).toBeInstanceOf(DeleteObjectCommand);
  });

  test("routes only legacy R2 public URLs through the Neon proxy", () => {
    configureNeon();
    const old = process.env.R2_PUBLIC_URL;
    process.env.R2_PUBLIC_URL = "https://assets.example.test/base";
    try {
      const provider = new R2Provider("neon");
      expect(provider.getUrl("https://assets.example.test/base/files/a%20b.pdf?download=1")).toBe("/api/storage/file/files/a%20b.pdf?download=1");
      expect(provider.getUrl("https://assets.example.test/base-other/a.pdf")).toBe("https://assets.example.test/base-other/a.pdf");
      expect(provider.getUrl("https://other.example.test/a.pdf")).toBe("https://other.example.test/a.pdf");
      expect(new R2Provider().getUrl("https://assets.example.test/base/files/a.pdf")).toBe("https://assets.example.test/base/files/a.pdf");
    } finally {
      if (old === undefined) delete process.env.R2_PUBLIC_URL;
      else process.env.R2_PUBLIC_URL = old;
    }
  });
});
