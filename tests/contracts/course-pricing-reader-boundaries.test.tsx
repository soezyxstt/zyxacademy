import { beforeEach, describe, expect, it, mock } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

let exam: any;
let article: any;
let product: any;
let legacyMaterial: any;
let webMaterial: any;
let aiMaterial: any;
let webBodyReads = 0;
let aiBodyReads = 0;
let policy: any;
let signedIn = true;
let questionReads = 0;
let articleReads = 0;
let productReads = 0;
const dialect = new PgDialect();
const course = { id: "canonical", legacyId: "legacy", title: "Course" };

mock.module("server-only", () => ({}));
mock.module("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: () => { throw new Error("REDIRECT"); } }));
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => signedIn ? { user: { id: "student" } } : null }));
mock.module("@/app/(student)/dashboard/actions", () => ({ checkFullCourseContentAccess: async () => signedIn && policy.hasFullContentAccess }));
mock.module("@/lib/course-utils", () => ({
  getCourse: async () => course,
  getStudentCourseAccess: async () => ({ tier: policy.tier === "enrolled" ? "standard" : policy.tier, hasFullContentAccess: policy.hasFullContentAccess, freeChapterIds: policy.freeChapterIds, policy }),
  isFreeChapterScoped: (ids: string[], free: string[]) => ids.length > 0 && ids.every((id) => free.includes(id)),
  getCanonicalPublishedArticle: async () => { articleReads++; return article?.structured ? { title: article.title, chapterId: article.chapterId } : null; },
  getCanonicalPublishedTextProduct: async () => { productReads++; return product; },
  getCourseTermIndex: async () => [],
}));
mock.module("@/lib/i18n/server", () => ({ getTranslations: async () => (key: string) => key }));
mock.module("@/lib/site", () => ({ createMetadata: (value: unknown) => value }));
mock.module("@/lib/student-course-fixtures", () => ({ getMaterial: () => undefined }));
mock.module("@/app/(student)/courses/[id]/material/[materialId]/material-metadata", () => ({ getMaterialMetadataTitle: async () => null }));
mock.module("@/lib/storage", () => ({ storage: { getUrl: (url: string) => url } }));
mock.module("@/components/course/course-page-shell", () => ({ CoursePageShell: () => null }));
mock.module("@/components/course/tryout-form", () => ({ TryoutForm: () => null }));
mock.module("@/components/course/material-viewer", () => ({ MaterialViewer: () => null }));
mock.module("@/components/course/structured-article-reader", () => ({ StructuredArticleReader: () => null }));
mock.module("@/components/course/course-skeletons", () => ({ MaterialReaderContentSkeleton: () => null }));
mock.module("@/components/enrollment-form", () => ({ EnrollmentForm: () => null }));
mock.module("@/components/ui/reveal", () => ({ Reveal: () => null }));
mock.module("@/components/ui/button", () => ({ Button: () => null }));
mock.module("@/components/i18n/translated-text", () => ({ TranslatedText: () => null }));
mock.module("@/components/ui/formatted-date", () => ({ FormattedDate: () => null }));

mock.module("@/db", () => ({ db: {
  select: (selection?: any) => ({ from: (table: unknown) => {
    let params: unknown[] = [];
    const rows = () => {
      if (table === schema.exams) return exam && params.includes(exam.id) && params.includes(exam.courseId) && params.includes(exam.type) && params.includes(exam.status) ? [exam] : [];
      if (table === schema.questions) { questionReads++; return [{ id: "q1", order: 1, type: "mcq", content: { prompt: "Secret prompt", options: [{ text: "A", correct: true }] } }]; }
      if (table === schema.artikel) return article ? [{ title: article.title, chapterId: article.chapterId }] : [];
      if (table === schema.diktatMateri) return product ? [{ title: product.title, chapterId: product.chapterId }] : [];
      if (table === schema.courseMaterials) return legacyMaterial ? [legacyMaterial] : [];
      if (table === schema.websiteMaterials && webMaterial) {
        if (selection?.canonicalMarkdown) { webBodyReads++; return [{ canonicalMarkdown: webMaterial.canonicalMarkdown }]; }
        return [webMaterial];
      }
      return [];
    };
    return { where: (condition: any) => { params = dialect.sqlToQuery(condition).params; return { limit: async () => rows(), orderBy: async () => rows() }; } };
  } }),
  query: { aiMaterialInstances: { findFirst: async (query: any) => {
    if (!aiMaterial) return null;
    if (query.with) { aiBodyReads++; return { sections: [{ title: "Section", chunks: [{ chunkText: "AI body" }] }] }; }
    return aiMaterial;
  } } },
} }));

const { default: tryoutPage, generateMetadata } = await import("@/app/(student)/courses/[id]/tryout/[tryoutId]/page");
const { default: materialPage } = await import("@/app/(student)/courses/[id]/material/[materialId]/page");
const tryoutParams = { params: Promise.resolve({ id: "canonical", tryoutId: "exam" }) };
const materialParams = { params: Promise.resolve({ id: "canonical", materialId: "material" }) };

