import { expect, it } from "bun:test";
import { readSourceFileMetadata, writeSourceFileMetadata } from "@/lib/authoring/source-file-metadata";

it("reuses checksum metadata only for the same source version", async () => {
  const objects = new Map<string, Uint8Array>();
  const store = {
    exists: async (key: string) => objects.has(key),
    download: async (key: string) => objects.get(key)!,
    upload: async (data: unknown, _name: string, _mime: string, options: { key: string }) => {
      if (!(data instanceof Uint8Array)) throw new Error("expected bytes");
      objects.set(options.key, data);
      return { key: options.key, url: options.key, size: data.byteLength };
    },
  };
  const source = { storageKey: "courses/test/materials/book.pdf", updatedAtMs: 1, checksum: null };
  const metadata = { checksum: "a".repeat(64), size: 100 };
  await writeSourceFileMetadata(source, metadata, store);
  expect(await readSourceFileMetadata(source, store)).toEqual(metadata);
  expect(await readSourceFileMetadata({ ...source, updatedAtMs: 2 }, store)).toBeNull();
  await expect(writeSourceFileMetadata({ ...source, checksum: "b".repeat(64) }, metadata, store)).rejects.toThrow("CHECKSUM_MISMATCH");
  objects.set([...objects.keys()][0], new TextEncoder().encode("broken"));
  expect(await readSourceFileMetadata(source, store)).toBeNull();
});
