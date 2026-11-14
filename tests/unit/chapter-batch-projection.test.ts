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

test("a canonical chapter update retains the linked legacy description when omitted", async () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
  const source = readFileSync("lib/admin-ops-ai/domain-academic.ts", "utf8");
  const section = source.slice(source.indexOf("export async function executeUpdateChapter"), source.indexOf("export interface ListMaterialsInput"));
  const module = { exports: {} as any };
  let saved: any;
  runInNewContext(transformSync(section, { loader: "ts", format: "cjs" }).code, {
    module, exports: module.exports,
    db: { query: {
      bab: { findFirst: async () => ({ id: "canonical", mataKuliahId: "course", legacyChapterId: "legacy", title: "Old", orderIndex: 1 }) },
      chapters: { findFirst: async ({ where }: any) => where === "legacy" ? { description: "Keep this" } : null },
    } },
    bab: { id: "id" }, chapters: { id: "id" }, eq: (_column: unknown, id: string) => id,
    resolvePenggunaActorId: async () => "actor",
    saveChapterWithCanonicalProjection: async (input: unknown) => { saved = input; },
  });
  await module.exports.executeUpdateChapter({ chapterId: "canonical", title: "New" });
  expect(saved.description).toBe("Keep this");
  expect(saved.id).toBe("canonical");
});

test("the admin course list includes unprojected legacy chapters and excludes archived projections", () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
  const source = readFileSync("app/(admin)/admin/(academic)/courses/actions.ts", "utf8");
  const projection = source.slice(source.indexOf("  const babList = allBab.filter"), source.indexOf("  // Aggregate quiz attempts"));
  const module = { exports: {} as any };
  runInNewContext(transformSync(`export function project(allBab, legacyChapters, canonicalCourseId) { ${projection} return chaptersList; }`, { loader: "ts", format: "cjs" }).code, { module, exports: module.exports });
  const result = module.exports.project([
    { id: "canonical-a", legacyChapterId: "legacy-a", title: "A", orderIndex: 1, status: "active" },
    { id: "archived", legacyChapterId: "legacy-old", title: "Old", orderIndex: 4, status: "archived" },
  ], [
    { id: "legacy-a", title: "A", orderIndex: 1, description: "Description" },
    { id: "legacy-b", title: "B", orderIndex: 2, description: null, status: "published" },
    { id: "legacy-old", title: "Old", orderIndex: 4, description: null },
  ], "course");
  expect(result.map((chapter: any) => chapter.id)).toEqual(["canonical-a", "legacy-b"]);
  expect(result[0].description).toBe("Description");
});
