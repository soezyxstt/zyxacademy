import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceHashes } from "../visual/fixtures/rich-documents/capture-match.mjs";

test("fixture freshness follows content across checkouts, including added sources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zyx-fixture-hashes-"));
  const root = join(directory, "rich-documents");
  try {
    await mkdir(root);
    await writeFile(join(directory, "rich-documents.css"), "main{color:inherit}");
    await writeFile(join(root, "scene.js"), "const value = 1;\n");
    const original = await sourceHashes(root);
    await utimes(join(root, "scene.js"), new Date(0), new Date(0));
    expect(await sourceHashes(root)).toEqual(original);
    await writeFile(join(root, "scene.js"), "const value = 1;\r\n");
    expect(await sourceHashes(root)).toEqual(original);
    await writeFile(join(root, "scene.js"), "const value = 2;");
    expect(await sourceHashes(root)).not.toEqual(original);
    const changed = await sourceHashes(root);
    await writeFile(join(root, "extra.mjs"), "export const extra = 1;");
    expect(await sourceHashes(root)).not.toEqual(changed);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
