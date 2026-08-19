import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

export const ZIP_SECURITY_REASON_CODES = [
  "ZIP_NOT_ARCHIVE",
  "ZIP_TRUNCATED",
  "ZIP_UNSUPPORTED_FORMAT",
  "ZIP64_UNSUPPORTED",
  "ZIP_MULTI_DISK_UNSUPPORTED",
  "ZIP_ENCRYPTED",
  "ZIP_PATH_TRAVERSAL",
  "ZIP_ABSOLUTE_PATH",
  "ZIP_INVALID_PATH",
  "ZIP_DUPLICATE_PATH",
  "ZIP_SYMLINK",
  "ZIP_EXECUTABLE",
  "ZIP_NESTED_ARCHIVE",
  "ZIP_FILE_LIMIT",
  "ZIP_ENTRY_LIMIT",
  "ZIP_COMPRESSION_LIMIT",
  "ZIP_UNSUPPORTED_COMPRESSION",
  "ZIP_CRC_MISMATCH",
  "ZIP_CORRUPT_DATA",
] as const;

export type ZipSecurityReasonCode = (typeof ZIP_SECURITY_REASON_CODES)[number];

export interface ZipSecurityLimits {
  maxArchiveBytes: number;
  maxEntries: number;
  maxFileBytes: number;
  maxUncompressedBytes: number;
  maxCompressionRatio: number;
}
export const DEFAULT_ZIP_SECURITY_LIMITS: Readonly<ZipSecurityLimits> = {
  maxArchiveBytes: 32 * 1024 * 1024,
  maxEntries: 256,
  maxFileBytes: 8 * 1024 * 1024,
  maxUncompressedBytes: 32 * 1024 * 1024,
  maxCompressionRatio: 200,
};

export interface SecureZipEntry {
  path: string;
  normalizedPath: string;
  bytes: Uint8Array;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: 0 | 8;
  crc32: number;
  isDirectory: boolean;
  isSymlink: boolean;
  isExecutable: boolean;
}

export interface SecureZipArchive {
  checksum: string;
  entries: readonly SecureZipEntry[];
  files: ReadonlyMap<string, Uint8Array>;
  totalUncompressedBytes: number;
}

export class ZipSecurityError extends Error {
  readonly code: ZipSecurityReasonCode;
  readonly path?: string;

  constructor(code: ZipSecurityReasonCode, message: string, path?: string) {
    super(message);
    this.name = "ZipSecurityError";
    this.code = code;
    this.path = path;
  }
}

interface CentralEntry {
  path: string;
  normalizedPath: string;
  flags: number;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  externalAttributes: number;
  madeByOs: number;
  localHeaderOffset: number;
  isDirectory: boolean;
  isSymlink: boolean;
  isExecutable: boolean;
}

function toBytes(input: Uint8Array | ArrayBuffer): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function fail(code: ZipSecurityReasonCode, message: string, path?: string): never {
  throw new ZipSecurityError(code, message, path);
}

function readU16(bytes: Uint8Array, offset: number, end: number): number {
  if (offset < 0 || offset + 2 > end) fail("ZIP_TRUNCATED", "ZIP field is truncated");
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number, end: number): number {
  if (offset < 0 || offset + 4 > end) fail("ZIP_TRUNCATED", "ZIP field is truncated");
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function decodeName(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("ZIP_INVALID_PATH", "ZIP entry name is not valid UTF-8");
  }
}

function normalizePath(path: string): string {
  if (path.includes("\0")) fail("ZIP_INVALID_PATH", "ZIP entry name contains NUL", path);
  const slashPath = path.replaceAll("\\", "/");
  if (slashPath.startsWith("/") || /^[A-Za-z]:\//.test(slashPath)) {
    fail("ZIP_ABSOLUTE_PATH", "absolute ZIP entry path is forbidden", path);
  }

  const parts = slashPath.split("/");
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") fail("ZIP_PATH_TRAVERSAL", "ZIP entry path traverses its root", path);
    normalized.push(part);
  }
  if (normalized.length === 0) fail("ZIP_INVALID_PATH", "ZIP entry path is empty", path);
  return normalized.join("/");
}

function isNestedArchive(path: string): boolean {
  return /\.(?:zip|jar|war|ear|tar|gz|tgz|bz2|xz|7z|rar)$/i.test(path);
}

