"use client";

import { useState } from "react";
import { AdminUploadDocumentDialog } from "@/components/admin/course-detail/admin-upload-document-dialog";
import { Button } from "@/components/ui/button";

const chapters = Array.from({ length: 6 }, (_, index) => ({
  id: `chapter-${index + 1}`,
  title: `Bab ${index + 1}`,
  orderIndex: index + 1,
}));

export default function AdminUploadFixture() {
  const [open, setOpen] = useState(false);
  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <Button onClick={() => setOpen(true)}>Unggah dokumen</Button>
      <AdminUploadDocumentDialog open={open} onOpenChange={setOpen} courseId="visual-math" courseTitle="Matematika" chapters={chapters} />
    </main>
  );
}
