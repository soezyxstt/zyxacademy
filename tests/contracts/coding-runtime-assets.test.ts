import { describe, expect, it } from "bun:test";
import { GET } from "@/app/api/coding/runtime/[revision]/[asset]/route";
import { PYTHON_RUNTIME_ASSETS, PYTHON_RUNTIME_REVISION } from "@/lib/coding/runtime-assets";

describe("Python runtime assets", () => {
  it("serves every pinned asset with its expected content type", async () => {
    for (const [asset, contentType] of Object.entries(PYTHON_RUNTIME_ASSETS)) {
      const response = await GET(new Request(`http://localhost/api/coding/runtime/${PYTHON_RUNTIME_REVISION}/${asset}`), { params: Promise.resolve({ revision: PYTHON_RUNTIME_REVISION, asset }) });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(contentType);
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }
  });

  it("rejects unknown revisions and filenames", async () => {
    const request = new Request("http://localhost/api/coding/runtime/old/pyodide.mjs");
    const old = await GET(request, { params: Promise.resolve({ revision: "old", asset: "pyodide.mjs" }) });
    const unknown = await GET(request, { params: Promise.resolve({ revision: PYTHON_RUNTIME_REVISION, asset: "unknown.js" }) });
    expect(old.status).toBe(404);
    expect(unknown.status).toBe(404);
  });
});
