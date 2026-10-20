import { expect, it } from "bun:test";
import { sourcePdf } from "../helpers/source-pdf";
import { parseStoredPdfPages } from "@/lib/compute/pdf-pages";
import { cachedPdfPages } from "@/lib/compute/pdf-page-cache";

it("caches real PDF renders with fractional viewport dimensions at 640 and 1280 px", async () => {
  const bytes = sourcePdf(595.28, 841.89);
  const objects = new Map<string, Uint8Array>();
  const store = {
    exists: async (key: string) => objects.has(key),
    download: async (key: string) => objects.get(key)!,
    upload: async (data: unknown, _name: string, _mime: string, options: { key: string }) => {
      if (!(data instanceof Uint8Array)) throw new Error("expected bytes");
      objects.set(options.key, data);
      return { key: options.key, url: options.key, size: data.byteLength };
    },
  };
  for (const width of [640, 1280]) {
    const result = await cachedPdfPages({ checksum: "a".repeat(64), pages: [1], rendererVersion: "dimension-test", width }, store,
      (pages) => parseStoredPdfPages(bytes.slice(), pages, { representation: "both", imageWidth: width }));
    const page = result.pages[0];
    expect(page.width).toBe(width);
    expect(page.png.byteLength).toBeGreaterThan(0);
    const header = new DataView(page.png.buffer, page.png.byteOffset, page.png.byteLength);
    expect(page.width).toBe(header.getUint32(16));
    expect(page.height).toBe(header.getUint32(20));
    expect(Number.isInteger(page.height)).toBe(true);
    const cached = await cachedPdfPages({ checksum: "a".repeat(64), pages: [1], rendererVersion: "dimension-test", width }, store,
      async () => { throw new Error("cached page must not render again"); });
    expect(cached).toEqual(result);
  }
}, 60_000);