function isExecutablePath(path: string): boolean {
  return /\.(?:exe|dll|com|bat|cmd|ps1|sh|bash|zsh|fish|bin|elf|js|mjs|cjs|ts|tsx|jsx|html|htm)$/i.test(path);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = 22;
  const maximumComment = 0xffff;
  const start = Math.max(0, bytes.length - minimum - maximumComment);
  for (let offset = bytes.length - minimum; offset >= start; offset -= 1) {
    if (readU32(bytes, offset, bytes.length) === 0x06054b50) return offset;
  }
  fail("ZIP_NOT_ARCHIVE", "ZIP end-of-central-directory record was not found");
}

function readCentralEntries(bytes: Uint8Array, limits: ZipSecurityLimits): CentralEntry[] {
  const eocd = findEndOfCentralDirectory(bytes);
  const disk = readU16(bytes, eocd + 4, bytes.length);
  const centralDisk = readU16(bytes, eocd + 6, bytes.length);
  const entriesOnDisk = readU16(bytes, eocd + 8, bytes.length);
  const totalEntries = readU16(bytes, eocd + 10, bytes.length);
  const centralSize = readU32(bytes, eocd + 12, bytes.length);
  const centralOffset = readU32(bytes, eocd + 16, bytes.length);

  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
    fail("ZIP_MULTI_DISK_UNSUPPORTED", "multi-disk ZIP archives are not supported");
  }
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    fail("ZIP64_UNSUPPORTED", "ZIP64 archives are not supported by this boundary");
  }
  if (totalEntries > limits.maxEntries) fail("ZIP_ENTRY_LIMIT", "ZIP contains too many entries");
  if (centralOffset + centralSize > eocd) fail("ZIP_TRUNCATED", "central directory exceeds archive bounds");

  const entries: CentralEntry[] = [];
  const normalizedPaths = new Set<string>();
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (readU32(bytes, cursor, eocd) !== 0x02014b50) {
      fail("ZIP_CORRUPT_DATA", "central directory entry has an invalid signature");
    }
    const madeBy = readU16(bytes, cursor + 4, eocd);
    const flags = readU16(bytes, cursor + 8, eocd);
    const method = readU16(bytes, cursor + 10, eocd);
    const checksum = readU32(bytes, cursor + 16, eocd);
    const compressedSize = readU32(bytes, cursor + 20, eocd);
    const uncompressedSize = readU32(bytes, cursor + 24, eocd);
    const nameLength = readU16(bytes, cursor + 28, eocd);
    const extraLength = readU16(bytes, cursor + 30, eocd);
    const commentLength = readU16(bytes, cursor + 32, eocd);
    const diskNumber = readU16(bytes, cursor + 34, eocd);
    const externalAttributes = readU32(bytes, cursor + 38, eocd);
    const localHeaderOffset = readU32(bytes, cursor + 42, eocd);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (recordEnd > eocd) fail("ZIP_TRUNCATED", "central directory record is truncated");
    if (diskNumber !== 0) fail("ZIP_MULTI_DISK_UNSUPPORTED", "entry is stored on another ZIP disk");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      fail("ZIP64_UNSUPPORTED", "ZIP64 entry values are not supported");
    }

    const rawPath = decodeName(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const normalizedPath = normalizePath(rawPath);
    if (normalizedPaths.has(normalizedPath)) {
      fail("ZIP_DUPLICATE_PATH", "duplicate normalized ZIP entry path", rawPath);
    }
    normalizedPaths.add(normalizedPath);

    const madeByOs = madeBy >>> 8;
    const unixMode = madeByOs === 3 || madeByOs === 19 ? (externalAttributes >>> 16) & 0xffff : 0;
    const isDirectory = rawPath.endsWith("/") || (unixMode & 0xf000) === 0x4000 || (externalAttributes & 0x10) !== 0;
    const isSymlink = (unixMode & 0xf000) === 0xa000;
    const isExecutable = (unixMode & 0o111) !== 0 || isExecutablePath(normalizedPath);
    if (isSymlink) fail("ZIP_SYMLINK", "symlink ZIP entries are forbidden", rawPath);
    if (!isDirectory && isExecutable) fail("ZIP_EXECUTABLE", "executable ZIP entries are forbidden", rawPath);
    if (!isDirectory && isNestedArchive(normalizedPath)) {
      fail("ZIP_NESTED_ARCHIVE", "nested archives are forbidden", rawPath);
    }
    if (!isDirectory && compressedSize > limits.maxFileBytes) {
      fail("ZIP_FILE_LIMIT", "compressed ZIP entry exceeds the configured limit", rawPath);
    }
    if (!isDirectory && uncompressedSize > limits.maxFileBytes) {
      fail("ZIP_FILE_LIMIT", "uncompressed ZIP entry exceeds the configured limit", rawPath);
    }
    if (!isDirectory && compressedSize > 0 && uncompressedSize / compressedSize > limits.maxCompressionRatio) {
      fail("ZIP_COMPRESSION_LIMIT", "ZIP entry exceeds the configured compression ratio", rawPath);
    }
    if (!isDirectory && compressedSize === 0 && uncompressedSize > 0) {
      fail("ZIP_COMPRESSION_LIMIT", "empty compressed data declares non-empty output", rawPath);
    }
    if (![0, 8].includes(method)) fail("ZIP_UNSUPPORTED_COMPRESSION", "ZIP compression method is not allowed", rawPath);
    if ((flags & 0x1) !== 0) fail("ZIP_ENCRYPTED", "encrypted ZIP entries are forbidden", rawPath);

    entries.push({
      path: rawPath,
      normalizedPath,
      flags,
      method,
      crc32: checksum,
      compressedSize,
      uncompressedSize,
      externalAttributes,
      madeByOs,
      localHeaderOffset,
      isDirectory,
      isSymlink,
      isExecutable,
    });
    cursor = recordEnd;
  }
  return entries;
}

