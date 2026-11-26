import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, inflateRawSync } from "node:zlib";

const maxExpandedApkBytes = 64 * 1024 * 1024;
const maxDexBytes = 32 * 1024 * 1024;
const maxPackageBytes = 256 * 1024 * 1024;
const nightlyTag = /^app-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-nightly\.\d{8}\.[a-f0-9]{7}$/;
const stableTag = /^app-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const maxBaseReleases = 5;
const artifactSuffixes = [
  "-android.apk",
  "-windows-x64.exe",
  "-windows-x64.nsis.zip",
  "-macos-aarch64.dmg",
  "-macos-aarch64.app.tar.gz",
  "-linux-x64.AppImage",
  "-linux-x64.AppImage.tar.gz",
  "-linux-x64.deb",
];

export function resolveDeltaReleaseChannel(tag, gitRef) {
  if (nightlyTag.test(tag)) {
    if (gitRef !== "refs/heads/staging") {
      throw new Error("Nightly delta generation requires refs/heads/staging");
    }
    return {
      channel: "nightly",
      matchesTag: (candidate) => nightlyTag.test(candidate),
      matchesAssetPrefix: (name) => name.startsWith("zyx-academy-nightly-"),
      matchesReleaseKind: (release) => Boolean(release.isPrerelease),
    };
  }
  if (stableTag.test(tag) && !tag.includes("-nightly")) {
    if (gitRef !== "refs/heads/main") {
      throw new Error("Stable delta generation requires refs/heads/main");
    }
    return {
      channel: "stable",
      matchesTag: (candidate) => stableTag.test(candidate) && !candidate.includes("-nightly"),
      matchesAssetPrefix: (name) =>
        name.startsWith("zyx-academy-") && !name.startsWith("zyx-academy-nightly-"),
      matchesReleaseKind: () => true,
    };
  }
  throw new Error(`Unsupported release tag for delta generation: ${tag}`);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest();
}

function word(value) {
  const bytes = Buffer.allocUnsafe(4);
  bytes.writeInt32BE(value);
  return bytes;
}

function fingerprint(bytes, start, blockSize) {
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < blockSize; i++) {
    sum += bytes[start + i];
    weighted += sum;
  }
  return [sum & 0xffff, weighted & 0xffff];
}

function key(sum, weighted) {
  return (sum << 16) | weighted;
}

export function makeDelta(base, target, blockSize = 4096) {
  if (
    base.length < blockSize ||
    target.length < blockSize ||
    Math.max(base.length, target.length) > maxPackageBytes
  ) return null;

  // Index aligned blocks in the old artifact and scan at every offset in the
  // new one. Compare bytes on a checksum hit before emitting a copy.
  const blocks = new Map();
  for (let offset = 0; offset + blockSize <= base.length; offset += blockSize) {
    const blockKey = key(...fingerprint(base, offset, blockSize));
    if (!blocks.has(blockKey)) blocks.set(blockKey, offset);
  }

  const baseDigest = digest(base);
  const records = [Buffer.from("ZyxDLT01"), baseDigest, digest(target), word(target.length)];
  let literalStart = 0;
  let offset = 0;
  let [sum, weighted] = fingerprint(target, 0, blockSize);
  while (offset + blockSize <= target.length) {
    const baseOffset = blocks.get(key(sum, weighted));
    if (
      baseOffset !== undefined &&
      target.compare(base, baseOffset, baseOffset + blockSize, offset, offset + blockSize) === 0
    ) {
      let prefix = 0;
      while (
        offset - prefix > literalStart &&
        baseOffset > prefix &&
        base[baseOffset - prefix - 1] === target[offset - prefix - 1]
      ) prefix++;
      if (offset - prefix > literalStart) {
        records.push(word(offset - prefix - literalStart), target.subarray(literalStart, offset - prefix));
      }
      let length = blockSize;
      while (
        baseOffset + length < base.length &&
        offset + length < target.length &&
        base[baseOffset + length] === target[offset + length]
      ) length++;
      records.push(word(-(length + prefix)), word(baseOffset - prefix));
      offset += length;
      literalStart = offset;
      if (offset + blockSize <= target.length) [sum, weighted] = fingerprint(target, offset, blockSize);
      continue;
    }
    if (offset + blockSize === target.length) break;
    const outgoing = target[offset];
    const incoming = target[offset + blockSize];
    sum = (sum - outgoing + incoming) & 0xffff;
    weighted = (weighted - blockSize * outgoing + sum) & 0xffff;
    offset++;
  }
  if (literalStart < target.length) {
    records.push(word(target.length - literalStart), target.subarray(literalStart));
  }
  const size = records.reduce((total, record) => total + record.length, 0);
  // Leave room for the extra request and local reconstruction.
  if (size >= target.length * 0.8) return null;
  return { baseHash: baseDigest.toString("hex"), bytes: Buffer.concat(records, size) };
}

