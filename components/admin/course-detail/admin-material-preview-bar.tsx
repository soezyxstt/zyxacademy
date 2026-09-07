"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpenCheck, Pencil, Trash2 } from "lucide-react";
import { deleteCourseMaterial } from "@/app/(admin)/admin/(academic)/courses/actions";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { AdminMaterialSource } from "@/lib/admin/course-material-preview";

type Props = {
  source: AdminMaterialSource;
  materialId: string;
  courseSlug: string;
  title: string;
};

export function AdminMaterialPreviewBar({ source, materialId, courseSlug, title }: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const documentsHref = `/admin/courses/${encodeURIComponent(courseSlug)}/documents`;
  const editHref = `/admin/courses/${encodeURIComponent(courseSlug)}/documents/${encodeURIComponent(materialId)}?mode=edit`;
  const reviewHref = `/admin/courses/${encodeURIComponent(courseSlug)}/review?tab=product`;
  const canonical = source === "canonical-article" || source === "canonical-diktat";

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteCourseMaterial(materialId);
    setDeleting(false);
    if (!result.success) {
      toast.error(result.error ?? "Dokumen gagal dihapus.");
      return;
    }
    toast.success("Dokumen berhasil dihapus.");
    router.push(documentsHref);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Button asChild variant="ghost" size="sm" className="text-body-sm">
          <Link href={documentsHref}>
            <ArrowLeft className="size-4" />
            Dokumen
          </Link>
        </Button>
        <span className="min-w-0 flex-1 truncate text-body-xs text-muted-foreground">Preview admin: {title}</span>
        <Button asChild variant="outline" size="sm" className="text-body-sm">
          <Link href={editHref}>
            <Pencil className="size-4" />
            Edit dokumen
          </Link>
        </Button>
        {canonical ? (
          <Button asChild variant="outline" size="sm" className="text-body-sm">
            <Link href={reviewHref}>
              <BookOpenCheck className="size-4" />
              Kelola lifecycle
            </Link>
          </Button>
        ) : (
          <Button variant="destructive" size="sm" className="text-body-sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" />
            Hapus
          </Button>
        )}
      </div>
      <AdminConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Hapus dokumen PDF"
        description={`Dokumen ${title} akan dihapus dari mata kuliah ini.`}
        confirmLabel="Hapus"
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
