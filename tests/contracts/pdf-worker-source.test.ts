import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setupPdfWorker } from "@/lib/compute/pdf-worker";

test("PDF worker resolves from its package outside the repository cwd", async () => {
  const originalCwd = process.cwd();
  let workerUrl = "";
  try {
    process.chdir(path.parse(originalCwd).root);
    await setupPdfWorker({ setWorker: (src) => { workerUrl = src; } });
  } finally {
    process.chdir(originalCwd);
  }
  assert.match(workerUrl, /^file:\/\//);
  assert.equal(existsSync(fileURLToPath(workerUrl)), true);
});