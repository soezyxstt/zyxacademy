"use client";

import { useState } from "react";
import { MaterialBundleUploadDialog } from "@/components/admin/material-bundle-upload-dialog";
import { Button } from "@/components/ui/button";

export default function MaterialBundleUploadFixture() {
  const [open, setOpen] = useState(false);
  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <Button onClick={() => setOpen(true)}>Unggah bundle</Button>
      <MaterialBundleUploadDialog kind="idea" open={open} onOpenChange={setOpen} onStaged={() => {}} />
    </main>
  );
}
