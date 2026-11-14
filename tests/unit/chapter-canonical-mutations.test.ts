import { describe, expect, it, mock } from "bun:test";

type Row = Record<string, any>;
type Column = { table: string; key: string };
const table = (name: string, keys: string[]) => Object.assign({ name }, Object.fromEntries(keys.map((key) => [key, { table: name, key }])));
const courses = table("courses", ["id"]);
const mataKuliah = table("mataKuliah", ["id", "legacyCourseId", "status"]);
const chapters = table("chapters", ["id", "courseId", "title", "orderIndex"]);
const bab = table("bab", ["id", "mataKuliahId", "legacyChapterId", "status", "orderIndex", "title"]);
const auditMutasi = table("audit", []);
const knowledgeObjects = table("knowledgeObjects", ["id", "chapterId", "version"]);
const vectorSyncQueue = table("vectorSyncQueue", ["koId", "payload"]);
const dispatched: string[] = [];
type Predicate = (row: Row) => boolean;
const eq = (col: Column, value: unknown): Predicate => (row) => row[col.key] === value;
const and = (...predicates: Predicate[]): Predicate => (row) => predicates.every((p) => p(row));
const or = (...predicates: Predicate[]): Predicate => (row) => predicates.some((p) => p(row));
const inArray = (col: Column, values: unknown[]): Predicate => (row) => values.includes(row[col.key]);
const desc = (col: Column) => ({ col, desc: true });
const sql = (parts: TemplateStringsArray, ...values: unknown[]) => ({ parts, values });

const data: Record<string, Row[]> = {};
let lockTail = Promise.resolve();
let locks = 0;
let maxLocks = 0;
let lockCalls = 0;
let selectCalls = 0;
function reset() {
  data.courses = [{ id: "legacy-course" }];
  data.mataKuliah = [{ id: "canonical-course", legacyCourseId: "legacy-course", status: "active" }];
  data.chapters = [];
  data.bab = [];
  data.audit = [];
  data.knowledgeObjects = [];
  data.vectorSyncQueue = [];
  dispatched.length = 0;
  locks = 0; maxLocks = 0; lockCalls = 0; selectCalls = 0; lockTail = Promise.resolve();
}
function fakeTransaction() {
  let release: (() => void) | undefined;
  let locked = false;
  const ensureUnique = (candidate: Row, except?: Row) => {
    if (data.bab.some((row) => row !== except && row.mataKuliahId === candidate.mataKuliahId && row.orderIndex === candidate.orderIndex)) throw new Error("unique bab order");
  };
  const tx = {
    async execute(query: any) {
      expect(query.parts.join("?")).toContain("pg_advisory_xact_lock");
      expect(query.values[0]).toBe(`zyx:chapters:${data.mataKuliah[0].id}`);
      lockCalls++;
      if (locked) return;
      const previous = lockTail;
      lockTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      locked = true; maxLocks = Math.max(maxLocks, ++locks);
      await Promise.resolve();
    },
    select(fields: Record<string, Column>) {
      selectCalls++;
      let source: string;
      let predicate: Predicate = () => true;
      let sort: any;
      let count = Infinity;
      const query = {
        from(t: { name: string }) { source = t.name; return query; },
        where(p: Predicate) { predicate = p; return query; },
        orderBy(s: any) { sort = s; return query; },
        limit(n: number) { count = n; return query; },
        for(mode: string) { expect(mode).toBe("update"); return query; },
        then(resolve: (value: Row[]) => unknown, reject: (error: unknown) => unknown) {
          try {
            let rows = data[source].filter(predicate);
            if (sort) { const col = sort.col ?? sort; rows = [...rows].sort((a, b) => (a[col.key] - b[col.key]) * (sort.desc ? -1 : 1)); }
            return Promise.resolve(rows.slice(0, count).map((row) => Object.fromEntries(Object.entries(fields).map(([key, col]) => [key, row[col.key]])))).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        },
      };
      return query;
    },
    insert(t: { name: string }) { return { async values(values: Row) {
      if (t.name === "bab") ensureUnique(values);
      data[t.name].push({ legacyChapterId: null, ...values });
    } }; },
    update(t: { name: string }) { return { set(values: Row) { return { async where(predicate: Predicate) {
      for (const row of data[t.name].filter(predicate)) {
        if (t.name === "bab") ensureUnique({ ...row, ...values }, row);
        Object.assign(row, values);
      }
    } }; } }; },
    delete(t: { name: string }) { return { async where(predicate: Predicate) {
      const removed = data[t.name].filter(predicate);
      data[t.name] = data[t.name].filter((row) => !predicate(row));
      if (t.name === "chapters") for (const row of data.bab) if (removed.some((item) => item.id === row.legacyChapterId)) row.legacyChapterId = null;
    } }; },
    finish() { if (locked) { locks--; release?.(); } },
  };
  return tx;
}
const db = { async transaction<T>(fn: (tx: ReturnType<typeof fakeTransaction>) => Promise<T>) {
  const tx = fakeTransaction();
  try { return await fn(tx); } finally { tx.finish(); }
} };
mock.module("drizzle-orm", () => ({ and, desc, eq, inArray, or, sql }));
mock.module("@/db/schema", () => ({ auditMutasi, bab, chapters, courses, mataKuliah, knowledgeObjects, vectorSyncQueue }));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: async (courseId: string) => { dispatched.push(courseId); } }));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/student/course-pricing", () => ({ validateCoursePricing: (x: unknown) => x }));
const { saveChapterWithCanonicalProjection: save, archiveChapterWithLegacyDeletion: archive, reorderChaptersWithCanonicalProjection: reorder } = await import("@/lib/academic/course-canonical-sync");

