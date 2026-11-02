import { cp, chmod, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

async function permissions(path, dirMode, fileMode) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const child = join(path, item.name);
    if (item.isSymbolicLink()) throw new Error("Symlinks are not permitted in the runtime");
    if (item.isDirectory()) await permissions(child, dirMode, fileMode);
    else if (item.isFile()) await chmod(child, fileMode);
    else throw new Error("Unsupported runtime file");
  }
  await chmod(path, dirMode);
}
async function writableDirectories(path) {
  await chmod(path, 0o700);
  for (const item of await readdir(path, { withFileTypes: true })) {
    if (item.isDirectory()) await writableDirectories(join(path, item.name));
  }
}
async function cleanup(path) {
  try { await writableDirectories(path); } finally { await rm(path, { recursive: true, force: true }); }
}
export async function startPython({ executable, wasm, library, code, onOutput = () => {}, maxOutput = 64000 }) {
  if (process.platform !== "linux" || process.getuid?.() === 0) throw new Error("A non-root Linux process is required");
  if (typeof code !== "string" || Buffer.byteLength(code) > 64000) throw new Error("Invalid source");
  if (!Number.isSafeInteger(maxOutput) || maxOutput < 100 || maxOutput > 64000) throw new Error("Invalid output limit");
  const dir = await mkdtemp(join(tmpdir(), "zyx-python-"));
  let child;
  try {
    const lib = join(dir, "lib");
    await cp(library, lib, { recursive: true, dereference: false });
    await permissions(lib, 0o555, 0o444);
    child = spawn(executable, ["run", "-W", "fuel=5000000000,max-memory-size=134217728", "--dir", `${lib}::/lib`, "--env", "PYTHONHOME=/", wasm, "-u", "-c", code], { env: {}, stdio: ["pipe", "pipe", "pipe"] });
  } catch (error) {
    try { await cleanup(dir); } catch { const failure = new Error("Cleanup failed"); failure.cleanupFailed = true; throw failure; }
    throw error;
  }
  let count = 0, inputBytes = 0, stopped = false, outputLimit = false;
  for (const [stream, name] of [[child.stdout, "stdout"], [child.stderr, "stderr"]]) {
    stream.on("data", (chunk) => {
      const available = Math.max(0, maxOutput - count);
      count += chunk.length;
      if (available) onOutput(name, chunk.subarray(0, available));
      if (chunk.length > available) { outputLimit = true; child.kill("SIGKILL"); }
    });
  }
  child.stdin.on("error", () => {});
  const done = new Promise((resolve) => {
    let spawnError;
    child.once("error", (error) => { spawnError = error; });
    child.once("close", async (code, signal) => {
      try { await cleanup(dir); resolve({ code, signal, stopped, outputLimit, spawnError: Boolean(spawnError), cleanupFailed: false }); }
      catch { resolve({ code, signal, stopped, outputLimit, spawnError: Boolean(spawnError), cleanupFailed: true }); }
    });
  });
  return {
    input(value) {
      if (typeof value !== "string" || child.stdin.destroyed) return false;
      const bytes = Buffer.byteLength(value);
      if (inputBytes + bytes > 8000) return false;
      inputBytes += bytes;
      child.stdin.write(value);
      return true;
    },
    stop() { stopped = true; child.kill("SIGKILL"); },
    done,
  };
}
