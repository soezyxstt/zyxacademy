import { build } from "esbuild";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { acquireLocalProductOperatorLock, localProductOperatorLockPath, cleanupOwnedV4ImportLock } from "./local-product-operator-lock.mjs";

// Private operator only. The parent owns the machine-wide lock and process group.
const root = path.resolve("artifacts/v4-local-evidence");
const lock = localProductOperatorLockPath;
let releaseLock;
let directory;
let child;
let timer;
let killTimer;
let timedOut = false;
let interrupted = false;
const stop = () => {
  if (!child?.pid) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  killTimer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 5000);
  killTimer.unref();
};
const onSignal = () => { interrupted = true; process.exitCode = 1; stop(); };
process.once("SIGINT", onSignal);
process.once("SIGTERM", onSignal);
try {
  await mkdir(root, { recursive: true, mode: 0o700 });
  releaseLock = await acquireLocalProductOperatorLock();
  if (interrupted) throw new Error("PRODUCT_LOCAL_OPERATOR_INTERRUPTED");
  directory = await mkdtemp(path.join(root, ".launcher-"));
  timer = setTimeout(() => {
    timedOut = true;
    console.error(JSON.stringify({ status: "error", code: "PRODUCT_V4_LOCAL_TIMEOUT", recovery: "Inspect the attempt and draft, then retry after correcting the cause." }));
    onSignal();
  }, 180_000);
  timer.unref();
  const output = path.join(directory, "operator.mjs");
  await build({ entryPoints: ["scripts/authoring/verify-product-v4-local.ts"], bundle: true, packages: "external", platform: "node", format: "esm", target: "node24", outfile: output, define: { "import.meta.main": "false" }, footer: { js: "runProductV4LocalVerification().catch(reportProductV4LocalFailure);" }, logLevel: "silent" });
  if (interrupted) throw new Error("PRODUCT_LOCAL_OPERATOR_INTERRUPTED");
  child = spawn(process.execPath, [output, ...process.argv.slice(2)], { stdio: "inherit", detached: true });
  const result = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal })); });
  if (timedOut || process.exitCode === 1) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
  if (process.exitCode !== 1) process.exitCode = timedOut || result.signal ? 1 : result.code ?? 1;
} catch (error) {
  const code = error instanceof Error && error.message === "PRODUCT_LOCAL_OPERATOR_LOCKED" ? error.message : "PRODUCT_V4_LOCAL_LAUNCH_FAILED";
  console.error(JSON.stringify({ status: "error", code, recovery: code.endsWith("LOCKED") ? `Wait for the running operator. If it has exited, remove ${lock} and retry.` : "Check local prerequisites and retry without exposing credentials." }));
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", onSignal);
  process.removeListener("SIGTERM", onSignal);
  clearTimeout(timer);
  clearTimeout(killTimer);
  if (child?.pid) await cleanupOwnedV4ImportLock(process.argv.slice(2), child.pid, root);
  if (directory) await rm(directory, { recursive: true, force: true });
  if (releaseLock) await releaseLock();
}
