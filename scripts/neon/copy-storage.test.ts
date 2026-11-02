import { describe, expect, test } from "bun:test";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { assertDestinationInventory, assertInventoryUnchanged, assertObjectMetadata, copyObject, copyObjectWithRetry, listInventory, validateTarget, verifyInventoryMetadata, withBodyDeadline } from "./copy-storage";
import { Readable } from "node:stream";

const endpoint = "https://br-cool-water-az2xxbul.storage.c-3.ap-southeast-1.aws.neon.tech";
const object = (value: string) => ({ Body: (async function* () { yield Buffer.from(value); })(), ContentLength: Buffer.byteLength(value), ETag: '"etag"' });
const item = { key: "private/key", size: 6, etag: '"etag"', lastModified: "2026-01-01T00:00:00.000Z" };

describe("storage copy", () => {
  test("identical bytes with incompatible metadata never produce a signed proof", async () => {
    const proofs: any[]=[];
    await expect(copyObject({send:async()=>({...object("source"),ContentType:"image/png"})}, {send:async()=>({...object("source"),ContentType:"application/octet-stream"})}, "source",item,true,"zyx-production",proof=>proofs.push(proof))).rejects.toThrow("DESTINATION_METADATA_CONFLICT");
    expect(proofs).toHaveLength(0);
    expect(()=>assertObjectMetadata({Metadata:{a:"1",b:"2"}},{Metadata:{b:"2",a:"1"}})).not.toThrow();
    for(const field of ["ContentType","ContentDisposition","ContentEncoding","CacheControl","ContentLanguage","Expires","Metadata"]){
      const value=field==="Expires"?new Date(0):field==="Metadata"?{a:"1"}:"different";
      expect(()=>assertObjectMetadata({[field]:value},{})).toThrow("DESTINATION_METADATA_CONFLICT");
    }
  });
  test("completion rejects extra destination objects independently of checkpoint keys", () => {
    expect(()=>assertDestinationInventory([item],[item])).not.toThrow();
    for(const changed of [[],[item,{...item,key:"stale"}],[{...item,key:"other"}],[{...item,size:7}]])expect(()=>assertDestinationInventory([item],changed)).toThrow("DESTINATION_INVENTORY_MISMATCH");
  });
  test("resumed byte proofs still require fresh matching metadata and object versions", async () => {
    const head={ContentLength:6,ETag:item.etag,LastModified:new Date(item.lastModified),ContentType:"image/png"};
    let requests=0;
    const source={send:async()=>{requests++;return head;}};
    await verifyInventoryMetadata(source,{send:async()=>head},"source","zyx-production",[item],[item]);
    expect(requests).toBe(1);
    await expect(verifyInventoryMetadata(source,{send:async()=>({...head,ContentType:"text/plain"})},"source","zyx-production",[item],[item])).rejects.toThrow("DESTINATION_METADATA_CONFLICT");
    await expect(verifyInventoryMetadata(source,{send:async()=>({...head,ETag:'"changed"'})},"source","zyx-production",[item],[item])).rejects.toThrow("OBJECT_VERSION_CHANGED_DURING_METADATA_CHECK");
  });
  test("a resumable proof is emitted only after bytes and destination version are verified", async () => {
    const proofs: any[] = [];
    const destination = { send: async () => ({...object("source"),LastModified:new Date("2026-01-01T00:00:00Z")}) };
    expect(await copyObject({ send: async () => object("source") }, destination, "source", item, false, "zyx-production", proof => proofs.push(proof))).toBe("identical");
    expect(proofs).toHaveLength(1);
    expect(proofs[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(proofs[0].destination).toEqual({size:6,etag:'"etag"',lastModified:"2026-01-01T00:00:00.000Z"});
    await expect(copyObject({ send: async () => object("source") }, {send:async()=>object("wrong!")}, "source", item, true, "zyx-production", proof=>proofs.push(proof))).rejects.toThrow("DESTINATION_CONFLICT");
    expect(proofs).toHaveLength(1);
  });
  test("a terminated web response is caught and retried without an unhandled stream error", async () => {
    let reads = 0;
    const source = { send: async () => {
      if (++reads > 1) return object("source");
      const body = new ReadableStream({ start(controller) { controller.error(Object.assign(new TypeError("terminated"), { cause: { code: "UND_ERR_SOCKET" } })); } });
      return { Body: body, ContentLength: 6, ETag: '"etag"' };
    } };
    expect(await copyObjectWithRetry(source, { send: async () => object("source") }, "source", item, false)).toBe("identical");
    expect(reads).toBe(2);
  });
  test("retries a transient read once and never retries a data conflict", async () => {
    let reads = 0;
    const source = { send: async () => { if (++reads === 1) throw new TypeError("fetch failed"); return object("source"); } };
    expect(await copyObjectWithRetry(source, { send: async () => object("source") }, "source", item, false)).toBe("identical");
    expect(reads).toBe(2);
    let conflicts = 0;
    await expect(copyObjectWithRetry({ send: async () => object("source") }, { send: async () => { conflicts++; return object("wrong!"); } }, "source", item, true)).rejects.toThrow("DESTINATION_CONFLICT");
    expect(conflicts).toBe(1);
    let failures = 0;
    await expect(copyObjectWithRetry({ send: async () => { failures++; throw new TypeError("fetch failed"); } }, { send: async () => object("source") }, "source", item, false)).rejects.toThrow("fetch failed");
    expect(failures).toBe(2);
  });
  test("stalled response bodies fail and release the stream instead of hanging or silently exiting", async () => {
    const body = new Readable({ read() {} });
    await expect(withBodyDeadline(body, async () => { for await (const _chunk of body) { /* no data */ } }, 10)).rejects.toThrow("STORAGE_BODY_TIMEOUT");
    expect(body.destroyed).toBe(true);
  });
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
    const production = "https://br-wandering-butterfly-azi11h8r.storage.c-3.ap-southeast-1.aws.neon.tech";
    expect(() => validateTarget(production, "zyx-production")).not.toThrow();
    expect(() => validateTarget(production, "zyx-staging")).toThrow();
    expect(() => validateTarget(cutover, "zyx-production")).toThrow();
    expect(() => validateTarget(`${production}.evil.test`, "zyx-production")).toThrow();
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

  test("production writes stay in the production bucket", async () => {
    let uploaded = false;
    const destination = { send: async (command: any) => {
      expect(command.input.Bucket).toBe("zyx-production");
      if (command instanceof PutObjectCommand) { uploaded = true; return {}; }
      if (!uploaded) throw { name: "NoSuchKey" };
      return object("source");
    } };
    expect(await copyObject({ send: async () => object("source") }, destination, "source", item, true, "zyx-production")).toBe("copied");
  });

  test("a conditional upload retry reconciles committed bytes and rejects a different object", async () => {
    for (const value of ["source", "wrong!"]) {
      let uploaded = false;
      const destination = { send: async (command: any) => {
        if (command instanceof PutObjectCommand) { uploaded = true; throw { $metadata: { httpStatusCode: 412 } }; }
        if (!uploaded) throw { name: "NoSuchKey" };
        return object(value);
      } };
      const copy = copyObject({ send: async () => object("source") }, destination, "source", item, true, "zyx-production");
      if (value === "source") expect(await copy).toBe("identical");
      else await expect(copy).rejects.toThrow("DESTINATION_CONFLICT");
    }
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