// Android's APK is a ZIP with a signing block before its central directory.
// Only expand DEX payloads and preserve all ZIP metadata and signature bytes.
function dexEntries(bytes) {
  const firstEnd = Math.max(0, bytes.length - 22 - 0xffff);
  let end = bytes.length - 22;
  while (end >= firstEnd) {
    if (bytes.readUInt32LE(end) === 0x06054b50 &&
        end + 22 + bytes.readUInt16LE(end + 20) === bytes.length) break;
    end--;
  }
  if (end < firstEnd) return [];
  let offset = bytes.readUInt32LE(end + 16);
  const entries = [];

  while (offset + 46 <= end && bytes.readUInt32LE(offset) === 0x02014b50) {
    const nameLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.toString("ascii", offset + 46, offset + 46 + nameLength);
    const method = bytes.readUInt16LE(offset + 10);
    const stored = bytes.readUInt32LE(offset + 20);
    const expanded = bytes.readUInt32LE(offset + 24);
    const local = bytes.readUInt32LE(offset + 42);
    offset += 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    if (method !== 8 || !/^classes\d*\.dex$/.test(name) ||
        stored < 32 * 1024 || stored > maxDexBytes || expanded <= stored || expanded > maxDexBytes ||
        local + 30 > end || bytes.readUInt32LE(local) !== 0x04034b50) continue;
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (start + stored <= end) entries.push({ name, start, stored, expanded });
  }
  return entries;
}

function matchesApkDeflate(raw, expanded) {
  // Node's zlib fork can emit different bytes from the zlib used by Android
  // tooling. Confirm the archived stream with the standard zlib implementation.
  const recompressed = execFileSync("python3", [
    "-c",
    `
import sys
import zlib
encoder = zlib.compressobj(level=6, wbits=-15)
sys.stdout.buffer.write(encoder.compress(sys.stdin.buffer.read()) + encoder.flush())
`,
  ], { input: expanded, maxBuffer: maxDexBytes + 64 * 1024 });
  return raw.equals(recompressed);
}

function expandApk(bytes, entries, checkRecompression = false) {
  const parts = [];
  const spans = [];
  let cursor = 0;
  let growth = 0;
  for (const entry of entries.sort((a, b) => a.start - b.start)) {
    if (entry.start < cursor || bytes.length + growth + entry.expanded - entry.stored > maxExpandedApkBytes) {
      return null;
    }
    const raw = bytes.subarray(entry.start, entry.start + entry.stored);
    const expanded = inflateRawSync(raw, { maxOutputLength: entry.expanded });
    if (expanded.length !== entry.expanded || (checkRecompression && !matchesApkDeflate(raw, expanded))) {
      continue;
    }
    spans.push({ ...entry, expandedStart: entry.start + growth });
    parts.push(bytes.subarray(cursor, entry.start), expanded);
    cursor = entry.start + entry.stored;
    growth += entry.expanded - entry.stored;
  }
  if (spans.length === 0 || spans.length > 32) return null;
  parts.push(bytes.subarray(cursor));
  return { bytes: Buffer.concat(parts, bytes.length + growth), spans };
}

