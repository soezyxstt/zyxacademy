import { test } from "node:test";
import assert from "node:assert/strict";
import { createProbeServer } from "./index.mjs";

test("probe serves health only and does not expose execution", async () => {
  const server = createProbeServer({ linux: true, namespaces: false });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${base}/health`);
    assert.deepEqual(await health.json(), { service: "python-runtime-probe", execution: "disabled", capabilities: { linux: true, namespaces: false } });
    assert.equal((await fetch(`${base}/run`, { method: "POST" })).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
