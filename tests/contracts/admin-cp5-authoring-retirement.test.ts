import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function getAllFiles(dir: string, extensions: string[]): string[] {
  const result: string[] = [];
  function traverse(current: string) {
    const entries = readdirSync(current);
    for (const entry of entries) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        traverse(full);
      } else if (extensions.some((ext) => entry.endsWith(ext))) {
        result.push(full);
      }
    }
  }
  traverse(dir);
  return result;
}

describe("CP5: Retirement of browser manual authoring and clean global navigation", () => {
  describe("1. Navigation exactness", () => {
    it("sidebar Akademik & Konten contains exactly three items", () => {
      const sidebar = source("components/admin-sidebar.tsx");

      // Check group definition
      expect(sidebar).not.toContain('"evaluasi"');
      expect(sidebar).not.toContain("Bank Soal & Asesmen");

      // Check ALL_ADMIN_TABS entries for akademik
      expect(sidebar).toContain('{ id: "courses", label: "Mata Kuliah", href: "/admin/courses", icon: GraduationCap, group: "akademik" }');
      expect(sidebar).toContain('{ id: "schedules", label: "Jadwal Umum", href: "/admin/schedules", icon: CalendarDays, group: "akademik" }');
      expect(sidebar).toContain('{ id: "bank-soal", label: "Bank Soal", href: "/admin/questions", icon: Library, group: "akademik" }');

      // Ensure no extra items in akademik group
      const matches = sidebar.match(/group:\s*"akademik"/g);
      expect(matches?.length).toBe(3);
    });

    it("admin dashboard category Akademik & Konten reflects exactly the same three global destinations", () => {
      const dashboard = source("app/(admin)/admin/page.tsx");
      expect(dashboard).toContain('name: "Akademik & Konten"');
      expect(dashboard).toContain('href: "/admin/courses"');
      expect(dashboard).toContain('href: "/admin/schedules"');
      expect(dashboard).toContain('href: "/admin/questions"');

      // Stale course-related dashboard shortcuts are removed
      expect(dashboard).not.toContain('href: "/admin/materials/review"');
      expect(dashboard).not.toContain('href: "/admin/quizzes"');
    });
  });

  describe("2. Secondary Bank Soal actions", () => {
    it("keeps Generasi Soal and Distraktor as secondary actions on Bank Soal page", () => {
      const questionsPage = source("app/(admin)/admin/(eval)/questions/page.tsx");
      expect(questionsPage).toContain('href="/admin/jobs"');
      expect(questionsPage).toContain('messageKey="routes.generationJobs"');
      expect(JSON.parse(source("messages/id/adminEval.json")).routes.generationJobs).toBe("Generasi Soal");
      expect(questionsPage).toContain('href="/admin/distractors"');
      expect(questionsPage).toContain('messageKey="routes.distractors"');
      expect(JSON.parse(source("messages/id/adminEval.json")).routes.distractors).toBe("Analitik Distraktor");
    });

    it("does not list Generasi Soal or Distraktor as sidebar items", () => {
      const sidebar = source("components/admin-sidebar.tsx");
      expect(sidebar).not.toContain('href: "/admin/jobs"');
      expect(sidebar).not.toContain('href: "/admin/distractors"');
    });
  });

  describe("3. Absence of browser Upload Manual surfaces", () => {
    it("removes manual authoring from sidebar, mobile navbar, and search index", () => {
      const sidebar = source("components/admin-sidebar.tsx");
      expect(sidebar).not.toContain("/admin/materials/manual");
      expect(sidebar).not.toContain("/admin/authoring-context");

      const mobileNavbar = source("components/mobile-navbar.tsx");
      expect(mobileNavbar).not.toContain('"Upload Manual"');
      expect(mobileNavbar).not.toContain('"Authoring Context"');

      const searchIndex = source("lib/site-search-index.ts");
      expect(searchIndex).not.toContain("/admin/materials/manual");
      expect(searchIndex).not.toContain("Upload materi manual");
    });

    it("strips manual-only props and loaders from MaterialWorkspace and data loader", () => {
      const workspace = source("components/admin/material-workspace.tsx");
      expect(workspace).not.toContain("authoringCourses");
      expect(workspace).not.toContain("initialContextExports");
      expect(workspace).not.toContain("AuthoringJobBuilder");
      expect(workspace).not.toContain("AuthoringContextExport");
      expect(workspace).not.toContain('"manual"');

      const dataLoader = source("app/(admin)/admin/(academic)/materials/data.ts");
      expect(dataLoader).not.toContain("listAuthoringContextExports");
      expect(dataLoader).not.toContain("listAuthoringCourseOptions");
      expect(dataLoader).not.toContain("authoringCourses");
      expect(dataLoader).not.toContain("initialContextExports");
    });

    it("verifies retired manual component files are removed", () => {
      expect(existsSync("components/admin/authoring-job-builder.tsx")).toBe(false);
      expect(existsSync("components/admin/authoring-context-export.tsx")).toBe(false);
      expect(existsSync("components/admin/authoring-context-panel.tsx")).toBe(false);
      expect(existsSync("components/admin/pdf-materials-tab.tsx")).toBe(false);
    });
  });

  describe("4. Absence of browser UI callers for retired components", () => {
    it("ensures no app or components code references deleted manual components", () => {
      const appFiles = getAllFiles("app", [".ts", ".tsx"]);
      const componentFiles = getAllFiles("components", [".ts", ".tsx"]);
      const allFiles = [...appFiles, ...componentFiles];

      const forbiddenSymbols = [
        "authoring-job-builder",
        "AuthoringJobBuilder",
        "authoring-context-export",
        "AuthoringContextExport",
        "authoring-context-panel",
        "AuthoringContextPanel",
        "pdf-materials-tab",
        "PdfMaterialsTab",
        "courses-page-tabs",
        "CoursesPageTabs",
      ];

      for (const file of allFiles) {
        const fileContent = source(file);
        for (const symbol of forbiddenSymbols) {
          expect(
            fileContent.includes(symbol),
            `File ${file} still references retired symbol ${symbol}`,
          ).toBe(false);
        }
      }
    });
  });

  describe("5. Manual page redirects and authenticated 410 APIs", () => {
    it("redirects legacy manual pages to /admin/courses", () => {
      const manualPage = source("app/(admin)/admin/(academic)/materials/manual/page.tsx");
      expect(manualPage).toContain('redirect("/admin/courses")');

      const contextPage = source("app/(admin)/admin/(academic)/authoring-context/page.tsx");
      expect(contextPage).toContain('redirect("/admin/courses")');
    });

    it("returns authenticated 410 responses from retired browser manual APIs", () => {
      const apis = [
        "app/api/admin/authoring-context/route.ts",
        "app/api/admin/authoring-context/[id]/route.ts",
        "app/api/admin/authoring-jobs/route.ts",
      ];

      for (const apiPath of apis) {
        const apiContent = source(apiPath);
        expect(apiContent).toContain("session.user.role !== \"admin\"");
        expect(apiContent).toContain("{ status: 410 }");
        expect(apiContent).toContain("BROWSER_MANUAL_AUTHORING_RETIRED");
        expect(apiContent).toContain("/admin/courses");
      }
    });
  });

  describe("6. Stale Tutorial PKA course management links fix", () => {
    it("maps Tutorial PKA shortcuts to course workspace surfaces", () => {
      const sidebar = source("components/admin-sidebar.tsx");

      // Quizzes and Materials mapped to course workspace
      expect(sidebar).toContain('{ id: "pka-quizzes", label: "Kuis PKA", href: "/admin/courses/tutorial-pka/quizzes", icon: ListChecks, group: "tutorial-pka" }');
      expect(sidebar).toContain('{ id: "pka-materials", label: "Materi PKA", href: "/admin/courses/tutorial-pka/documents", icon: FileText, group: "tutorial-pka" }');

      // Stale global URLs removed
      expect(sidebar).not.toContain("/admin/quizzes?courseId=tutorial-pka");
      expect(sidebar).not.toContain("/admin/materials?courseId=tutorial-pka");

      // Dedicated PKA admin tools preserved
      expect(sidebar).toContain('{ id: "pka-registrations", label: "Pendaftar PKA", href: "/admin/tutorial-pka/registrations"');
      expect(sidebar).toContain('{ id: "pka-announcements", label: "Pengumuman PKA", href: "/admin/tutorial-pka/announcements"');
      expect(sidebar).toContain('{ id: "pka-schedules", label: "Jadwal Live PKA", href: "/admin/tutorial-pka/schedules"');
    });
  });

  describe("7. Preservation of internal authoring helpers, MCP, and bundle lifecycle", () => {
    it("preserves MCP workflows and tool implementations", () => {
      expect(existsSync("lib/authoring/mcp-server.ts")).toBe(true);
      expect(existsSync("lib/authoring/mcp-workflows.ts")).toBe(true);
      expect(existsSync("lib/authoring/catalog.ts")).toBe(true);
      expect(existsSync("lib/authoring/context-pack.ts")).toBe(true);
      expect(existsSync("lib/authoring/job-pack.ts")).toBe(true);

      const mcpWorkflows = source("lib/authoring/mcp-workflows.ts");
      expect(mcpWorkflows).toContain("AUTHORING_MCP_VERSION");

      const mcpServer = source("lib/authoring/mcp-server.ts");
      expect(mcpServer).toContain("createAuthoringMcpServer");
    });

    it("preserves bundle staging and publication lifecycles", () => {
      expect(existsSync("lib/bundle/staging.ts")).toBe(true);
      expect(existsSync("lib/bundle/product-staging.ts")).toBe(true);
      expect(existsSync("lib/bundle/publication.ts")).toBe(true);
      expect(existsSync("lib/bundle/product-publication.ts")).toBe(true);

      const ideaStaging = source("lib/bundle/staging.ts");
      expect(ideaStaging).toContain("stageIdeaBundle");

      const ideaPublication = source("lib/bundle/publication.ts");
      expect(ideaPublication).toContain("publishIdeaBundle");

      const productStaging = source("lib/bundle/product-staging.ts");
      expect(productStaging).toContain("stageProductBundle");

      const productPublication = source("lib/bundle/product-publication.ts");
      expect(productPublication).toContain("publishProductBundle");
    });
  });

  describe("8. Byte-for-byte preservation of courses page", () => {
    it("renders CoursesDashboard and maintains assertAdmin guard", () => {
      const coursesPage = source("app/(admin)/admin/(academic)/courses/page.tsx");
      expect(coursesPage).toContain("<CoursesDashboard initialCourses={coursesList} />");
      expect(coursesPage).toContain("await assertAdmin()");
      expect(coursesPage).not.toContain("CoursesPageTabs");
    });
  });
});
