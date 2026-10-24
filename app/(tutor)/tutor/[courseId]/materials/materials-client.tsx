"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, BookOpen, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { saveTutorMaterialAction, deleteTutorMaterialAction } from "@/app/actions/tutor-management";
import { cleanSummary } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

interface MaterialChunk {
  chunkText: string;
  orderIndex: number;
}

interface MaterialSection {
  title: string | null;
  orderIndex: number;
  chunks: MaterialChunk[];
}

interface MaterialInstance {
  id: string;
  courseId: string;
  title: string;
  summary: string;
  createdAt: Date;
  sections?: MaterialSection[];
}

interface Props {
  courseId: string;
  initialMaterials: MaterialInstance[];
}

function reconstructMarkdown(material: MaterialInstance): string {
  if (!material.sections) return "";
  return material.sections
    .map((s) => {
      const sectionTitle = s.title ? `## ${s.title}\n\n` : "";
      const content = (s.chunks || []).map((c) => c.chunkText).join("\n\n");
      return sectionTitle + content;
    })
    .join("\n\n");
}

export function MaterialsClient({ courseId, initialMaterials }: Props) {
  const t = useTranslations("tutor.materials");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [isOpen, setIsOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<MaterialInstance | null>(null);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [rawText, setRawText] = useState("");

  const [deleteId, setDeleteId] = useState<string | null>(null);

  function handleOpenAdd() {
    setEditingMaterial(null);
    setTitle("");
    setSummary("");
    setRawText("");
    setIsOpen(true);
  }

  function handleOpenEdit(m: MaterialInstance) {
    setEditingMaterial(m);
    setTitle(m.title);
    setSummary(m.summary);
    setRawText(reconstructMarkdown(m));
    setIsOpen(true);
  }

  async function handleSave() {
    if (!title.trim() || !summary.trim() || !rawText.trim()) {
      toast.error(t("requiredFields"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await saveTutorMaterialAction(
          courseId,
          editingMaterial ? editingMaterial.id : null,
          title,
          summary,
          rawText
        );
        if (res.success) {
          toast.success(editingMaterial ? t("updated") : t("added"));
          setIsOpen(false);
          router.refresh();
        }
      } catch {
        toast.error(t("saveFailed"));
      }
    });
  }

  async function handleDelete() {
    if (!deleteId) return;

    startTransition(async () => {
      try {
        const res = await deleteTutorMaterialAction(courseId, deleteId);
        if (res.success) {
          toast.success(t("deleted"));
          setDeleteId(null);
          router.refresh();
        }
      } catch {
        toast.error(t("deleteFailed"));
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Action Row */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="font-heading text-body-base font-semibold text-foreground">{t("materialsCount", { count: initialMaterials.length })}</h2>
        <Button onClick={handleOpenAdd} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-2">
          <Plus className="size-4" />
          {t("addMaterial")}
        </Button>
      </div>

      {/* Grid List */}
      {initialMaterials.length === 0 ? (
        <AdminEmptyState icon={BookOpen} title={t("noMaterials")} action={<Button onClick={handleOpenAdd} size="sm"><Plus className="size-4" />{t("addMaterial")}</Button>} />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {initialMaterials.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <FileText className="size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1 basis-40">
                <h3 className="font-heading text-body-sm font-bold text-foreground break-words">{m.title}</h3>
                <p className="mt-0.5 text-body-xs text-muted-foreground line-clamp-2">{cleanSummary(m.summary)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => handleOpenEdit(m)}><Edit2 className="size-3.5" />{t("edit")}</Button>
                <Button variant="outline" size="sm" onClick={() => setDeleteId(m.id)} className="text-destructive"><Trash2 className="size-3.5" />{t("delete")}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {editingMaterial ? t("editMaterial") : t("addMaterial")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {t("markdownHelp")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4 font-sans">
            <div className="grid gap-2">
              <Label htmlFor="title" className="text-body-sm font-semibold">{t("title")}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                className="rounded-lg border-input bg-background focus-visible:ring-brand-primary"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="summary" className="text-body-sm font-semibold">{t("summary")}</Label>
              <Input
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={t("summaryPlaceholder")}
                className="rounded-lg border-input bg-background focus-visible:ring-brand-primary"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="content" className="text-body-sm font-semibold">{t("contentMarkdown")}</Label>
              <Textarea
                id="content"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={12}
                placeholder={t("contentPlaceholder")}
                className="rounded-lg border-input bg-background font-mono text-body-xs leading-relaxed focus-visible:ring-brand-primary"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isPending} className="rounded-md border-border/80">
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} isLoading={isPending} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-1.5">
              {t("saveMaterial")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">{t("deleteTitle", { title: initialMaterials.find((material) => material.id === deleteId)?.title ?? "" })}</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {t("deleteDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={isPending} className="rounded-md border-border/80">
              {t("cancel")}
            </Button>
            <Button onClick={handleDelete} isLoading={isPending} className="bg-status-error hover:bg-status-error/90 text-white rounded-md font-semibold gap-1.5">
              {t("deleteMaterial")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
