"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, BookOpen, FileText, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { reconstructLegacyMaterialMarkdown } from "@/packages/academic/tutor-legacy-materials";
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
  revision?: string;
}

interface Props {
  courseId: string;
  initialMaterials: MaterialInstance[];
  canManage: boolean;
}

export function MaterialsClient({ courseId, initialMaterials, canManage }: Props) {
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
    setRawText(reconstructLegacyMaterialMarkdown(m.sections ?? []));
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
          rawText,
          editingMaterial?.revision,
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
        const res = await deleteTutorMaterialAction(courseId, deleteId, initialMaterials.find(material => material.id === deleteId)?.revision);
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
    <div className="space-y-(--related-gap)">
      {/* Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
        <span className="inline-flex items-center gap-2 text-body-sm font-medium text-muted-foreground">
          <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>{t("materialsCount", { count: initialMaterials.length })}</span>
        </span>
        {canManage && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon-lg" aria-label={t("addMaterial")} onClick={handleOpenAdd}>
                  <Plus aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("addMaterial")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Grid List */}
      {initialMaterials.length === 0 ? (
        <AdminEmptyState compact icon={BookOpen} title={t("noMaterials")} />
      ) : (
        <div className="divide-y divide-border/30">
          {initialMaterials.map((m) => (
            <div key={m.id} className="flex min-w-0 items-start justify-between gap-(--compact-gap) py-3 sm:items-center">
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground sm:mt-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <h3 className="break-words font-heading text-body-sm font-bold text-foreground">{m.title}</h3>
                <p className="mt-0.5 line-clamp-2 break-words text-body-xs text-muted-foreground">{cleanSummary(m.summary)}</p>
              </div>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={m.title} className="size-9 shrink-0 rounded-lg text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onSelect={() => handleOpenEdit(m)}>
                      <Edit2 className="size-4 text-muted-foreground" />
                      <span>{t("edit")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setDeleteId(m.id)} className="text-status-error focus:text-status-error">
                      <Trash2 className="size-4" />
                      <span>{t("delete")}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog (full-height ergonomics on mobile) */}
      {canManage && <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col overflow-hidden rounded-2xl border-border bg-card max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:border-0">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {editingMaterial ? t("editMaterial") : t("addMaterial")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {t("markdownHelp")}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-(--related-gap) overflow-y-auto pr-1 font-sans">
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
                className="min-h-48 rounded-lg border-input bg-background font-mono text-body-sm leading-relaxed focus-visible:ring-brand-primary"
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-row flex-wrap justify-end gap-2 pb-[env(safe-area-inset-bottom)]">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isPending} className="rounded-md border-border/80">
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} isLoading={isPending} className="gap-1.5">
              {t("saveMaterial")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}

      {/* Delete Confirmation Dialog */}
      {canManage && <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">{t("deleteTitle", { title: initialMaterials.find((material) => material.id === deleteId)?.title ?? "" })}</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {t("deleteDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={isPending} className="rounded-md border-border/80">
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} isLoading={isPending} className="rounded-md font-semibold gap-1.5">
              {t("deleteMaterial")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
