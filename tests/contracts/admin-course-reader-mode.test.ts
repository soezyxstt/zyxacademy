import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

describe("admin course reader mode contract", () => {
  test("defines explicit learner and admin preview modes", () => {
    const mode = source("lib/materials/reader-mode.ts");
    const materialViewer = source("components/course/material-viewer.tsx");
    const structuredReader = source("components/course/structured-article-reader.tsx");

    expect(mode).toContain('"learner" | "admin-preview"');
    expect(materialViewer).toContain('mode = "learner"');
    expect(structuredReader).toContain('mode = "learner"');
    expect(materialViewer).toContain("isLearnerReaderMode(mode)");
    expect(structuredReader).toContain("isLearnerReaderMode(mode)");
  });

  test("gates every learner mutation in MaterialViewer", () => {
    const content = source("components/course/material-viewer.tsx");
    expect(content).toContain('if (!learnerMode) return;\n    updateMaterialProgress(material.id, "in_progress")');
    expect(content).toContain('if (!learnerMode) return;\n    let secondsSinceLastSave = 0');
    expect(content).toContain('if (!learnerMode) return;\n    try {\n      const storedNotes');
    expect(content).toContain('async function markDone() {\n    if (!learnerMode) return;');
    expect(content).toContain('learnerMode && accessTier !== "free" && ragEnabled && chapterId');
  });

  test("gates progress and Zyra paths in StructuredArticleReader", () => {
    const content = source("components/course/structured-article-reader.tsx");
    expect(content).toContain('if (!learnerMode) return;\n      try {\n        const res = await fetch(`/api/student/articles/');
    expect(content).toContain('if (!learnerMode) return;\n    activeTimeSpentRef.current = 0');
    expect(content).toContain('if (!learnerMode || !selectionAskEnabled || !isMobileSelection || isTutorOpen) return;\n');
    expect(content).toContain('if (!learnerMode || !selectionAskEnabled || isMobileSelection) return;\n');
    expect(content).toContain("learnerMode && isMobileSelection && !isTutorOpen && isSelectionToolbarOpen && selectionContext");
    expect(content).toContain("learnerMode && !isMobileSelection && selectionCoords && selectionContext");
  });

  test("admin preview authenticates and resolves ownership before rendering", () => {
    const page = source("app/(admin)/admin/(academic)/courses/[slug]/documents/[materialId]/page.tsx");
    const workspace = source("components/admin/course-detail/admin-document-workspace.tsx");
    const loader = source("lib/admin/course-material-preview.ts");
    expect(page).toContain("await assertAdmin()");
    expect(page).toContain("resolveCourseIdentity(slug)");
    expect(page).toContain("getAdminCourseMaterialPreview(identity, materialId)");
    expect(page).toContain("if (!preview) notFound()");
    expect(workspace).toContain('mode="admin-preview"');
    expect(loader).toContain("inArray(courseMaterials.courseId, compatibleIds)");
    expect(loader).toContain("getCanonicalPublishedArticle(canonicalCourseId, materialId)");
  });

  test("admin list reuses the Student presentation and keeps controls outside readers", () => {
    const page = source("app/(admin)/admin/(academic)/courses/[slug]/documents/page.tsx");
    const workspace = source("components/admin/course-detail/admin-document-workspace.tsx");
    const student = source("app/(student)/courses/[id]/material/[materialId]/page.tsx");
    expect(page).toContain("CourseDocumentsClient");
    expect(source("app/(student)/courses/[id]/material/course-documents-client.tsx")).toContain("<DocumentListClient");
    expect(page).toContain("listAdminCourseMaterials(identity)");
    expect(workspace.indexOf("AdminMaterialPreviewBar")).toBeLessThan(workspace.indexOf("StructuredArticleReader"));
    expect(student).not.toContain("AdminMaterialPreviewBar");
  });
});
