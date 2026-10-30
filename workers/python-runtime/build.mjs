import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { unzipSync } from "fflate";

if (process.platform !== "linux" || process.arch !== "x64") throw new Error("Runtime build requires Linux x64");
const root = resolve(".runtime");
await mkdir(root, { recursive: true });
const temp = await mkdtemp(join(root, "build-"));
async function download(url, expected) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Runtime download failed: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(data).digest("hex") !== expected) throw new Error("Runtime checksum mismatch");
  return data;
}
try {
  const [archive, python] = await Promise.all([
    download("https://github.com/bytecodealliance/wasmtime/releases/download/v50.0.1/wasmtime-v50.0.1-x86_64-linux.tar.xz", "685466455dd42a14774a86c36c8f2e45cbb9bd6d92a850139315df60a75498a5"),
    download("https://github.com/brettcannon/cpython-wasi-build/releases/download/v3.13.11/python-3.13.11-wasi_sdk-24.zip", "e99a617738ade87cd263aa46cace7173faa91b5de994499c83e49d132c40bb77"),
  ]);
  const tar = join(temp, "runtime.tar.xz");
  await writeFile(tar, archive);
  execFileSync("tar", ["-xJf", tar, "-C", temp, "--strip-components=1", "wasmtime-v50.0.1-x86_64-linux/wasmtime"]);
  const files = unzipSync(python);
  if (!files["python.wasm"]) throw new Error("Missing Python WASM");
  await writeFile(join(temp, "python.wasm"), files["python.wasm"]);
  let count = 0;
  for (const [name, data] of Object.entries(files)) {
    if (!name.startsWith("lib/") || name.endsWith("/")) continue;
    const parts = name.split("/");
    if (parts.some((part) => !part || part === "." || part === ".." || part.includes("\\"))) throw new Error("Invalid Python archive path");
    const target = join(temp, ...parts);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, data);
    count++;
  }
  if (!count) throw new Error("Missing Python standard library");
  await chmod(join(temp, "wasmtime"), 0o755);
  for (const name of ["wasmtime", "python.wasm", "lib"]) {
    const target = join(root, name);
    await rm(target, { recursive: true, force: true });
    await rename(join(temp, name), target);
  }
  console.log(`Runtime assets ready: ${count} files`);
} finally { await rm(temp, { recursive: true, force: true }); }
