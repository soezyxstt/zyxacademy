"use client";

import { DocumentViewer } from "@/components/admin/document-viewer";

export function DocumentFixture() {
  return (
    <DocumentViewer
      file={{
        key: "visual.txt",
        name: "visual.txt",
        folderPath: "",
        size: 100,
        lastModified: "2026-10-25T00:00:00Z",
        kind: "text",
        url: "/visual-document.txt",
      }}
      onClose={() => {}}
    />
  );
}
