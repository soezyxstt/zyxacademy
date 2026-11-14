import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { fictionalDemoSnapshot } from "@/lib/demo/fictional-snapshot";
import { createPostgresTestDb } from "../helpers/postgres";

mock.module("server-only", () => ({}));
let fixture: Awaited<ReturnType<typeof createPostgresTestDb>>;
mock.module("@/lib/db", () => ({ get db() { return fixture.testDb; } }));
mock.module("@/db", () => ({ get db() { return fixture.testDb; } }));
let getDemoSummaries: typeof import("@/lib/demo/summary-repository").getDemoSummaries;
let resolvePublicFreeFirstChapter: typeof import("@/lib/demo/legacy-eligibility").resolvePublicFreeFirstChapter;

beforeAll(async () => {
  fixture = await createPostgresTestDb();
  ({ getDemoSummaries } = await import("@/lib/demo/summary-repository"));
  ({ resolvePublicFreeFirstChapter } = await import("@/lib/demo/legacy-eligibility"));
  const db = fixture.testDb;
  await db.insert(s.user).values({ id: "author", name: "Fictional author", email: "fictional@example.test" });
  await db.insert(s.pengguna).values({ id: "author" });
  await db.insert(s.courses).values({ id: "legacy", title: "Matematika I", category: "TPB" });
  await db.insert(s.mataKuliah).values({ id: "course", code: "M", title: "Matematika I", legacyCourseId: "legacy" });
  await db.insert(s.publicDemoSnapshots).values({ id: "snapshot", courseId: "course", snapshot: fictionalDemoSnapshot("course") });
  await db.insert(s.bab).values([
    { id: "chapter-2", mataKuliahId: "course", code: "B2", title: "Later", orderIndex: 2 },
    { id: "chapter-1", mataKuliahId: "course", code: "B1", title: "First", orderIndex: 1 },
  ]);
}, 60_000);
afterAll(async () => { await fixture?.client.close(); });

test("fictional fallback metadata matches the full resolver without returning product bodies", async () => {
  const summaries = await getDemoSummaries();
  expect(summaries).toHaveLength(1);
  expect(summaries[0].content.course).toMatchObject({ id: "course", title: "Matematika I", category: "TPB", chapterTitle: "First", chapterNumber: 1 });
  expect(summaries[0].content.article).toEqual({ id: "fictional-course-article", title: "First" });
  expect(summaries[0].content.article?.id).toBe((await resolvePublicFreeFirstChapter("course"))?.article.id);
  expect(JSON.stringify(summaries)).not.toMatch(/correctIndices|fileKey|storage|questions/);
});

test("default metadata uses the same published first-chapter article as the reader", async () => {
  const db = fixture.testDb;
  const common = { mataKuliahId: "course", creatorId: "author", sourceHash: "fixture", generationHash: "fixture", structureStatus: "structured" as const, contentMarkdown: "PRIVATE BODY" };
  await db.insert(s.artikel).values([
    { ...common, id: "a-draft", babId: "chapter-1", slug: "draft", title: "Private draft", status: "draft" },
    { ...common, id: "b-later", babId: "chapter-2", slug: "later", title: "Later title", status: "published" },
    { ...common, id: "c-free", babId: "chapter-1", slug: "free", title: "Free title", status: "published" },
  ]);
  await db.insert(s.bagianArtikel).values({ id: "section", artikelId: "c-free", sectionKey: "intro", slug: "intro", sectionKind: "topic", title: "Intro", learningObjective: "Understand", orderIndex: 0, estimatedReadingMinutes: 1 });
  await db.insert(s.blokArtikel).values({ id: "block", artikelId: "c-free", bagianArtikelId: "section", blockKey: "intro", blockType: "text", orderIndex: 0, content: "FREE BODY", generationHash: "fixture", status: "published" });
  const summaries = await getDemoSummaries();
  expect(summaries[0].content.article).toEqual({ id: "c-free", title: "Free title" });
  expect(summaries[0].content.article?.id).toBe((await resolvePublicFreeFirstChapter("course"))?.article.id);
  expect(JSON.stringify(summaries)).not.toMatch(/PRIVATE BODY|FREE BODY|Private draft|Later title/);
});

test("fails closed for an ambiguous canonical identity or absent active chapter", async () => {
  const db = fixture.testDb;
  await db.insert(s.mataKuliah).values({ id: "collision", code: "X", title: "Collision", legacyCourseId: "legacy" });
  expect(await getDemoSummaries()).toEqual([]);
  await db.delete(s.mataKuliah).where(eq(s.mataKuliah.id, "collision"));
  await db.delete(s.bab).where(eq(s.bab.mataKuliahId, "course"));
  expect(await getDemoSummaries()).toEqual([]);
});
