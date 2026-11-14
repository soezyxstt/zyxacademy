import { mock } from "bun:test";
import { strict as assert } from "node:assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let source: "canonical_assignment" | "admin_override" = "canonical_assignment";
let materials: Array<{ id: string; courseId: string; title: string; summary: string; createdAt: Date }> = [];
let selectCount = 0;

mock.module("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  notFound: () => { throw new Error("not found"); },
  useRouter: () => ({ refresh: () => {} }),
}));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "user-1" } }) } } }));
mock.module("@/lib/auth/request-cache", () => ({ requireTutorCourseAccess: async () => ({ source }) }));
mock.module("@/lib/admin/course-identity", () => ({
  resolveCourseIdentity: async () => ({ primaryId: "course-1", legacyId: "course-1", allIds: ["course-1"], title: "Course" }),
}));
mock.module("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => selectCount++ === 0 ? materials : [] }) }) }) },
}));
mock.module("@/db/schema", () => ({ aiMaterialInstances: {}, aiMaterialInstanceSections: {}, aiMaterialInstanceChunks: {} }));
mock.module("drizzle-orm", () => ({ inArray: () => null, desc: () => null, asc: () => null }));
mock.module("@/app/actions/tutor-management", () => ({ saveTutorMaterialAction: mock(), deleteTutorMaterialAction: mock() }));
mock.module("lucide-react", () => ({
  FileText: () => null, Plus: () => null, Edit2: () => null, Trash2: () => null, BookOpen: () => null,
}));
mock.module("@/components/ui/button", () => ({ Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button> }));
mock.module("@/components/admin/state-panels", () => ({
  AdminEmptyState: ({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) => <div>{title}{action}</div>,
}));
mock.module("@/components/ui/dialog", () => ({
  Dialog: () => null, DialogContent: () => null, DialogDescription: () => null,
  DialogFooter: () => null, DialogHeader: () => null, DialogTitle: () => null,
}));
mock.module("@/components/ui/input", () => ({ Input: () => null }));
mock.module("@/components/ui/label", () => ({ Label: () => null }));
mock.module("@/components/ui/textarea", () => ({ Textarea: () => null }));
mock.module("@/components/ui/toast", () => ({ toast: { success: mock(), error: mock() } }));
mock.module("@/lib/utils", () => ({ cleanSummary: (summary: string) => summary }));
mock.module("@/lib/i18n/client", () => ({ useTranslations: () => (key: string) => key }));
mock.module("@/lib/i18n/server", () => ({ getTranslations: async () => (key: string) => key }));
mock.module("@/lib/site", () => ({ pageTitle: (title: string) => title }));
mock.module("@/components/page-header", () => ({ PageHeader: () => null }));
mock.module("@/components/application-page", () => ({ ApplicationPage: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
mock.module("@/components/i18n/translated-text", () => ({ TranslatedText: () => null }));

const { default: TutorMaterialsPage } = await import("@/app/(tutor)/tutor/[courseId]/materials/page");

async function renderPage() {
  selectCount = 0;
  return renderToStaticMarkup(await TutorMaterialsPage({ params: Promise.resolve({ courseId: "course-1" }) }));
}

const empty = await renderPage();
assert.match(empty, /noMaterials/);
assert.doesNotMatch(empty, /addMaterial/);

materials = [{ id: "material-1", courseId: "course-1", title: "Document", summary: "Summary", createdAt: new Date(0) }];
const tutorList = await renderPage();
assert.match(tutorList, /Document/);
assert.doesNotMatch(tutorList, />edit<\/button>|>delete<\/button>|addMaterial/);

source = "admin_override";
materials = [];
assert.equal((await renderPage()).match(/addMaterial/g)?.length, 1);

materials = [{ id: "material-1", courseId: "course-1", title: "Document", summary: "Summary", createdAt: new Date(0) }];
const adminList = await renderPage();
assert.match(adminList, /addMaterial/);
assert.match(adminList, />edit<\/button>/);
assert.match(adminList, />delete<\/button>/);
