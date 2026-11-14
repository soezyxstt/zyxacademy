import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

function executor(save: (input: any, tx: unknown) => Promise<any>) {
  const require = createRequire(import.meta.url);
  const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
  const source = readFileSync("lib/admin-ops-ai/domain-academic.ts", "utf8");
  const section = source.slice(source.indexOf("export async function executeBatchCreateChapters"), source.indexOf("export interface UpdateChapterInput"));
  const code = transformSync(section, { loader: "ts", format: "cjs" }).code;
  const module = { exports: {} as any };
  const tx = { query: { courses: { findFirst: async () => ({ id: "course" }) }, mataKuliah: { findFirst: async () => null } } };
  runInNewContext(code, { module, exports: module.exports, db: { transaction: (run: any) => run(tx) }, eq: () => {}, courses: {}, mataKuliah: {}, resolvePenggunaActorId: async () => "actor", saveChapterWithCanonicalProjection: save });
  return { run: module.exports.executeBatchCreateChapters, tx };
}

test("batch creation delegates allocation to the locked projection and returns allocated positions", async () => {
  const calls: any[] = [];
  const { run, tx } = executor(async (input, transaction) => { calls.push({ input, transaction }); return { id: String(calls.length), orderIndex: input.append ? 9 : input.orderIndex }; });
  const result = await run({ courseId: "course", chapters: [{ title: "New" }, { title: "Explicit", orderIndex: 12 }] });
  expect(calls.map(call => call.input.append)).toEqual([true, false]);
  expect(calls.every(call => call.transaction === tx)).toBe(true);
  expect(result.data.chapters.map((chapter: any) => chapter.orderIndex)).toEqual([9, 12]);
});

test("projection failure propagates instead of bypassing identity checks with direct inserts", async () => {
  const { run } = executor(async () => { throw new Error("CHAPTER_IDENTITY_AMBIGUOUS"); });
  await expect(run({ courseId: "course", chapters: [{ title: "New" }] })).rejects.toThrow("CHAPTER_IDENTITY_AMBIGUOUS");
});
