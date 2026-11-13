import { mkdir, rmdir, readFile, unlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const localProductOperatorLockPath = path.join(tmpdir(), `zyx-product-local-${process.getuid?.() ?? "user"}.lock`);

export async function acquireLocalProductOperatorLock(lockPath = localProductOperatorLockPath) {
  try { await mkdir(lockPath, { mode: 0o700 }); }
  catch (error) {
    if (error?.code === "EEXIST") throw new Error("PRODUCT_LOCAL_OPERATOR_LOCKED");
    throw error;
  }
  return async () => { await rmdir(lockPath); };
}

// The launcher calls this only after its child has stopped, while it still owns the machine lock.
export async function cleanupOwnedV4ImportLock(args, childPid, root) {
  let importId;
  try {
    if (args.length === 2 && args[0] === "--input") {
      const meta = await stat(args[1]);
      if (meta.size > 16 * 1024 || !meta.isFile()) return;
      importId = JSON.parse(await readFile(args[1], "utf8")).importId;
    } else {
      const index = args.indexOf("--import-id");
      if (index >= 0) importId = args[index + 1];
    }
    if (typeof importId !== "string" || !/^impor-product-[a-f0-9]{32}$/.test(importId)) return;
    const lock = path.join(root, importId, ".lock");
    const owner = JSON.parse(await readFile(path.join(lock, "owner.json"), "utf8"));
    if (owner.pid !== childPid) return;
    await unlink(path.join(lock, "owner.json"));
    await rmdir(lock);
  } catch { /* Never remove an unowned or incomplete lock; documented manual recovery remains available. */ }
}
