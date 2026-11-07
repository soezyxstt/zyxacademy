import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

type BrandExport = { path: string; format: string; widthPx: number; heightPx: number };

const brandDir = path.resolve(process.cwd(), "public/brand");
const manifest = JSON.parse(readFileSync(path.join(brandDir, "asset-manifest.json"), "utf8"));

function readDimensions(filePath: string, format: string) {
  const bytes = readFileSync(filePath);
  if (format === "image/png") {
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  const root = bytes.toString("utf8").match(/<svg\b([^>]*)>/)?.[1];
  const width = root?.match(/\bwidth="([\d.]+)"/)?.[1];
  const height = root?.match(/\bheight="([\d.]+)"/)?.[1];
  expect(width).toBeDefined();
  expect(height).toBeDefined();
  return { width: Number(width), height: Number(height) };
}

describe("Figma brand asset exports", () => {
  it("maps each exported file and its actual dimensions to its source frame", () => {
    expect(manifest.source.figmaFileKey).toBe("NvOC7gydMjFVA1uivfNvJz");
    expect(manifest.frames).toHaveLength(27);

    const exports: BrandExport[] = manifest.frames.flatMap((frame: { exports: BrandExport[] }) => frame.exports);
    expect(exports).toHaveLength(41);
    expect(new Set(exports.map((item: { path: string }) => item.path)).size).toBe(41);

    for (const item of exports) {
      const filePath = path.resolve(process.cwd(), "public", item.path.slice(1));
      expect(path.dirname(filePath)).toBe(brandDir);
      expect(existsSync(filePath)).toBe(true);
      expect(readDimensions(filePath, item.format)).toEqual({ width: item.widthPx, height: item.heightPx });
    }

    const exportedNames = new Set(exports.map((item: { path: string }) => path.basename(item.path)));
    const packagedNames = readdirSync(brandDir).filter((name) => /\.(png|svg)$/i.test(name));
    expect(new Set(packagedNames)).toEqual(exportedNames);
  });

  it("records the favicon ICO and all source PNG frames", () => {
    const ico = manifest.derivedAssets.find((item: { path: string }) => item.path === "/brand/zyx-favicon.ico");
    expect(ico?.format).toBe("image/x-icon");
    expect(ico?.frameSizesPx).toEqual([16, 32, 48]);
    expect(existsSync(path.join(brandDir, "zyx-favicon.ico"))).toBe(true);
    for (const sourcePath of ico.sourcePaths as string[]) {
      expect(existsSync(path.resolve(process.cwd(), "public", sourcePath.slice(1)))).toBe(true);
    }
  });
});
