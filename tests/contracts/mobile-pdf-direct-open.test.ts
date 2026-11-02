import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("mobile/tablet 1-step direct PDF opening contract", () => {
  it("HierarchyDocumentCard in course-documents-client opens PDF API link directly on mobile/tablet", () => {
    const src = source("app/(student)/courses/[id]/material/course-documents-client.tsx");
    expect(src).toContain("isMobileOrTablet()");
    expect(src).toContain("getViewablePdfUrl(");
    expect(src).toContain("window.open(viewPdfUrl, \"_blank\"");
  });

  it("DocumentItemWrapper in document-list-client opens PDF API link directly on mobile/tablet without 2-step modal", () => {
    const src = source("app/(student)/courses/[id]/material/document-list-client.tsx");
    expect(src).toContain("isMobileOrTablet()");
    expect(src).toContain("getViewablePdfUrl(");
    expect(src).toContain("window.open(viewPdfUrl, \"_blank\"");
    expect(src).not.toContain("<iframe");
  });

  it("MaterialViewer uses normalized viewable PDF URL for Buka Berkas Asli and renders mobile launcher card", () => {
    const src = source("components/course/material-viewer.tsx");
    expect(src).toContain("getViewablePdfUrl(material.url)");
    expect(src).toContain('t("reader.openOriginal")');
    expect(JSON.parse(source("messages/id/learning.json")).reader.openOriginal).toBe("Buka berkas asli");
    expect(src).toContain("Buka Dokumen PDF");
    expect(src).toContain("md:hidden");
  });

  it("PdfViewerModal renders desktop iframe with normalized URL and external link action", () => {
    const src = source("components/course/pdf-viewer-modal.tsx");
    expect(src).toContain("<iframe");
    expect(src).toContain("getViewablePdfUrl(material.url)");
    expect(src).toContain("Buka di tab baru");
  });
});
