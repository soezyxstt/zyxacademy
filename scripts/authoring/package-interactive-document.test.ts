import { expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import sharp from "sharp";

mock.module("server-only", () => ({}));
const { validateInteractiveDocumentArchive } = await import("@/lib/materials/interactive-document-assets");
const { validateQuestionVisualAssets } = await import("@/lib/authoring/question-visual-assets");

test("packages a new pair and rejects missing, corrupt and mismatched bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zyx-authoring-pair-"));
  try {
    const htmlPath = join(dir, "reviewed.html"), pngPath = join(dir, "reviewed.png");
    const metadataPath = join(dir, "metadata.json"), output = join(dir, "output");
    await writeFile(htmlPath, "<!doctype html><p>Local synthetic pair</p>");
    const png = await sharp({ create: { width: 3, height: 2, channels: 4, background: "#2468ac" } }).png().toBuffer();
    await writeFile(pngPath, png);
    await writeFile(metadataPath, JSON.stringify({ id: "pair", label: "Pair", description: "Synthetic pair", height: 400, staticFallback: { type: "text", summary: "Initial", content: "Initial state" }, printCaption: "Initial state" }));
    const run = (html: string, png: string, destination: string) => Bun.spawnSync([process.execPath, resolve("scripts/authoring/package-interactive-document.ts"), html, png, metadataPath, destination]);
    const result = run(htmlPath, pngPath, output);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(await readFile(join(output, "payload.json"), "utf8"));
    const files = new Map<string, Uint8Array>();
    for (const entry of payload.manifestVisualAssets) files.set(entry.path, await readFile(join(output, entry.path)));
    expect(payload.orderedPart).toEqual({ id: "pair-ref", kind: "visual_ref", visualId: "pair" });
    await validateInteractiveDocumentArchive([payload.articleVisual], payload.manifestVisualAssets, files);
    await validateQuestionVisualAssets([{ prompt: payload.questionFence, options: [] }], payload.visualAssets);
    const missing = new Map(files); missing.delete(payload.manifestVisualAssets[1].path);
    await expect(validateInteractiveDocumentArchive([payload.articleVisual], payload.manifestVisualAssets, missing)).rejects.toThrow("INTERACTIVE_DOCUMENT_ASSET_MISSING");
    const mismatch = new Map(files); mismatch.set(payload.manifestVisualAssets[0].path, Buffer.alloc(payload.articleVisual.documentBytes));
    await expect(validateInteractiveDocumentArchive([payload.articleVisual], payload.manifestVisualAssets, mismatch)).rejects.toThrow("INTERACTIVE_DOCUMENT_INTEGRITY");
    expect(run(join(dir, "missing.html"), pngPath, join(dir, "missing-out")).exitCode).not.toBe(0);
    const corruptPng = Buffer.from(png);
    corruptPng[corruptPng.indexOf("IDAT") + 5] ^= 0xff;
    await writeFile(pngPath, corruptPng);
    const corrupt = run(htmlPath, pngPath, join(dir, "corrupt-out"));
    expect(corrupt.exitCode).not.toBe(0);
    expect(corrupt.stderr.toString()).toContain("INTERACTIVE_DOCUMENT_PRINT_INVALID");
    expect(run(htmlPath, join(output, payload.manifestVisualAssets[1].path), output).exitCode).not.toBe(0);
    const meta = JSON.parse(await readFile(metadataPath, "utf8"));
    await writeFile(metadataPath, JSON.stringify({ ...meta, unexpected: "field" }));
    expect(run(htmlPath, join(output, payload.manifestVisualAssets[1].path), join(dir, "extra-out")).exitCode).not.toBe(0);
    await writeFile(metadataPath, JSON.stringify({ ...meta, documentSha256: "0".repeat(64) }));
    expect(run(htmlPath, join(output, payload.manifestVisualAssets[1].path), join(dir, "hash-out")).exitCode).not.toBe(0);
  } finally {
    if (!resolve(dir).startsWith(`${resolve(tmpdir())}${sep}zyx-authoring-pair-`)) throw new Error("UNSAFE_TEST_DIRECTORY");
    await rm(dir, { recursive: true, force: true });
  }
});
