import { describe, expect, it } from "bun:test";
import { cachedPdfPages } from "@/lib/compute/pdf-page-cache";
import { buildPdfPageCacheKey } from "@/lib/storage/keys";

const input = { checksum: "a".repeat(64), pages: [2, 1], rendererVersion: "renderer-v1", width: 1280 };

function fixture() {
  const objects = new Map<string, Uint8Array>();
  const renders: number[][] = [];
  const store = {
    exists: async (key: string) => objects.has(key),
    download: async (key: string) => objects.get(key)!,
    upload: async (bytes: unknown, _filename: string, _mime: string, options: { key: string }) => {
      if (!(bytes instanceof Uint8Array)) throw new Error("expected bytes");
      objects.set(options.key, bytes);
      return { key: options.key, url: options.key, size: bytes.byteLength };
    },
  };
  const render = async (pages: number[]) => {
    renders.push(pages);
    return { totalPages: 5, pages: pages.map((pageNumber) => ({ pageNumber, text: `Page ${pageNumber}`,
      width: 1280, height: 1810, png: new Uint8Array([137, 80, pageNumber]) })) };
  };
  return { objects, renders, store, render };
}

describe("PDF page R2 cache", () => {
  it("reuses text and PNG without rendering and preserves request order", async () => {
    const { store, render, renders, objects } = fixture();
    const first = await cachedPdfPages(input, store, render);
    const next = await cachedPdfPages(input, store, render);
    expect(next).toEqual(first);
    expect(next.pages.map((page) => page.pageNumber)).toEqual([2, 1]);
    expect(renders).toEqual([[2, 1]]);
    expect(objects.size).toBe(4);
    expect(new TextDecoder().decode([...objects.entries()].find(([key]) => key.endsWith(".json"))![1]))
      .not.toContain("base64");
  });

  it("renders only missing, corrupt, or incomplete pages", async () => {
    const { store, render, renders, objects } = fixture();
    await cachedPdfPages(input, store, render);
    const key = buildPdfPageCacheKey({ ...input, pageNumber: 1 });
    objects.delete(`${key}.png`);
    await cachedPdfPages(input, store, render);
    objects.set(`${key}.json`, new TextEncoder().encode("invalid JSON"));
    await cachedPdfPages(input, store, render);
    objects.set(`${key}.png`, new Uint8Array([0]));
    await cachedPdfPages(input, store, render);
    expect(renders).toEqual([[2, 1], [1], [1], [1]]);
  });

  it("separates checksum, page, renderer version, and resolution", async () => {
    const key = buildPdfPageCacheKey({ ...input, pageNumber: 1 });
    for (const change of [{ checksum: "b".repeat(64) }, { rendererVersion: "renderer-v2" }, { width: 640 }, { pageNumber: 2 }]) {
      expect(buildPdfPageCacheKey({ ...input, pageNumber: 1, ...change })).not.toBe(key);
    }
    const { store, render, renders } = fixture();
    await cachedPdfPages(input, store, render);
    await cachedPdfPages({ ...input, rendererVersion: "renderer-v2" }, store, render);
    expect(renders).toEqual([[2, 1], [2, 1]]);
    expect(() => buildPdfPageCacheKey({ ...input, pageNumber: 1, rendererVersion: "../bad" })).toThrow();
  });

  it("propagates storage errors and does not commit failed writes", async () => {
    const { store, render, objects } = fixture();
    await expect(cachedPdfPages(input, { ...store, upload: async () => { throw new Error("R2 unavailable"); } }, render))
      .rejects.toThrow("R2 unavailable");
    expect(objects.size).toBe(0);
    await expect(cachedPdfPages(input, { ...store, exists: async () => { throw new Error("R2 denied"); } }, render))
      .rejects.toThrow("R2 denied");
  });
});
