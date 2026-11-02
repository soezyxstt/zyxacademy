"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpenCheck, Pencil, Trash2 } from "lucide-react";
import { deleteCourseMaterial } from "@/app/(admin)/admin/(academic)/courses/actions";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useTranslations } from "@/lib/i18n/client";
import type { AdminMaterialSource } from "@/lib/admin/course-material-preview";

type Props = {
  source: AdminMaterialSource;
  materialId: string;
  courseSlug: string;
  title: string;
};

export function AdminMaterialPreviewBar({ source, materialId, courseSlug, title }: Props) {
  const t = useTranslations("adminAcademic");
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
      toast.error(t("documents.errors.delete"));
      return;
    }
    toast.success(t("documents.success.delete"));
    router.push(documentsHref);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Button asChild variant="ghost" size="sm" className="text-body-sm">
          <Link href={documentsHref}>
            <ArrowLeft className="size-4" />
            {t("documents.previewBar.backToDocuments")}
          </Link>
        </Button>
        <span className="min-w-[140px] flex-1 break-words text-body-xs text-muted-foreground">{t("documents.previewBar.title", { title })}</span>
        <Button asChild variant="outline" size="sm" className="text-body-sm">
          <Link href={editHref}>
            <Pencil className="size-4" />
            {t("documents.previewBar.edit")}
          </Link>
        </Button>
        {canonical ? (
          <Button asChild variant="outline" size="sm" className="text-body-sm">
            <Link href={reviewHref}>
              <BookOpenCheck className="size-4" />
              {t("documents.previewBar.manageLifecycle")}
            </Link>
          </Button>
        ) : (
          <Button variant="destructive" size="sm" className="text-body-sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" />
            {t("documents.previewBar.delete")}
          </Button>
        )}
      </div>
      <AdminConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("documents.previewBar.deleteTitle")}
        description={t("documents.previewBar.deleteDescription", { title })}
        confirmLabel={t("documents.previewBar.delete")}
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
