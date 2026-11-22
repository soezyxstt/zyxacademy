import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { makeApkDelta, makeDelta, makeDesktopInstallerDelta } from "../apps/scripts/generate-nightly-deltas.mjs";

function sample(seed) {
  const bytes = Buffer.alloc(64 * 1024);
  for (let offset = 0; offset < bytes.length; offset += 32) {
    const block = createHash("sha256").update(`${seed}:${offset}`).digest();
    bytes.set(block, offset);
  }
  return bytes;
}

test("Nightly patch reconstructs a shifted artifact with changed and trailing bytes", () => {
  const base = sample("old");
  const target = Buffer.concat([
    Buffer.from("inserted prefix"),
    base.subarray(0, 17000),
    Buffer.alloc(1200, 42),
    base.subarray(18100, base.length - 31),
    Buffer.from("new tail"),
  ]);
  const delta = makeDelta(base, target);
  assert.ok(delta);
  assert.equal(delta.bytes.subarray(0, 8).toString(), "ZyxDLT01");
  assert.equal(delta.baseHash, createHash("sha256").update(base).digest("hex"));
  assert.equal(delta.bytes.subarray(8, 40).toString("hex"), delta.baseHash);
  assert.deepEqual(delta.bytes.subarray(40, 72), createHash("sha256").update(target).digest());
  assert.equal(delta.bytes.readInt32BE(72), target.length);

  const reconstructed = [];
  for (let cursor = 76; cursor < delta.bytes.length;) {
    const length = delta.bytes.readInt32BE(cursor);
    cursor += 4;
    if (length < 0) {
      const offset = delta.bytes.readInt32BE(cursor);
      reconstructed.push(base.subarray(offset, offset - length));
      cursor += 4;
    } else {
      reconstructed.push(delta.bytes.subarray(cursor, cursor + length));
      cursor += length;
    }
  }
  assert.deepEqual(Buffer.concat(reconstructed), target);
  assert.ok(delta.bytes.length < target.length / 4);
});

test("Nightly release omits patches without meaningful bandwidth savings", () => {
  assert.equal(makeDelta(sample("old"), sample("different")), null);
  assert.equal(makeDelta(Buffer.from("tiny"), Buffer.from("tiny")), null);
});

test("writes a smaller APK patch for shifted compressed DEX data", {
  skip: spawnSync("bsdiff", []).error?.code === "ENOENT",
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "zyx-apk-delta-test-"));
  try {
    const data = sample("dex");
    const first = data.subarray(0, 24 * 1024);
    const second = data.subarray(24 * 1024, 48 * 1024);
    // Byte shifts are hard to copy from compressed data even when the original
    // DEX is nearly identical. Keep the archive above the minimum DEX size.
    writeFileSync(join(dir, "base.dex"), Buffer.concat([first, first, second, second]));
    writeFileSync(join(dir, "target.dex"), Buffer.concat([first.subarray(7), first, second, second]));
    execFileSync("python3", ["-c", `
import sys, zipfile
from pathlib import Path
path = Path(sys.argv[1])
for version in ("base", "target"):
    with zipfile.ZipFile(path / (version + ".apk"), "w", zipfile.ZIP_DEFLATED, compresslevel=6) as apk:
        apk.write(path / (version + ".dex"), "classes.dex")
`, dir]);
    const base = readFileSync(join(dir, "base.apk"));
    const target = readFileSync(join(dir, "target.apk"));
    const optimized = makeApkDelta(base, target);
    assert.ok(optimized);
    assert.ok(optimized.bytes.length < target.length / 8);
    const payload = gunzipSync(optimized.bytes);
    assert.equal(payload.subarray(0, 8).toString(), "ZyxAPK01");
    assert.deepEqual(payload.subarray(40, 72), createHash("sha256").update(target).digest());
    assert.equal(payload.readInt32BE(72), target.length);
    assert.equal(payload.readInt32BE(76), 1);
    assert.equal(makeApkDelta(base, base), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop installer patch uses the installed executable and beats the full download", {
  skip: spawnSync("bsdiff", []).error?.code === "ENOENT",
}, () => {
  const executable = sample("installed executable");
  const target = Buffer.concat([Buffer.from("installer prefix"), executable, Buffer.from("installer tail")]);
  const delta = makeDesktopInstallerDelta(executable, target, 16 * 1024);
  assert.ok(delta);
  assert.ok(delta.bytes.length < 1024);
  const payload = gunzipSync(delta.bytes);
  assert.equal(payload.subarray(0, 8).toString(), "ZyxINS01");
  assert.deepEqual(payload.subarray(8, 40), createHash("sha256").update(executable).digest());
  assert.deepEqual(payload.subarray(40, 72), createHash("sha256").update(target).digest());
  assert.equal(payload.readInt32BE(72), target.length);
  assert.equal(makeDesktopInstallerDelta(executable, target, 32), null);
});