async function materialContent() {
  const suspense = await materialPage(materialParams);
  const child = (suspense as any).props.children;
  return child.type(child.props);
}
function findElement(node: any, name: string): any {
  if (!node || typeof node !== "object") return null;
  if (node.type?.name === name) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findElement(child, name);
    if (found) return found;
  }
  return null;
}

beforeEach(() => {
  signedIn = true;
  questionReads = articleReads = productReads = webBodyReads = aiBodyReads = 0;
  exam = { id: "exam", courseId: "legacy", type: "tryout", status: "published", title: "Published", openAt: null, closeAt: null };
  article = product = legacyMaterial = webMaterial = aiMaterial = null;
  policy = { canonicalCourseId: "canonical", hasCourseAccess: true, hasFullContentAccess: true, tier: "free", scopedChapterIds: ["one", "two"], freeChapterIds: ["one"], capabilities: { canReadArticle: true, canReadDiktat: true, canDownloadDiktat: true } };
});

describe("student reader pricing boundaries", () => {
  it("never queries draft, foreign or wrong-type exams and never reveals their metadata", async () => {
    for (const change of [{ status: "draft" }, { courseId: "foreign" }, { type: "quiz" }]) {
      exam = { ...exam, status: "published", courseId: "legacy", type: "tryout", ...change, title: "Private title" };
      await expect(tryoutPage(tryoutParams)).rejects.toThrow("NOT_FOUND");
      expect(questionReads).toBe(0);
      expect(JSON.stringify(await generateMetadata(tryoutParams))).not.toContain("Private title");
    }
  });

  it("loads published questions only after full access and the time window, and strips answers", async () => {
    policy.hasFullContentAccess = false;
    await tryoutPage(tryoutParams);
    expect(questionReads).toBe(0);
    signedIn = false;
    await tryoutPage(tryoutParams);
    expect(questionReads).toBe(0);
    signedIn = true;
    policy.hasFullContentAccess = true;
    exam.closeAt = new Date("2000-01-01");
    await tryoutPage(tryoutParams);
    expect(questionReads).toBe(0);
    exam.closeAt = null;
    const page = await tryoutPage(tryoutParams);
    expect(questionReads).toBe(1);
    const form = findElement(page, "TryoutForm");
    expect(form.props.exam.questions[0].prompt).toBe("Secret prompt");
    expect(form.props.exam.questions[0].options).toEqual(["A"]);
    expect(JSON.stringify(form.props.exam)).not.toContain("correct");
  });

  it("checks canonical chapters before loading structured or markdown content", async () => {
    for (const chapterId of ["archived", "foreign", null]) {
      article = { title: "Article", chapterId, structured: true };
      expect((await materialContent()).type.name).toBe("MaterialLocked");
      expect(articleReads).toBe(0);
      expect(productReads).toBe(0);
    }
    article = { title: "Article", chapterId: "two", structured: true };
    expect((await materialContent()).type.name).toBe("StructuredArticleReader");
    policy.hasFullContentAccess = false;
    expect((await materialContent()).type.name).toBe("MaterialLocked");
    article.chapterId = "one";
    expect((await materialContent()).type.name).toBe("StructuredArticleReader");
    policy.tier = "enrolled";
    policy.hasFullContentAccess = true;
    article.chapterId = "two";
    expect((await materialContent()).type.name).toBe("StructuredArticleReader");
  });

  it("allows scoped uploaded PDFs and canonical text but denies orphaned protected content", async () => {
    product = { id: "material", title: "Text", chapterId: "two", contentMarkdown: "Body", productType: "diktat" };
    expect(findElement(await materialContent(), "MaterialViewer").props.material.body).toBe("Body");
    product.chapterId = "archived";
    const before = productReads;
    expect((await materialContent()).type.name).toBe("MaterialLocked");
    expect(productReads).toBe(before);
    product = null;
    policy.hasFullContentAccess = false;
    legacyMaterial = { id: "material", title: "PDF", type: "materi", fileUrl: "file.pdf", chapterIds: ["two"] };
    expect(findElement(await materialContent(), "MaterialViewer")).not.toBeNull();
    for (const chapterIds of [[], ["foreign"], ["archived"], ["one", "foreign"]]) {
      legacyMaterial.chapterIds = chapterIds;
      expect((await materialContent()).type.name).toBe("MaterialLocked");
    }
    signedIn = false;
    await expect(materialContent()).rejects.toThrow("REDIRECT");
  });
  it("does not fetch website or AI article bodies outside the permitted chapter scope", async () => {
    webMaterial = { id: "material", title: "Website", status: "published", chapterId: "archived", canonicalMarkdown: "Hidden" };
    expect((await materialContent()).type.name).toBe("MaterialLocked");
    expect(webBodyReads).toBe(0);
    webMaterial.chapterId = "two";
    expect(findElement(await materialContent(), "MaterialViewer").props.material.body).toBe("Hidden");
    expect(webBodyReads).toBe(1);
    webMaterial = null;
    aiMaterial = { id: "material", title: "AI", chapterIds: ["foreign"] };
    expect((await materialContent()).type.name).toBe("MaterialLocked");
    expect(aiBodyReads).toBe(0);
    aiMaterial.chapterIds = ["two"];
    expect(findElement(await materialContent(), "MaterialViewer").props.material.body).toContain("AI body");
    expect(aiBodyReads).toBe(1);
  });

});
