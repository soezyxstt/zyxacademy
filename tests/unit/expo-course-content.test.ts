import { describe, expect, test } from "bun:test";
import { documentGroups, expandedDocumentGroup, shortDocumentTitle } from "../../apps/mobile-native/features/student/courses/course-content-model";
import { materialRowPath, type MaterialListData, type MaterialRow } from "../../packages/native-parity/student/courses/contract";

const list: MaterialListData = {
  view: "material-list",
  course: { id: "math", category: "TPB", description: "", title: "Matematika I", hasFullContentAccess: false },
  chapters: [
    { id: "empty", aliases: [], title: "Pendahuluan" },
    { id: "functions", aliases: ["canonical-functions", "legacy-functions"], title: "Fungsi", orderIndex: 4 },
    { id: "derivatives", aliases: [], title: "Turunan" },
  ],
  materials: [
    { id: "paired", kind: "article", group: "materi", title: "Artikel", completed: false, locked: false,
      chapterIds: ["canonical-functions", "legacy-functions", "derivatives", "missing"] },
    { id: "restricted", kind: "article", group: "diktat", title: "Diktat", completed: false, locked: true, chapterIds: ["functions"] },
    { id: "unknown", kind: "pdf", group: "pdf", title: "PDF", completed: false, locked: true, chapterIds: ["missing"] },
  ] satisfies MaterialRow[],
};

describe("native Student document listing", () => {
  test("coalesces aliases, retains cross-chapter materials and preserves the locked row target", () => {
    const groups = documentGroups(list, "all");
    expect(groups.chapters.map(group => [group.id, group.number, group.rows.map(row => row.id)])).toEqual([
      ["functions", 4, ["paired", "restricted"]], ["derivatives", 3, ["paired"]],
    ]);
    expect(groups.ungrouped.map(row => row.id)).toEqual(["unknown"]);
    const restricted = groups.chapters[0].rows[1];
    expect(restricted.locked).toBe(true);
    expect(materialRowPath(list.course.id, restricted)).toBe("/courses/math/material/restricted");
  });

  test("filters before calculating visible section counts", () => {
    expect(documentGroups(list, "diktat").chapters.map(group => group.rows.length)).toEqual([1]);
    expect(documentGroups(list, "pdf")).toEqual({ chapters: [], ungrouped: [list.materials[2]] });
    expect(documentGroups(list, "bank_soal")).toEqual({ chapters: [], ungrouped: [] });
  });

  test("restores the expanded chapter across a refresh, including an explicit collapse", () => {
    const { chapters, ungrouped } = documentGroups(list, "all");
    expect(expandedDocumentGroup(undefined, chapters, true)).toBe("functions");
    expect(expandedDocumentGroup("derivatives", chapters, true)).toBe("derivatives");
    expect(expandedDocumentGroup(null, chapters, true)).toBeNull();
    expect(expandedDocumentGroup("deleted", chapters, true)).toBe("functions");
    expect(expandedDocumentGroup(undefined, [], ungrouped.length > 0)).toBe("__other__");
    expect(expandedDocumentGroup("__other__", [], false)).toBeNull();
  });

  test("shortens redundant prefixes and keeps titles when they have no distinct remainder", () => {
    expect(shortDocumentTitle("Matematika I: Bab 2: Fungsi dan grafik", "Matematika I")).toBe("Fungsi dan grafik");
    expect(shortDocumentTitle("Matematika I", "Matematika I")).toBe("Matematika I");
    expect(shortDocumentTitle("24. Menentukan domain fungsi", "Matematika I")).toBe("24. Menentukan domain fungsi");
  });
});