function makeByteDifferences(base, target, maxLength, gzipHeader) {
  const directory = mkdtempSync(join(tmpdir(), "zyx-byte-diff-"));
  let patch;
  try {
    const basePath = join(directory, "base");
    const targetPath = join(directory, "target");
    const patchPath = join(directory, "patch");
    writeFileSync(basePath, base);
    writeFileSync(targetPath, target);
    execFileSync("bsdiff", [basePath, targetPath, patchPath], { timeout: 120_000 });
    const encoder = fileURLToPath(new URL("./encode-byte-differences.py", import.meta.url));
    const args = [encoder, patchPath];
    if (gzipHeader) args.push(gzipHeader.toString("hex"));
    patch = execFileSync("python3", args, { maxBuffer: maxLength * 2 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return patch;
}

export function makeDesktopInstallerDelta(base, target, fullSize) {
  const maxLength = 64 * 1024 * 1024;
  if (!base.length || !target.length || Math.max(base.length, target.length) > maxLength) return null;
  const baseDigest = digest(base);
  const header = Buffer.concat([Buffer.from("ZyxINS01"), baseDigest, digest(target)]);
  const bytes = makeByteDifferences(base, target, maxLength, header);
  return bytes.length < fullSize * 0.8 ? { baseHash: baseDigest.toString("hex"), bytes } : null;
}

function executableFromInstaller(path, windows) {
  const maxBuffer = maxPackageBytes;
  if (windows) {
    const args = ["x", "-so", path, "zyx-academy-desktop.exe"];
    try {
      return execFileSync("7zz", args, { maxBuffer });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return execFileSync("7z", args, { maxBuffer });
    }
  }
  const archive = execFileSync("dpkg-deb", ["--fsys-tarfile", path], { maxBuffer });
  return execFileSync("tar", ["-xOf", "-", "usr/bin/zyx-academy-desktop"], {
    input: archive,
    maxBuffer,
  });
}

function uncompressedDeb(installer) {
  const directory = mkdtempSync(join(tmpdir(), "zyx-deb-delta-"));
  const maxBuffer = maxPackageBytes;
  try {
    writeFileSync(join(directory, "debian-binary"), Buffer.from("2.0\n"));
    for (const [file, flag] of [["control.tar", "--ctrl-tarfile"], ["data.tar", "--fsys-tarfile"]]) {
      writeFileSync(join(directory, file), execFileSync("dpkg-deb", [flag, installer], { maxBuffer }));
    }
    const output = join(directory, "target.deb");
    execFileSync("ar", ["crD", output, "debian-binary", "control.tar", "data.tar"], { cwd: directory });
    return readFileSync(output);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function makeApkDelta(base, target) {
  const oldEntries = dexEntries(base);
  const newEntries = dexEntries(target);
  const changed = newEntries.filter((next) => {
    const old = oldEntries.find((entry) => entry.name === next.name);
    return old && !base.subarray(old.start, old.start + old.stored)
      .equals(target.subarray(next.start, next.start + next.stored));
  });
  if (changed.length === 0) return null;
  const newApk = expandApk(target, changed, true);
  if (!newApk) return null;
  const oldApk = expandApk(
    base,
    oldEntries.filter((old) => newApk.spans.some((next) => next.name === old.name)),
  );
  if (!oldApk) return null;

  const patch = makeByteDifferences(oldApk.bytes, newApk.bytes, maxExpandedApkBytes);
  const baseDigest = digest(base);
  const header = [
    Buffer.from("ZyxAPK01"), baseDigest, digest(target), word(target.length),
    word(oldApk.spans.length),
    ...oldApk.spans.flatMap(({ start, stored, expanded }) => [word(start), word(stored), word(expanded)]),
    word(newApk.spans.length),
    ...newApk.spans.flatMap(({ expandedStart, stored, expanded }) => [
      word(expandedStart), word(expanded), word(stored),
    ]),
  ];
  const bytes = gzipSync(Buffer.concat([...header, patch]), { level: 9 });
  return bytes.length < target.length * 0.8 ? { baseHash: baseDigest.toString("hex"), bytes } : null;
}

function gh(args) {
  return execFileSync("gh", [...args, "--repo", process.env.GITHUB_REPOSITORY], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function generate(directory, tag) {
  const channelConfig = resolveDeltaReleaseChannel(tag, process.env.GITHUB_REF);
  const files = readdirSync(directory);
  const installerTargets = new Map();
  for (const file of files) {
    const path = join(directory, file);
    if (file.endsWith(".exe.delta-target")) {
      installerTargets.set(file.slice(0, -".delta-target".length), readFileSync(path));
      // Internal build input. Publish only the compressed installer and useful patches.
      rmSync(path);
    } else if (file.endsWith("-linux-x64.deb")) {
      try {
        installerTargets.set(file, uncompressedDeb(path));
      } catch (error) {
        console.warn(`Skipping uncompressed Debian patch target for ${file}: ${error.message}`);
      }
    }
  }
  const releases = JSON.parse(gh([
    "release", "list", "--limit", "30", "--json", "tagName,isDraft,isPrerelease,publishedAt",
  ]));
  const bases = releases
    .filter((release) =>
      !release.isDraft && channelConfig.matchesReleaseKind(release) && release.publishedAt &&
      release.tagName !== tag && channelConfig.matchesTag(release.tagName),
    )
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, maxBaseReleases);

  for (const release of bases) {
    const directoryForBase = mkdtempSync(join(tmpdir(), "zyx-delta-base-"));
    try {
      let assets;
      try {
        ({ assets } = JSON.parse(gh(["release", "view", release.tagName, "--json", "assets"])));
      } catch {
        console.warn(`Could not inspect ${release.tagName}. Skipping patches from this release.`);
        continue;
      }
      const pairs = artifactSuffixes.flatMap((suffix) => {
        const target = files.find((file) => channelConfig.matchesAssetPrefix(file) && file.endsWith(suffix));
        const base = assets.find((asset) =>
          channelConfig.matchesAssetPrefix(asset.name) &&
          asset.name.endsWith(suffix) &&
          /^[a-zA-Z0-9.-]+$/.test(asset.name) &&
          asset.size <= maxPackageBytes,
        );
        return target && base && statSync(join(directory, target)).size <= maxPackageBytes
          ? [{ target, base: base.name }]
          : [];
      });
      if (pairs.length === 0) continue;

      try {
        gh([
          "release", "download", release.tagName, "--dir", directoryForBase,
          ...pairs.flatMap(({ base }) => ["--pattern", base]),
        ]);
      } catch {
        console.warn(`Could not download assets from ${release.tagName}. Skipping patches from this release.`);
        continue;
      }
      for (const { target, base } of pairs) {
        const newBytes = readFileSync(join(directory, target));
        const oldBytes = readFileSync(join(directoryForBase, base));
        const delta = makeDelta(oldBytes, newBytes);
        const finerDelta = makeDelta(oldBytes, newBytes, 256);
        const raw = finerDelta && (!delta || finerDelta.bytes.length < delta.bytes.length) ? finerDelta : delta;
        let apk;
        if (target.endsWith(".apk") && (!raw || raw.bytes.length >= 256 * 1024)) {
          try {
            apk = makeApkDelta(oldBytes, newBytes);
          } catch (error) {
            console.warn(`Skipping optimized APK patch for ${release.tagName}: ${error.message}`);
          }
        }
        if (apk && (!raw || apk.bytes.length < raw.bytes.length * 0.9)) {
          const filename = `${target}.from-${apk.baseHash}.zyxdelta-apk.gz`;
          writeFileSync(join(directory, filename), apk.bytes);
          console.log(`${filename}: ${apk.bytes.length} of ${newBytes.length} bytes`);
        }
        let desktopInstaller;
        if (installerTargets.has(target)) {
          try {
            const installed = executableFromInstaller(join(directoryForBase, base), target.endsWith(".exe"));
            desktopInstaller = makeDesktopInstallerDelta(
              installed,
              installerTargets.get(target),
              Math.min(newBytes.length, raw?.bytes.length ?? newBytes.length),
            );
            if (desktopInstaller) {
              const filename = `${target}.from-exe-${desktopInstaller.baseHash}.zyxdesktop.gz`;
              writeFileSync(join(directory, filename), desktopInstaller.bytes);
              console.log(`${filename}: ${desktopInstaller.bytes.length} of ${newBytes.length} bytes`);
            }
          } catch (error) {
            console.warn(`Skipping installed-executable patch for ${target}: ${error.message}`);
          }
        }
        if (!raw) {
          if (!apk && !desktopInstaller) console.log(`Full download for ${target} from ${release.tagName}: patch would save less than 20%.`);
          continue;
        }
        const filename = `${target}.from-${raw.baseHash}.zyxdelta`;
        writeFileSync(join(directory, filename), raw.bytes);
        console.log(`${filename}: ${raw.bytes.length} of ${newBytes.length} bytes`);
      }
    } finally {
      rmSync(directoryForBase, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generate(resolve(process.argv[2]), process.argv[3]);
}
