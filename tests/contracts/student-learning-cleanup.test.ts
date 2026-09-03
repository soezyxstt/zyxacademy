import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("student learning cleanup", () => {
  it("does not render the weak concept quiz banner or tryout attempt banner", () => {
    expect(source("app/(student)/courses/[id]/quiz/page.tsx")).not.toContain("Fokuskan latihan di konsep terlemahmu");
    expect(source("app/(student)/courses/[id]/tryout/tryout-list-client.tsx")).not.toContain("Maksimal 2 kali pengumpulan");
  });

  it("keeps Zyra out of the student sidebar and thumbnails free of iframes", () => {
    expect(source("components/student-sidebar.tsx")).not.toContain("Tanya Zyra");
    expect(source("app/(student)/courses/[id]/material/document-list-client.tsx")).not.toContain("<iframe");
  });
});
