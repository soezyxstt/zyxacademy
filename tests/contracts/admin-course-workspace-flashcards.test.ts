import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const flashcardsPagePath = "app/(admin)/admin/(academic)/courses/[slug]/flashcards/page.tsx";
const flashcardActionsPath = "app/(admin)/admin/(academic)/courses/flashcard-actions.ts";
const flashcardsTabComponentPath = "components/admin/course-detail/flashcards-tab.tsx";
const materialWorkspacePath = "components/admin/material-workspace.tsx";

describe("Admin Course Workspace Flashcards & Review Katalog Removal Contract", () => {
  describe("1. MaterialWorkspace redundant catalog tab removal", () => {
    test("does not contain Katalog Produk tab trigger or content", () => {
      const content = source(materialWorkspacePath);
      expect(content).not.toContain("Katalog Produk");
      expect(content).not.toContain("<TabsTrigger value=\"catalog\"");
      expect(content).not.toContain("<TabsContent value=\"catalog\"");
      expect(content).not.toContain("ProductCatalogPanel");
    });
  });

  describe("2. Flashcards route presence and server-side structure", () => {
    test("provides course-scoped flashcards route with admin authorization", () => {
      expect(existsSync(flashcardsPagePath)).toBe(true);

      const page = source(flashcardsPagePath);
      expect(page).toContain("assertAdmin");
      expect(page).toContain("getCourseDetailData");
      expect(page).toContain("getCourseFlashcardsData");
      expect(page).toContain("notFound()");
      expect(page).toContain("<CourseDetailHeader");
      expect(page).toContain("<FlashcardsTab");
    });
  });

  describe("3. Flashcard CRUD Server Actions contract", () => {
    test("provides typed CRUD actions for sets and cards", () => {
      expect(existsSync(flashcardActionsPath)).toBe(true);

      const actions = source(flashcardActionsPath);
      expect(actions).toContain("export async function getCourseFlashcardsData");
      expect(actions).toContain("export async function createFlashcardSetAction");
      expect(actions).toContain("export async function updateFlashcardSetAction");
      expect(actions).toContain("export async function deleteFlashcardSetAction");
      expect(actions).toContain("export async function createFlashcardAction");
      expect(actions).toContain("export async function updateFlashcardAction");
      expect(actions).toContain("export async function deleteFlashcardAction");
    });

    test("enforces admin authorization inside actions", () => {
      const actions = source(flashcardActionsPath);
      expect(actions).toContain("await assertAdmin()");
    });
  });

  describe("4. FlashcardsTab design system adherence", () => {
    test("uses shared design system primitives", () => {
      expect(existsSync(flashcardsTabComponentPath)).toBe(true);

      const component = source(flashcardsTabComponentPath);
      expect(component).toContain("AdminStatStrip");
      expect(component).toContain("AdminStatStripItem");
      expect(component).toContain("AdminConfirmDialog");
      expect(component).toContain("StatusBadge");
      expect(component).toContain("AdminEmptyState");
      expect(component).toContain("MathText");
      expect(component).toContain("SearchBar");
    });
  });
});
