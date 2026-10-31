"use client";

import { AdminDocumentWorkspace } from "@/components/admin/course-detail/admin-document-workspace";
import { useEffect, useState } from "react";

export default function DocumentWorkspaceFixture() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div data-fixture-ready={ready} className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <AdminDocumentWorkspace
        courseSlug="visual-math"
        courseTitle="Matematika"
        courseId="visual-math"
        materialId="visual-document"
        source="legacy-pdf"
        initialMode="edit"
        material={{ id: "visual-document", courseId: "visual-math", title: "Materi turunan dan penerapannya pada pemodelan matematika", kind: "pdf", completed: false, chapterIds: ["chapter-1"] }}
        chapters={[
          { id: "chapter-1", title: "Turunan dan penerapannya", orderIndex: 1 },
          { id: "chapter-2", title: "Aplikasi integral dalam pemodelan", orderIndex: 2 },
        ]}
      />
    </div>
  );
}
