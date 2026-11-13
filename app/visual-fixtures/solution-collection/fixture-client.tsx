"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CourseDocumentsClient } from "@/app/(student)/courses/[id]/material/course-documents-client";
import { DocumentListClient } from "@/app/(student)/courses/[id]/material/document-list-client";
import { SolutionCollectionReview } from "@/components/admin/solution-collection-review";
import { Button } from "@/components/ui/button";
import type { CourseMaterial } from "@/lib/student-course-fixtures";
import { solutionCollectionFixture } from "./fixture";

const materials: CourseMaterial[] = [{
  id: "collection-material", courseId: "course-foundations", title: "Pembahasan soal pilihan", kind: "solution_collection",
  docCategory: "solusi", tabGroup: "bank_soal", chapterId: "chapter-foundations", completed: false,
  href: "/visual-fixtures/solution-collection?from=catalogue",
}];
const chapters = [{ id: "chapter-foundations", title: "Penalaran dasar", orderIndex: 1 }];

export function CatalogueFixture({ hierarchy = false }: { hierarchy?: boolean }) {
  const props = { courseId: "course-foundations", courseTitle: "Dasar penalaran", materials, chapters };
  return <div className="mx-auto max-w-6xl p-4">{hierarchy ? <CourseDocumentsClient {...props} /> : <DocumentListClient {...props} defaultTab="bank_soal" />}</div>;
}

export function ReviewFixture() {
  const [checksum, setChecksum] = useState("revision-1");
  const [status, setStatus] = useState("draft");
  const [publicationReady, setPublicationReady] = useState(false);
  const [dependencyChanged, setDependencyChanged] = useState(false);
  const [lastAction, setLastAction] = useState("");
  return <div className="mx-auto max-w-7xl p-4">
    <div className="flex flex-wrap gap-2" aria-label="Fixture controls">
      <Button variant="outline" onClick={() => setChecksum("revision-2")}>Ganti revisi</Button>
      <Button variant="outline" onClick={() => setStatus("published")}>Status terbit</Button>
      <Button variant="outline" onClick={() => { setPublicationReady(true); setDependencyChanged(false); }}>Siap publikasi</Button>
      <Button variant="outline" onClick={() => { setDependencyChanged(true); setPublicationReady(false); }}>Referensi berubah</Button>
      {lastAction ? <span role="status">Aksi: {lastAction}</span> : null}
    </div>
    <SolutionCollectionReview collection={solutionCollectionFixture} importId="fixture-import" checksum={checksum} status={status} publicationReady={publicationReady} publicationIssues={[{ code: dependencyChanged ? "PRODUCT_V5_LIVE_DEPENDENCY_MISMATCH" : "PRODUCT_V5_REVIEW_REQUIRED", severity: "blocking" }]} saving={false}
      onRefresh={async () => { setLastAction("review"); }} onMutate={async (action) => { setLastAction(action); if (action === "publish") setStatus("published"); if (action === "withdraw") setStatus("draft"); }} />
  </div>;
}

export function FixtureSurface({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return <div data-fixture-hydrated={hydrated}>{children}</div>;
}
