import { describe, expect, test } from "bun:test";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { assertInventoryUnchanged, copyObject, listInventory, validateTarget } from "./copy-storage";

const endpoint = "https://br-cool-water-az2xxbul.storage.c-3.ap-southeast-1.aws.neon.tech";
const object = (value: string) => ({ Body: (async function* () { yield Buffer.from(value); })(), ContentLength: Buffer.byteLength(value), ETag: '"etag"' });
const item = { key: "private/key", size: 6, etag: '"etag"', lastModified: "2026-01-01T00:00:00.000Z" };

describe("storage copy", () => {
  test("allows only the exact private migration target", () => {
    expect(() => validateTarget(endpoint, "zyx-migration")).not.toThrow();
    expect(() => validateTarget(`${endpoint}.evil.test`, "zyx-migration")).toThrow();
    expect(() => validateTarget(endpoint, "other")).toThrow();
    expect(() => validateTarget(`${endpoint}/other`, "zyx-migration")).toThrow();
    const staging = "https://br-holy-snow-azveniaa.storage.c-3.ap-southeast-1.aws.neon.tech";
    expect(() => validateTarget(staging, "zyx-staging")).not.toThrow();
    expect(() => validateTarget(staging, "zyx-migration")).toThrow();
    const cutover = "https://br-gentle-scene-azq0gp91.storage.c-3.ap-southeast-1.aws.neon.tech";
    expect(() => validateTarget(cutover, "zyx-staging")).not.toThrow();
    expect(() => validateTarget(cutover, "zyx-migration")).toThrow();
    expect(() => validateTarget(endpoint, "zyx-staging")).toThrow();
  });

  test("dry run never writes and refuses a different destination object", async () => {
    const source = { send: async () => object("source") };
    let writes = 0;
    const missing = { send: async () => { writes++; throw { name: "NoSuchKey" }; } };
    expect(await copyObject(source, missing, "source", item, false)).toBe("would-copy");
    expect(writes).toBe(1);
    const conflict = { send: async () => object("other") };
    await expect(copyObject(source, conflict, "source", item, true)).rejects.toThrow("DESTINATION_CONFLICT");
  });

  test("creates with a no-overwrite precondition and verifies copied bytes", async () => {
    const source = { send: async () => object("source") };
    let uploaded = false;
    const destination = { send: async (command: any) => {
      if (command instanceof PutObjectCommand) {
        expect(command.input.IfNoneMatch).toBe("*");
        expect(command.input.Bucket).toBe("zyx-migration");
        expect(Buffer.isBuffer(command.input.Body)).toBe(true);
        expect(command.input.Body.toString()).toBe("source");
        uploaded = true;
        return {};
      }
      expect(command).toBeInstanceOf(GetObjectCommand);
      if (!uploaded) throw { name: "NoSuchKey" };
      return object("source");
    } };
    expect(await copyObject(source, destination, "source", item, true)).toBe("copied");
  });

  test("staging writes use only the staging bucket", async () => {
    let uploaded = false;
    const destination = { send: async (command: any) => {
      expect(command.input.Bucket).toBe("zyx-staging");
      if (command instanceof PutObjectCommand) { uploaded = true; return {}; }
      if (!uploaded) throw { name: "NoSuchKey" };
      return object("source");
    } };
    expect(await copyObject({ send: async () => object("source") }, destination, "source", item, true, "zyx-staging")).toBe("copied");
    await expect(copyObject({ send: async () => object("source") }, destination, "source", item, true, "other")).rejects.toThrow("INVALID_NEON_STORAGE_TARGET");
  });

  test("rejects a corrupted copy", async () => {
    const source = { send: async () => object("source") };
    let uploaded = false;
    const destination = { send: async (command: any) => {
      if (command instanceof PutObjectCommand) { uploaded = true; return {}; }
      if (!uploaded) throw { name: "NoSuchKey" };
      return object("broken");
    } };
    await expect(copyObject(source, destination, "source", item, true)).rejects.toThrow("COPY_VERIFICATION_FAILED");
  });

  test("rejects source changes before reading or writing destination", async () => {
    const source = { send: async () => object("changed") };
    const destination = { send: async () => { throw new Error("destination called"); } };
    await expect(copyObject(source, destination, "source", item, true)).rejects.toThrow("SOURCE_CHANGED");
  });

  test("inventory detects additions, removals and changed metadata", () => {
    expect(() => assertInventoryUnchanged([item], [{ ...item }])).not.toThrow();
    expect(() => assertInventoryUnchanged([item], [])).toThrow("SOURCE_INVENTORY_CHANGED");
    expect(() => assertInventoryUnchanged([], [item])).toThrow("SOURCE_INVENTORY_CHANGED");
    for (const change of [{ size: 7 }, { etag: '"new"' }, { lastModified: "2026-01-02T00:00:00.000Z" }]) {
      expect(() => assertInventoryUnchanged([item], [{ ...item, ...change }])).toThrow("SOURCE_INVENTORY_CHANGED");
    }
  });

  test("rejects repeated pagination tokens and duplicate keys", async () => {
    const row = { Key: item.key, Size: item.size, ETag: item.etag, LastModified: new Date(item.lastModified) };
    let call = 0;
    const repeat = { send: async () => ({ IsTruncated: true, NextContinuationToken: "same", Contents: call++ ? [] : [row] }) };
    await expect(listInventory(repeat, "source")).rejects.toThrow("SOURCE_LIST_INCOMPLETE");
    const duplicates = { send: async () => ({ IsTruncated: false, Contents: [row, row] }) };
    await expect(listInventory(duplicates, "source")).rejects.toThrow("SOURCE_LIST_INVALID");
  });
});
