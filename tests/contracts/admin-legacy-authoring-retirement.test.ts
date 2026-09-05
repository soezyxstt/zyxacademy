import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Admin legacy authoring retirement", () => {
  it("redirects legacy pages to canonical workflows", () => {
    expect(source("app/(admin)/admin/(academic)/materials/page.tsx")).toContain(
      'redirect("/admin/materials/review?section=product")',
    );
    expect(source("app/(admin)/admin/(content)/diktats/page.tsx")).toContain(
      'redirect("/admin/materials/review?section=product")',
    );
    expect(source("app/(admin)/admin/(content)/assessments/page.tsx")).toContain(
      'redirect("/admin/questions")',
    );
    expect(source("app/(admin)/admin/(content)/assessments/[id]/page.tsx")).toContain(
      'redirect("/admin/questions")',
    );
  });

  it("returns an authenticated HTTP 410 from retired APIs", () => {
    const helper = source("lib/admin/legacy-authoring-retirement.ts");
    expect(helper).toContain("await assertAdmin()");
    expect(helper).toContain("{ status: 410 }");

    for (const path of [
      "app/api/admin/material-instances/route.ts",
      "app/api/admin/material-instances/[id]/retry/route.ts",
      "app/api/admin/assessments/[id]/route.ts",
      "app/api/admin/assessments/[id]/archive/route.ts",
      "app/api/admin/assessments/[id]/re-ingest/route.ts",
    ]) {
      expect(source(path)).toContain("retiredAdminAuthoringResponse");
    }
  });

  it("removes legacy bundle importers from the course admin tabs", () => {
    const tabs = source("components/admin/courses-page-tabs.tsx");
    expect(tabs).not.toContain("BundleImporterTab");
    expect(tabs).not.toContain("AssessmentBundleImporterTab");

    const actions = source("app/(admin)/admin/(academic)/courses/import-actions.ts");
    expect(actions).toContain("Legacy Learning Bundle importer retired.");
    expect(actions).toContain("Legacy Assessment Bundle importer retired.");
  });
});