function extractEntry(bytes: Uint8Array, entry: CentralEntry): Uint8Array {
  if (entry.isDirectory) return new Uint8Array();
  const local = entry.localHeaderOffset;
  if (readU32(bytes, local, bytes.length) !== 0x04034b50) {
    fail("ZIP_CORRUPT_DATA", "local ZIP header has an invalid signature", entry.path);
  }
  const localFlags = readU16(bytes, local + 6, bytes.length);
  const localMethod = readU16(bytes, local + 8, bytes.length);
  const localNameLength = readU16(bytes, local + 26, bytes.length);
  const localExtraLength = readU16(bytes, local + 28, bytes.length);
  if ((localFlags & 0x1) !== 0 || localMethod !== entry.method) fail("ZIP_CORRUPT_DATA", "local ZIP header conflicts with central metadata", entry.path);
  const dataStart = local + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart < 0 || dataEnd > bytes.length) fail("ZIP_TRUNCATED", "ZIP entry data is truncated", entry.path);

  const compressed = bytes.subarray(dataStart, dataEnd);
  let output: Uint8Array;
  try {
    output = entry.method === 0 ? new Uint8Array(compressed) : new Uint8Array(inflateRawSync(compressed));
  } catch {
    fail("ZIP_CORRUPT_DATA", "ZIP entry could not be decompressed", entry.path);
  }
  if (output.byteLength !== entry.uncompressedSize) fail("ZIP_CORRUPT_DATA", "ZIP output size does not match metadata", entry.path);
  if (crc32(output) !== entry.crc32) fail("ZIP_CRC_MISMATCH", "ZIP entry CRC does not match metadata", entry.path);
  return output;
}

export function readSecureZip(input: Uint8Array | ArrayBuffer, overrides: Partial<ZipSecurityLimits> = {}): SecureZipArchive {
  const bytes = toBytes(input);
  const limits = { ...DEFAULT_ZIP_SECURITY_LIMITS, ...overrides };
  if (bytes.byteLength > limits.maxArchiveBytes) fail("ZIP_FILE_LIMIT", "ZIP archive exceeds the configured limit");

  const centralEntries = readCentralEntries(bytes, limits);
  const entries: SecureZipEntry[] = [];
  const files = new Map<string, Uint8Array>();
  let totalUncompressedBytes = 0;
  for (const centralEntry of centralEntries) {
    const data = extractEntry(bytes, centralEntry);
    if (!centralEntry.isDirectory) {
      totalUncompressedBytes += data.byteLength;
      if (totalUncompressedBytes > limits.maxUncompressedBytes) {
        fail("ZIP_FILE_LIMIT", "ZIP archive exceeds the total uncompressed limit");
      }
      files.set(centralEntry.normalizedPath, data);
    }
    entries.push({
      path: centralEntry.path,
      normalizedPath: centralEntry.normalizedPath,
      bytes: data,
      compressedSize: centralEntry.compressedSize,
      uncompressedSize: centralEntry.uncompressedSize,
      compressionMethod: centralEntry.method as 0 | 8,
      crc32: centralEntry.crc32,
      isDirectory: centralEntry.isDirectory,
      isSymlink: centralEntry.isSymlink,
      isExecutable: centralEntry.isExecutable,
    });
  }

  return {
    checksum: createHash("sha256").update(bytes).digest("hex"),
    entries,
    files,
    totalUncompressedBytes,
  };
}

export const readIdeaBundleZip = readSecureZip;
