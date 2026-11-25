import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  auditUiSeparation,
  DESKTOP_ONLY_PRIMITIVES,
  formatUiSeparationViolations,
} from "../../scripts/audit-ui-separation";

function writeFixtureFile(rootDir: string, relativePath: string, content: string): void {
  const fullPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

describe("audit-ui-separation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-ui-separation-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("passes cleanly when features directory does not exist", () => {
    const result = auditUiSeparation(tempDir);
    expect(result.auditedFiles).toBe(0);
    expect(result.violations).toEqual([]);
  });

  test("passes cleanly on a valid features/<name>/{data,model,ui/{shared,desktop,mobile}} layout", () => {
    writeFixtureFile(
      tempDir,
      "features/courses/data/queries.ts",
      `import { db } from "@/db";\nexport const loadCourses = () => db;\n`,
    );
    writeFixtureFile(
      tempDir,
      "features/courses/model/types.ts",
      `export interface CourseItem { id: string; title: string }\n`,
    );
    writeFixtureFile(
      tempDir,
      "features/courses/ui/shared/course-badge.tsx",
      `import type { CourseItem } from "../../model/types";\nexport function CourseBadge({ item }: { item: CourseItem }) { return item.title; }\n`,
    );
    writeFixtureFile(
      tempDir,
      "features/courses/ui/desktop/course-table.tsx",
      [
        `import { Table } from "@/components/ui/table";`,
        `import { CourseBadge } from "../shared/course-badge";`,
        `import { loadCourses } from "../../data/queries";`,
        `import type { CourseItem } from "../../model/types";`,
        `// Mentioning @/db or ../mobile/course-list in comments must be ignored.`,
        `/* import { db } from "@/db"; */`,
        `export function CourseTable() { return { Table, CourseBadge, loadCourses }; }`,
      ].join("\n"),
    );
    writeFixtureFile(
      tempDir,
      "features/courses/ui/mobile/course-list.tsx",
      [
        `import { Button } from "@/components/ui/button";`,
        `import { CourseBadge } from "../shared/course-badge";`,
        `import { loadCourses } from "../../data/queries";`,
        `import type { CourseItem } from "../../model/types";`,
        `// Mentioning ../desktop/course-table in comments must be ignored.`,
        `export function CourseList() { return { Button, CourseBadge, loadCourses }; }`,
      ].join("\n"),
    );

    const result = auditUiSeparation(tempDir);
    expect(result.auditedFiles).toBe(2);
    expect(result.violations).toEqual([]);
  });

  test("catches mobile importing desktop via alias and relative path with accurate line numbers", () => {
    writeFixtureFile(
      tempDir,
      "features/courses/ui/mobile/course-list.tsx",
      [
        `import { Button } from "@/components/ui/button";`,
        `import { CourseTable } from "../desktop/course-table";`,
        `import { OtherDesktop } from "@/features/admin/ui/desktop/panel";`,
        `export const x = [Button, CourseTable, OtherDesktop];`,
      ].join("\n"),
    );

    const result = auditUiSeparation(tempDir);
    expect(result.auditedFiles).toBe(1);
    expect(result.violations).toHaveLength(2);

    expect(result.violations[0]).toMatchObject({
      file: "features/courses/ui/mobile/course-list.tsx",
      line: 2,
      imported: "../desktop/course-table",
      rule: "cross-surface-import",
    });
    expect(result.violations[1]).toMatchObject({
      file: "features/courses/ui/mobile/course-list.tsx",
      line: 3,
      imported: "@/features/admin/ui/desktop/panel",
      rule: "cross-surface-import",
    });
  });

  test("catches desktop importing mobile via alias and relative path", () => {
    writeFixtureFile(
      tempDir,
      "features/courses/ui/desktop/course-table.tsx",
      [
        `import { CourseList } from "../mobile/course-list";`,
        `import { MobileSheet } from "@/features/discussions/ui/mobile/sheet";`,
        `export const y = [CourseList, MobileSheet];`,
      ].join("\n"),
    );

    const result = auditUiSeparation(tempDir);
    expect(result.violations).toHaveLength(2);
    expect(result.violations[0]).toMatchObject({
      file: "features/courses/ui/desktop/course-table.tsx",
      line: 1,
      imported: "../mobile/course-list",
      rule: "cross-surface-import",
    });
    expect(result.violations[1]).toMatchObject({
      file: "features/courses/ui/desktop/course-table.tsx",
      line: 2,
      imported: "@/features/discussions/ui/mobile/sheet",
      rule: "cross-surface-import",
    });
  });

  test("catches mobile importing every desktop-only primitive", () => {
    const lines = DESKTOP_ONLY_PRIMITIVES.map(
      (primitive, index) => `import * as P${index} from "@/${primitive}";`,
    );
    lines.push(`import { Table } from "../../../../components/ui/table";`);
    writeFixtureFile(tempDir, "features/admin/ui/mobile/users-view.tsx", lines.join("\n"));

    const result = auditUiSeparation(tempDir);
    expect(result.violations).toHaveLength(DESKTOP_ONLY_PRIMITIVES.length + 1);
    for (let i = 0; i < result.violations.length; i += 1) {
      expect(result.violations[i].rule).toBe("mobile-desktop-primitive");
      expect(result.violations[i].line).toBe(i + 1);
    }
  });

  test("catches direct @/db imports in both mobile and desktop UI including dynamic imports and re-exports", () => {
    writeFixtureFile(
      tempDir,
      "features/quiz/ui/mobile/player.tsx",
      [
        `import { db } from "@/db";`,
        `export { users } from "@/db/schema";`,
        `export const lazy = () => import("@/db/index");`,
      ].join("\n"),
    );
    writeFixtureFile(
      tempDir,
      "features/quiz/ui/desktop/player.tsx",
      [
        `import type { Database } from "@/db";`,
        `import { courses } from "../../../../db/schema";`,
      ].join("\n"),
    );

    const result = auditUiSeparation(tempDir);
    expect(result.violations).toHaveLength(5);
    expect(result.violations.every((v) => v.rule === "ui-direct-db-import")).toBe(true);

    const formatted = formatUiSeparationViolations(result.violations);
    expect(formatted).toContain("features/quiz/ui/mobile/player.tsx:1:");
    expect(formatted).toContain("features/quiz/ui/desktop/player.tsx:2:");
  });
});