function fixtures() {
  reset();
  data.chapters.push({ id: "legacy-a", courseId: "legacy-course", title: "A", orderIndex: 1 });
  data.bab.push(
    { id: "canonical-a", mataKuliahId: "canonical-course", legacyChapterId: "legacy-a", status: "active", title: "A", orderIndex: 1 },
    { id: "only-b", mataKuliahId: "canonical-course", legacyChapterId: null, status: "active", title: "B", orderIndex: 3 },
    { id: "archived", mataKuliahId: "canonical-course", legacyChapterId: null, status: "archived", title: "Old", orderIndex: 2 },
    { id: "archived-high", mataKuliahId: "canonical-course", legacyChapterId: null, status: "archived", title: "Old high", orderIndex: 4 },
  );
}

describe("chapter identity and ordering with a fake transaction", () => {
  it("updates distinct identities and canonical-only chapters, including a description projection", async () => {
    fixtures();
    await save({ id: "canonical-a", courseId: "canonical-course", title: "Updated", orderIndex: 1 });
    expect(data.chapters[0].title).toBe("Updated");
    expect(data.bab[0].title).toBe("Updated");
    await save({ id: "only-b", courseId: "legacy-course", title: "B updated", orderIndex: 3, description: "Description" });
    const projection = data.chapters.find((row) => row.description === "Description");
    expect(projection?.courseId).toBe("legacy-course");
    expect(data.bab.find((row) => row.id === "only-b")?.legacyChapterId).toBe(projection?.id);
    expect(data.audit.at(-1)?.afterSnapshot.legacyCourseId).toBe("legacy-course");
  });
  it("serializes simultaneous appends and reserves archived positions", async () => {
    fixtures();
    const result = await Promise.all(["C", "D"].map((title) => save({ courseId: "canonical-course", title, orderIndex: 3, append: true })));
    expect(result.map((r) => r.orderIndex).sort()).toEqual([5, 6]);
    expect(maxLocks).toBe(1);
    expect(lockCalls).toBe(2);
    expect(data.bab.filter((row) => row.status === "archived").map((row) => row.orderIndex)).toEqual([2, 4]);
  });
  it("appends after unprojected legacy chapters in a mixed course", async () => {
    fixtures();
    data.chapters.push({ id: "legacy-late", courseId: "legacy-course", title: "Late", orderIndex: 12 });
    const created = await save({ courseId: "canonical-course", title: "New", orderIndex: 0, append: true });
    expect(created.orderIndex).toBe(13);
    expect(data.chapters.find((row) => row.id === created.id)?.orderIndex).toBe(13);
  });
  it("reorders canonical IDs around archived positions and accepts aliases", async () => {
    fixtures();
    await reorder("canonical-course", ["only-b", "legacy-a"]);
    expect(data.bab.find((row) => row.id === "only-b")?.orderIndex).toBe(1);
    expect(data.bab.find((row) => row.id === "canonical-a")?.orderIndex).toBe(2);
    expect(data.chapters[0].orderIndex).toBe(2);
    expect(data.bab.find((row) => row.id === "archived")?.orderIndex).toBeGreaterThan(4);
    expect(data.bab.find((row) => row.id === "archived-high")?.orderIndex).toBe(4);
    expect(data.bab.filter((row) => row.status === "archived")).toHaveLength(2);
    await expect(reorder("canonical-course", ["canonical-a", "legacy-a"])).rejects.toThrow("CHAPTER_ORDER_SCOPE_MISMATCH");
  });
  it("resolves all chapter identities with a fixed number of reads during reorder", async () => {
    reset();
    for (let i = 1; i <= 20; i++) {
      data.chapters.push({ id: `legacy-${i}`, courseId: "legacy-course", title: `${i}`, orderIndex: i });
      data.bab.push({ id: `canonical-${i}`, mataKuliahId: "canonical-course", legacyChapterId: `legacy-${i}`, status: "active", title: `${i}`, orderIndex: i });
    }
    await reorder("canonical-course", data.chapters.map((row) => row.id).reverse());
    expect(selectCalls).toBeLessThanOrEqual(12);
    expect(data.bab.find((row) => row.id === "canonical-20")?.orderIndex).toBe(1);
  });
  it("changes edit order via the same collision-safe reorder", async () => {
    fixtures();
    await save({ id: "only-b", courseId: "canonical-course", title: "B", orderIndex: 1 });
    expect(data.bab.find((row) => row.id === "only-b")?.orderIndex).toBe(1);
    expect(data.bab.find((row) => row.id === "canonical-a")?.orderIndex).toBe(2);
  });
  it("reorders mixed canonical and unprojected legacy chapters without losing either", async () => {
    fixtures();
    data.chapters.push({ id: "legacy-b", courseId: "legacy-course", title: "Legacy B", orderIndex: 2 });
    await reorder("canonical-course", ["legacy-b", "canonical-a", "only-b"]);
    expect(data.bab.find((row) => row.legacyChapterId === "legacy-b")?.orderIndex).toBe(1);
    expect(data.bab.find((row) => row.id === "canonical-a")?.orderIndex).toBe(2);
    expect(data.bab.find((row) => row.id === "only-b")?.orderIndex).toBe(3);
    expect(data.chapters.find((row) => row.id === "legacy-b")?.orderIndex).toBe(1);
  });
  it("can move an unprojected legacy chapter in a mixed list", async () => {
    fixtures();
    data.chapters.push({ id: "legacy-b", courseId: "legacy-course", title: "Legacy B", orderIndex: 2 });
    await save({ id: "legacy-b", courseId: "canonical-course", title: "Changed B", orderIndex: 1 });
    expect(data.bab.find((row) => row.legacyChapterId === "legacy-b")?.orderIndex).toBe(1);
    expect(data.chapters.find((row) => row.id === "legacy-b")?.title).toBe("Changed B");
  });
  it("archives canonical-only and mapped rows and keeps canonical archive records", async () => {
    fixtures();
    await archive("only-b", "admin");
    await archive("canonical-a", "admin");
    expect(data.bab.filter((row) => row.status === "archived")).toHaveLength(4);
    expect(data.chapters).toHaveLength(0);
    expect(data.audit.at(-1)?.actorId).toBe("admin");
  });
  it("preserves legacy KO vector deletion identity before the chapter cascade", async () => {
    fixtures();
    data.knowledgeObjects.push({ id: "ko-a", chapterId: "legacy-a", version: 7 });
    await archive("canonical-a");
    expect(data.vectorSyncQueue.map(row => row.payload.version)).toEqual([1, 7]);
    expect(data.vectorSyncQueue.every(row => row.payload.entityId === "ko-a" && row.payload.legacyKind === "knowledge_object" && row.koId === null)).toBe(true);
    expect(dispatched).toEqual(["legacy-course"]);
    expect(data.chapters).toHaveLength(0);
  });
  it("projects an existing legacy-only list before creating or editing a chapter", async () => {
    reset();
    data.chapters.push(
      { id: "legacy-a", courseId: "legacy-course", title: "A", orderIndex: 1 },
      { id: "legacy-b", courseId: "legacy-course", title: "B", orderIndex: 2 },
    );
    data.bab.push({ id: "archived", mataKuliahId: "canonical-course", status: "archived", orderIndex: 1 });
    await save({ courseId: "canonical-course", title: "C", orderIndex: 3, append: true });
    expect(data.bab.filter((row) => row.status === "active").map((row) => row.title)).toEqual(["A", "B", "C"]);
    expect(data.bab.find((row) => row.id === "archived")?.status).toBe("archived");
    expect(new Set(data.bab.map((row) => row.orderIndex)).size).toBe(4);
  });
  it("handles a course and chapters without legacy projections", async () => {
    reset();
    data.courses = [];
    data.mataKuliah = [{ id: "canonical-only", legacyCourseId: null, status: "active" }];
    const created = await save({ courseId: "canonical-only", title: "First", orderIndex: 0, append: true });
    expect(created.orderIndex).toBe(1);
    expect(data.chapters).toHaveLength(0);
    await save({ id: created.canonicalChapterId, courseId: "canonical-only", title: "Changed", orderIndex: 1 });
    expect(data.bab[0].title).toBe("Changed");
    await expect(save({ id: created.canonicalChapterId, courseId: "canonical-only", title: "Changed", orderIndex: 1, description: "Cannot persist" })).rejects.toThrow("CHAPTER_PROJECTION_UNAVAILABLE");
    await reorder("canonical-only", [created.canonicalChapterId]);
    await archive(created.canonicalChapterId);
    expect(data.bab[0].status).toBe("archived");
  });
  it("fails closed for ambiguous course and chapter aliases", async () => {
    fixtures();
    data.mataKuliah.push({ id: "other", legacyCourseId: "legacy-course", status: "active" });
    await expect(save({ id: "canonical-a", courseId: "canonical-course", title: "X", orderIndex: 1 })).rejects.toThrow("COURSE_IDENTITY_AMBIGUOUS");
    fixtures();
    data.bab.push({ id: "another", mataKuliahId: "canonical-course", legacyChapterId: "legacy-a", status: "active", title: "X", orderIndex: 5 });
    await expect(save({ id: "canonical-a", courseId: "canonical-course", title: "X", orderIndex: 1 })).rejects.toThrow("CHAPTER_IDENTITY_AMBIGUOUS");
    await expect(reorder("canonical-course", ["canonical-a", "only-b", "another"])).rejects.toThrow("CHAPTER_IDENTITY_AMBIGUOUS");
    fixtures();
    data.bab.push({ id: "foreign", mataKuliahId: "other-course", legacyChapterId: "legacy-a", status: "active", title: "X", orderIndex: 1 });
    await expect(reorder("canonical-course", ["canonical-a", "only-b"])).rejects.toThrow("CHAPTER_IDENTITY_AMBIGUOUS");
  });
});
