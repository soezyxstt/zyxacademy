import { describe, expect, it } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { readSecureZip, ZipSecurityError } from "@/lib/bundle/zip-reader";

function makeZip(files: Record<string, Uint8Array | [Uint8Array, { os?: number; attrs?: number }]>): Uint8Array {
  return zipSync(files);
}

function expectSecurityFailure(bytes: Uint8Array, code: ZipSecurityError["code"], limits?: Parameters<typeof readSecureZip>[1]) {
  try {
    readSecureZip(bytes, limits);
    throw new Error("expected ZIP security failure");
  } catch (error) {
    expect(error).toBeInstanceOf(ZipSecurityError);
    expect((error as ZipSecurityError).code).toBe(code);
  }
}

describe("Plan 006 strict ZIP security boundary", () => {
  it("reads safe UTF-8 files and returns a deterministic archive checksum", () => {
    const bytes = makeZip({ "manifest.json": strToU8("{}"), "entities/ideas.json": strToU8("[]") });
    const first = readSecureZip(bytes);
    const second = readSecureZip(bytes);
    expect([...first.files.keys()]).toEqual(["manifest.json", "entities/ideas.json"]);
    expect(first.checksum).toBe(second.checksum);
    expect(first.totalUncompressedBytes).toBe(4);
  });

  it("rejects traversal, absolute paths, and duplicate normalized paths", () => {
    expectSecurityFailure(makeZip({ "../manifest.json": strToU8("{}") }), "ZIP_PATH_TRAVERSAL");
    expectSecurityFailure(makeZip({ "/manifest.json": strToU8("{}") }), "ZIP_ABSOLUTE_PATH");
    expectSecurityFailure(makeZip({ "./manifest.json": strToU8("{}"), "manifest.json": strToU8("{}") }), "ZIP_DUPLICATE_PATH");
  });

  it("rejects symlinks, executable content, nested archives, and unsupported methods", () => {
    expectSecurityFailure(makeZip({ "link.txt": [strToU8("target"), { os: 3, attrs: 0o120777 << 16 }] }), "ZIP_SYMLINK");
    expectSecurityFailure(makeZip({ "run.sh": strToU8("echo unsafe") }), "ZIP_EXECUTABLE");
    expectSecurityFailure(makeZip({ "nested.zip": strToU8("not extracted") }), "ZIP_NESTED_ARCHIVE");
  });

  it("enforces per-file, total-size, and compression-ratio limits", () => {
    const bytes = makeZip({ "large.json": strToU8("x".repeat(128)) });
    expectSecurityFailure(bytes, "ZIP_FILE_LIMIT", { maxFileBytes: 32 });
    expectSecurityFailure(bytes, "ZIP_FILE_LIMIT", { maxUncompressedBytes: 32 });
    expectSecurityFailure(bytes, "ZIP_COMPRESSION_LIMIT", { maxCompressionRatio: 1 });
  });
});
